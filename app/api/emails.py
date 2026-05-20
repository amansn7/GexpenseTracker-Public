import json
import logging
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends

log = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.auth_deps import get_current_user
from app.database import get_db, AsyncSessionLocal
from app.models import Email, Transaction, SenderRule, Label, User
from app.classifier.classifier import classify_email
from app.services.llm_service import get_user_llm_client


def _body(email: Email) -> str:
    return email.body_text or email.body_snippet or ""

router = APIRouter()


@router.get("/emails")
async def list_emails(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)
        .order_by(desc(Email.received_at))
    )
    if status:
        q = q.where(Email.pre_filter_status == status)
    result = await db.execute(q)
    rows = result.all()

    return [
        {
            "id": e.id,
            "gmail_id": e.gmail_id,
            "subject": e.subject,
            "sender": e.sender,
            "sender_domain": e.sender_domain,
            "received_at": e.received_at.isoformat() if e.received_at else None,
            "body_snippet": e.body_snippet,
            "body_text": e.body_text,
            "gmail_link": e.gmail_link,
            "pre_filter_status": e.pre_filter_status,
            "txn_id": t.id if t else None,
            "label": t.label if t else None,
            "status": t.status if t else None,
            "amount": float(t.amount) if t and t.amount is not None else None,
            "merchant": t.merchant if t else None,
            "category": t.category if t else None,
            "classifier_method": t.classifier_method if t else None,
        }
        for e, t in rows
    ]


