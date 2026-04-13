import json
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db, AsyncSessionLocal
from app.models import Email, Transaction, SenderRule, Label
from app.classifier.classifier import classify_email
from app.classifier.rules import diagnose_email
from app.classifier.llm_client import llm_client

router = APIRouter()


@router.get("/emails")
async def list_emails(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .order_by(desc(Email.received_at))
    )
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
            "txn_id": t.id if t else None,
            "label": t.label if t else None,
            "status": t.status if t else None,
            "amount": float(t.amount) if t and t.amount is not None else None,
            "merchant": t.merchant if t else None,
            "category": t.category if t else None,
        }
        for e, t in rows
    ]


class RetrainPayload(BaseModel):
    email_ids: List[str]


@router.post("/emails/retrain")
async def retrain_rules(payload: RetrainPayload, db: AsyncSession = Depends(get_db)):
    """
    For each selected email, upsert a SenderRule from its current transaction label.
    Emails with no transaction or label='ignore' are skipped unless they already
    have a rule — in that case the rule is updated to ignore.
    """
    from app.models import RuleSource

    email_q = await db.execute(
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .where(Email.id.in_(payload.email_ids))
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
            select(SenderRule).where(SenderRule.sender_domain == domain)
        )).scalar_one_or_none()

        if existing:
            existing.label = txn.label
            existing.category = txn.category or existing.category
            existing.source = RuleSource.user_trained.value
        else:
            db.add(SenderRule(
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
    method: str = "rules"           # "rules" or "llm"
    hints: Dict[str, str] = {}      # email_id → free-text hint injected into LLM prompt


@router.post("/emails/reclassify")
async def reclassify_emails(payload: ReclassifyPayload):

    async def generate():
        async with AsyncSessionLocal() as db:
            rules_result = await db.execute(select(SenderRule))
            db_rules = {
                r.sender_domain: (Label(r.label), r.category)
                for r in rules_result.scalars().all()
            }

            total = len(payload.email_ids)
            yield _sse({"type": "start", "message": f"▶ {payload.method.upper()} run on {total} email(s)"})
            yield _sse({"type": "divider", "message": "─" * 60})

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
                if hint:
                    yield _sse({"type": "match", "message": f"    Hint   : {hint}"})

                # ── Rule diagnostic (always) ─────────────────────────────
                diag = diagnose_email(
                    sender_domain=email.sender_domain or "",
                    subject=email.subject or "",
                    body_snippet=email.body_snippet or "",
                    db_rules=db_rules,
                )

                yield _sse({"type": "section", "message": "  ── Rule Engine ──"})
                dr = diag["domain_rule"]

                if dr["matched"]:
                    src = f"[{dr['source']}]"
                    yield _sse({"type": "match",
                                "message": f"  ✓ Domain match {src}: {dr['label']} / {dr['category']} (conf 0.95)"})
                else:
                    yield _sse({"type": "dim",
                                "message": f"  ✗ No domain rule for '{diag['domain']}'"})
                    text_prev = diag["text_checked"][:140].replace("\n", " ")
                    yield _sse({"type": "dim", "message": f"  Text   : \"{text_prev}…\""})

                    for bucket, color in [("expense", "match"), ("income", "income"), ("ignore", "dim")]:
                        bkt = diag[bucket]
                        kw_str = ", ".join(f'"{k}"' for k in bkt["matched"]) if bkt["matched"] else "none"
                        tick = "✓" if bkt["matched"] else "✗"
                        yield _sse({"type": color if bkt["matched"] else "dim",
                                    "message": f"  {tick} {bucket:7s} ({bkt['count']} hit) : {kw_str}"})

                    thr = diag["thresholds"]
                    yield _sse({"type": "dim",
                                "message": f"  Thresholds : min_hits={thr['keyword_min_hits']}, domain_conf={thr['domain_confidence']}"})

                # ── LLM path ────────────────────────────────────────────
                if payload.method == "llm":
                    yield _sse({"type": "section", "message": "  ── LLM ──"})
                    # Inject hint into body snippet if provided
                    effective_body = (email.body_snippet or "")
                    if hint:
                        effective_body += f"\n\n[User note: {hint}]"

                    try:
                        if dr["matched"] and dr["label"] in ("expense", "income"):
                            llm_v = await llm_client.extract_verbose(
                                label=dr["label"],
                                sender=email.sender or "",
                                subject=email.subject or "",
                                body_snippet=effective_body,
                            )
                            yield _sse({"type": "dim", "message": "  Mode : extraction-only (domain rule confirmed label)"})
                        else:
                            llm_v = await llm_client.classify_verbose(
                                sender=email.sender or "",
                                subject=email.subject or "",
                                body_snippet=effective_body,
                            )
                            yield _sse({"type": "dim", "message": "  Mode : full classify + extract"})

                        yield _sse({"type": "dim",
                                    "message": f"  Provider : {llm_v['provider']} ({llm_v['model']})"})

                        yield _sse({"type": "section", "message": "  ── Prompt sent ──"})
                        for line in llm_v["prompt"].split("\n"):
                            yield _sse({"type": "prompt", "message": "  │ " + line})

                        yield _sse({"type": "section", "message": "  ── Raw response ──"})
                        yield _sse({"type": "raw", "message": "  │ " + llm_v["raw_response"]})

                    except Exception as llm_exc:
                        yield _sse({"type": "error", "message": f"  ✗ LLM error: {llm_exc}"})

                # ── Classify + persist ───────────────────────────────────
                try:
                    effective_body_for_cls = (email.body_snippet or "")
                    if hint:
                        effective_body_for_cls += f"\n\n[User note: {hint}]"

                    cls = await classify_email(
                        sender=email.sender or "",
                        sender_domain=email.sender_domain or "",
                        subject=email.subject or "",
                        body_snippet=effective_body_for_cls,
                        db_rules=db_rules,
                        force_extraction=(payload.method == "llm"),
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
                            amount=cls.amount,
                            merchant=cls.merchant,
                            category=cls.category,
                            confidence=cls.confidence,
                            classifier_method=cls.classifier_method.value,
                            txn_date=cls.txn_date,
                            status=cls.status.value,
                        )
                        db.add(txn)
                        label_changed = True

                    await db.flush()
                    # refresh to get assigned id if new
                    if not txn.id:
                        await db.refresh(txn)

                    amt_str = f"₹{cls.amount:,.2f}" if cls.amount else "—"
                    change_note = f"  (was: {old_label})" if label_changed and old_label else ""

                    yield _sse({"type": "section", "message": "  ── Result ──"})
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

                    # Action widget — let user fix inline
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