@router.post("/emails/{email_id}/fetch-body")
async def fetch_email_body(
    email_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-fetch clean body text for an email from Gmail API."""
    import asyncio
    from app.gmail.auth import get_credentials_for_user
    from app.gmail.client import _build_service, _extract_body_text
    from fastapi import HTTPException

    email = (await db.execute(
        select(Email).where(Email.id == email_id, Email.user_id == current_user.id)
    )).scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    creds = await get_credentials_for_user(db, current_user.id)
    if not creds:
        raise HTTPException(status_code=503, detail="Gmail not authenticated")
    service = await asyncio.to_thread(_build_service, creds)

    try:
        msg = await asyncio.to_thread(
            lambda eid=email.gmail_id: service.users().messages().get(
                userId="me", id=eid, format="full"
            ).execute()
        )
        body = _extract_body_text(msg.get("payload", {}))
        if body:
            email.body_text = body
            await db.commit()
            return {"body_text": body, "body_chars": len(body)}
        return {"body_text": email.body_text or "", "body_chars": len(email.body_text or ""), "note": "Could not extract body from Gmail"}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gmail fetch failed: {str(exc)}")


class ReviewAction(BaseModel):
    action: str  # "keep" | "discard"


@router.post("/emails/{email_id}/review")
async def review_email(
    email_id: str,
    payload: ReviewAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models import FilterRule
    from fastapi import HTTPException

    email = (await db.execute(
        select(Email).where(Email.id == email_id, Email.user_id == current_user.id)
    )).scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    if payload.action == "keep":
        from app.classifier.context import ClassificationContext
        from app.classifier.classifier import classify_email
        result = await classify_email(
            ClassificationContext(
                email_id=email.id,
                sender=email.sender or "",
                sender_domain=email.sender_domain or "",
                subject=email.subject or "",
                body_text=email.body_text or email.body_snippet or "",
                session=db,
                user_id=current_user.id,
            )
        )
        txn = Transaction(
            email_id=email.id,
            label=result.label,
            transaction_type=result.transaction_type,
            payment_mode=result.payment_mode,
            amount=result.amount,
            currency=result.currency,
            merchant=result.merchant,
            category=result.category,
            confidence=result.confidence,
            classifier_method=result.classifier_method,
        )
        db.add(txn)
        email.pre_filter_status = "passed"

        if email.sender_domain:
            existing_rule = (await db.execute(
                select(FilterRule).where(
                    FilterRule.rule_type == "allowlist_domain",
                    FilterRule.value == email.sender_domain,
                    FilterRule.source == "user",
                    FilterRule.user_id == current_user.id,
                )
            )).scalar_one_or_none()
            if existing_rule:
                existing_rule.hit_count += 1
            else:
                db.add(FilterRule(
                    rule_type="allowlist_domain",
                    value=email.sender_domain,
                    source="user",
                    user_id=current_user.id,
                ))

    elif payload.action == "discard":
        email.pre_filter_status = "discarded"

        if email.sender_domain:
            existing_rule = (await db.execute(
                select(FilterRule).where(
                    FilterRule.rule_type == "blocklist_domain",
                    FilterRule.value == email.sender_domain,
                    FilterRule.source == "user",
                    FilterRule.user_id == current_user.id,
                )
            )).scalar_one_or_none()
            if existing_rule:
                existing_rule.hit_count += 1
            else:
                db.add(FilterRule(
                    rule_type="blocklist_domain",
                    value=email.sender_domain,
                    source="user",
                    user_id=current_user.id,
                ))
    else:
        raise HTTPException(status_code=400, detail="action must be 'keep' or 'discard'")

    await db.commit()
    return {"ok": True, "status": email.pre_filter_status}


class RetrainPayload(BaseModel):
    email_ids: List[str]


@router.post("/emails/retrain")
async def retrain_rules(payload: RetrainPayload, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    For each selected email, upsert a SenderRule from its current transaction label.
    Emails with no transaction or label='ignore' are skipped unless they already
    have a rule — in that case the rule is updated to ignore.
    """
    from app.models import RuleSource

    email_q = await db.execute(
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .where(Email.id.in_(payload.email_ids), Email.user_id == current_user.id)
    )
    rows = email_q.all()

    saved, skipped = [], []
    for email, txn in rows:
        domain = email.sender_domain or ""
        if not domain:
            skipped.append({"id": email.id, "reason": "no sender domain"})
            continue
        if not txn:
            skipped.append({"id": email.id, "subject": email.subject, "reason": "no transaction"})
            continue

        existing = (await db.execute(
            select(SenderRule).where(
                SenderRule.sender_domain == domain,
                SenderRule.user_id == current_user.id,
            )
        )).scalar_one_or_none()

        if existing:
            existing.label = txn.label
            existing.category = txn.category or existing.category
            existing.source = RuleSource.user_trained.value
        else:
            db.add(SenderRule(
                user_id=current_user.id,
                sender_domain=domain,
                label=txn.label,
                category=txn.category,
                source=RuleSource.user_trained.value,
            ))

        saved.append({
            "domain": domain,
            "label": txn.label,
            "category": txn.category,
            "subject": email.subject,
            "was_existing": bool(existing),
        })

    await db.commit()
    return {"saved": saved, "skipped": skipped}


class ReclassifyPayload(BaseModel):
    email_ids: List[str]
    method: str = "llm"
    hints: Dict[str, str] = {}


@router.post("/emails/reclassify")
async def reclassify_emails(payload: ReclassifyPayload, current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    async def generate():
        async with AsyncSessionLocal() as db:
            total = len(payload.email_ids)
            yield _sse({"type": "start", "message": f"▶ LLM reclassify on {total} email(s)"})
            yield _sse({"type": "divider", "message": "─" * 60})

            # Load user's active AI service
            from app.models import UserSettings
            from sqlalchemy import select as _select
            user_settings = (await db.execute(
                _select(UserSettings).where(UserSettings.user_id == user_id)
            )).scalar_one_or_none()

            user_llm_client = None
            if user_settings and user_settings.active_ai_service_id:
                user_llm_client = await get_user_llm_client(user_id, db)
                if user_llm_client:
                    yield _sse({"type": "dim", "message": f"Using AI service: {user_settings.active_ai_service_id}"})

            ok = 0
            changed = 0

            for i, email_id in enumerate(payload.email_ids):
                email_q = await db.execute(select(Email).where(Email.id == email_id))
                email = email_q.scalar_one_or_none()
                if not email:
                    yield _sse({"type": "error", "message": f"[{i+1}/{total}] NOT FOUND: {email_id}"})
                    continue

                short = (email.subject or "(no subject)")[:72]
                yield _sse({"type": "processing", "message": f"\n[{i+1}/{total}] {short}"})
                yield _sse({"type": "dim", "message": f"    From   : {email.sender or '—'}"})
                yield _sse({"type": "dim", "message": f"    Domain : {email.sender_domain or '—'}"})

                hint = payload.hints.get(email_id, "").strip()
                body_text = _body(email)
                if hint:
                    yield _sse({"type": "match", "message": f"    Hint   : {hint}"})
                    body_text += f"\n\n[User note: {hint}]"

                try:
                    from app.classifier.context import ClassificationContext
                    from app.classifier.classifier import classify_email
                    cls = await classify_email(
                        ClassificationContext(
                            email_id=email.id,
                            sender=email.sender or "",
                            sender_domain=email.sender_domain or "",
                            subject=email.subject or "",
                            body_text=body_text,
                            session=db,
                            user_id=user_id,
                            llm_client_override=user_llm_client,
                            rule_engine_enabled=False,
                        )
                    )

                    txn_q = await db.execute(
                        select(Transaction).where(Transaction.email_id == email.id)
                    )
                    txn = txn_q.scalar_one_or_none()

                    if txn:
                        old_label = txn.label
                        txn.label = cls.label.value
                        txn.amount = cls.amount
                        txn.merchant = cls.merchant
                        txn.category = cls.category
                        txn.confidence = cls.confidence
                        txn.classifier_method = cls.classifier_method.value
                        if cls.txn_date:
                            txn.txn_date = cls.txn_date
                        txn.status = cls.status.value
                        label_changed = old_label != cls.label.value
                    else:
                        old_label = None
                        txn = Transaction(
                            email_id=email.id,
                            label=cls.label.value,
                            transaction_type=cls.transaction_type,
                            payment_mode=cls.payment_mode,
                            amount=cls.amount,
                            merchant=cls.merchant,
                            category=cls.category,
                            confidence=cls.confidence,
                            classifier_method=cls.classifier_method.value,
                            txn_date=cls.txn_date,
                            status=cls.status.value,
                            currency=cls.currency,
                        )
                        db.add(txn)
                        label_changed = True

                    await db.flush()
                    if not txn.id:
                        await db.refresh(txn)

                    # Auto-upsert SenderRule for high-confidence results
                    rule_saved_msg = ""
                    domain = email.sender_domain or ""
                    if domain and cls.confidence >= 0.75 and cls.label.value in ("expense", "income"):
                        from app.models import RuleSource
                        existing_rule = (await db.execute(
                            select(SenderRule).where(
                                SenderRule.sender_domain == domain,
                                SenderRule.user_id == user_id,
                            )
                        )).scalar_one_or_none()
                        if existing_rule:
                            existing_rule.label = cls.label.value
                            existing_rule.category = cls.category or existing_rule.category
                            existing_rule.source = RuleSource.user_trained.value
                            rule_saved_msg = f"  ✦ domain rule updated: {domain} → {cls.label.value}"
                        else:
                            db.add(SenderRule(
                                user_id=user_id,
                                sender_domain=domain,
                                label=cls.label.value,
                                category=cls.category,
                                source=RuleSource.user_trained.value,
                            ))
                            rule_saved_msg = f"  ✦ domain rule created: {domain} → {cls.label.value}"

                    # Flush fuzzy-learned merchant aliases
                    try:
                        from app.classifier.merchant import learn_pending_aliases
                        await learn_pending_aliases(db)
                    except Exception as _me:
                        log.warning("merchant alias flush failed: %s", _me)

                    amt_str = f"₹{cls.amount:,.2f}" if cls.amount else "—"
                    change_note = f"  (was: {old_label})" if label_changed and old_label else ""

                    yield _sse({"type": "section", "message": "  ── Result ──"})
                    if rule_saved_msg:
                        yield _sse({"type": "match", "message": rule_saved_msg})
                    yield _sse({
                        "type": "result",
                        "email_id": email_id,
                        "label": cls.label.value,
                        "amount": cls.amount,
                        "category": cls.category,
                        "merchant": cls.merchant,
                        "message": (
                            f"  → {cls.label.value.upper()} | {amt_str}"
                            f" | merchant={cls.merchant or '—'}"
                            f" | cat={cls.category or '—'}"
                            f" | conf={cls.confidence:.0%} via {cls.classifier_method.value}"
                            f"{change_note}"
                        ),
                    })

                    yield _sse({
                        "type": "action",
                        "email_id": email_id,
                        "txn_id": txn.id,
                        "domain": email.sender_domain or "",
                        "current_label": cls.label.value,
                        "current_category": cls.category or "",
                        "current_merchant": cls.merchant or "",
                        "current_amount": cls.amount,
                    })

                    ok += 1
                    if label_changed:
                        changed += 1

                except Exception as exc:
                    yield _sse({"type": "error", "message": f"  ✗ Error: {exc}"})

                yield _sse({"type": "divider", "message": "─" * 60})

            await db.commit()
            yield _sse({
                "type": "complete",
                "message": f"\n✓ Done — {ok}/{total} processed, {changed} label(s) changed.",
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
