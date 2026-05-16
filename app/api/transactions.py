import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, extract, or_, delete
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import date
from app.auth_deps import get_current_user
from app.database import get_db
from app.dedup.service import detect_and_record_duplicates
from app.models import Transaction, Email, SenderRule, Label, TransactionStatus, RuleSource, ClassificationLog, User, TransactionCorrection
from app.classifier.merchant_store import merchant_store
router = APIRouter()

class TransactionPatch(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    user_notes: Optional[str] = None
    read: Optional[bool] = None
    flagged: Optional[bool] = None
    status: Optional[str] = None

    def validate(self) -> None:
        if self.merchant and len(self.merchant) > 255:
            raise ValueError("Merchant name must be 255 characters or less")
        if self.category and len(self.category) > 100:
            raise ValueError("Category must be 100 characters or less")
        if self.user_notes and len(self.user_notes) > 1000:
            raise ValueError("Notes must be 1000 characters or less")
        if self.merchant:
            self.merchant = "".join(c for c in self.merchant if ord(c) >= 32 and ord(c) != 127)
        if self.category:
            self.category = "".join(c for c in self.category if ord(c) >= 32 and ord(c) != 127)
        if self.user_notes:
            self.user_notes = "".join(c for c in self.user_notes if ord(c) >= 32 and ord(c) != 127)


class BulkAction(BaseModel):
    ids: List[str] = []
    action: Literal["mark_read", "mark_unread", "flag", "unflag", "delete", "detect_duplicates"]
    select_all: bool = False


@router.post("/transactions/bulk")
async def bulk_transactions(
    payload: BulkAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.select_all:
        rows = (await db.execute(
            select(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(Email.user_id == current_user.id)
            .options(selectinload(Transaction.email))
        )).scalars().all()
    else:
        rows = (await db.execute(
            select(Transaction)
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.id.in_(payload.ids), Email.user_id == current_user.id)
            .options(selectinload(Transaction.email))
        )).scalars().all()

    if payload.action == "mark_read":
        for t in rows:
            t.read = True
    elif payload.action == "mark_unread":
        for t in rows:
            t.read = False
    elif payload.action == "flag":
        for t in rows:
            t.flagged = True
    elif payload.action == "unflag":
        for t in rows:
            t.flagged = False
    elif payload.action == "delete":
        for t in rows:
            if t.email_id:
                email = (await db.execute(
                    select(Email).where(Email.id == t.email_id)
                )).scalar_one_or_none()
                if email:
                    await db.execute(delete(ClassificationLog).where(ClassificationLog.email_id == t.email_id))
                    await db.delete(email)
                t.email_id = None
    elif payload.action == "detect_duplicates":
        for t in rows:
            await detect_and_record_duplicates(t, t.email, db)

    await db.commit()
    return {"updated": len(rows)}

def _fmt(t: Transaction, e: "Email | None") -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "transaction_type": t.transaction_type,
        "amount": float(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
        "user_notes": t.user_notes,
        "read": bool(t.read),
        "flagged": bool(t.flagged),
        "email": {
            "subject": e.subject if e else None,
            "sender": e.sender if e else None,
            "received_at": e.received_at.isoformat() if e and e.received_at else None,
            "gmail_link": e.gmail_link if e else None,
            "body_snippet": e.body_snippet if e else None,
        },
    }

@router.get("/transactions")
async def list_transactions(
    label: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Email.user_id == current_user.id]
    if label:     conditions.append(Transaction.label == label)
    if status:    conditions.append(Transaction.status == status)
    if date_from: conditions.append(Transaction.txn_date >= date_from)
    if date_to:   conditions.append(Transaction.txn_date <= date_to)
    if category:  conditions.append(Transaction.category == category)

    count_q = (
        select(func.count(Transaction.id))
        .join(Email, Transaction.email_id == Email.id)
        .where(*conditions)
    )
    data_q = (
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(*conditions)
        .order_by(desc(Transaction.created_at))
        .offset(offset)
        .limit(limit)
    )
    total = (await db.execute(count_q)).scalar_one()
    rows = (await db.execute(data_q)).all()
    return {
        "items": [_fmt(t, e) for t, e in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }

@router.get("/search")
async def search_transactions(
    q: str = "",
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = q.strip()
    if len(q) < 2:
        return {"items": []}
    term = f"%{q.lower()}%"
    amount_val = None
    try:
        amount_val = float(q.replace(",", "").replace("₹", "").replace("Rs", ""))
    except (ValueError, AttributeError):
        pass

    text_cond = or_(
        func.lower(Transaction.merchant).like(term),
        func.lower(Transaction.category).like(term),
        func.lower(Email.subject).like(term),
    )
    if amount_val is not None:
        match_cond = or_(text_cond, func.abs(Transaction.amount - amount_val) <= 10)
    else:
        match_cond = text_cond

    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id, Transaction.label != "ignore", match_cond)
        .order_by(desc(Transaction.created_at))
        .limit(limit)
    )).all()
    return {"items": [_fmt(t, e) for t, e in rows]}


@router.get("/transactions/low-confidence")
async def list_low_confidence_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.confidence.isnot(None),
            Transaction.confidence < 0.7,
        )
        .order_by(Transaction.confidence.asc())
        .limit(50)
    )).all()
    return {"items": [_fmt(t, e) for t, e in rows], "total": len(rows)}


EXPORT_COLUMNS = [
    "id",
    "label",
    "amount",
    "currency",
    "merchant",
    "category",
    "txn_date",
    "confidence",
    "status",
    "classifier_method",
    "user_notes",
    "read",
    "flagged",
    "email_subject",
    "email_sender",
    "email_received_at",
    "gmail_link",
    "created_at",
]


def _csv_value(value):
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


@router.get("/transactions/export")
async def export_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)
        .order_by(desc(Transaction.created_at))
    )).all()

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=EXPORT_COLUMNS)
    writer.writeheader()
    for t, e in rows:
        writer.writerow({
            "id": t.id,
            "label": t.label,
            "amount": float(t.amount) if t.amount is not None else None,
            "currency": t.currency,
            "merchant": t.merchant,
            "category": t.category,
            "txn_date": _csv_value(t.txn_date),
            "confidence": t.confidence,
            "status": t.status,
            "classifier_method": t.classifier_method,
            "user_notes": t.user_notes,
            "read": bool(t.read),
            "flagged": bool(t.flagged),
            "email_subject": e.subject if e else None,
            "email_sender": e.sender if e else None,
            "email_received_at": _csv_value(e.received_at if e else None),
            "gmail_link": e.gmail_link if e else None,
            "created_at": _csv_value(t.created_at),
        })

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="transactions.csv"'},
    )


@router.get("/transactions/{transaction_id}")
async def get_transaction(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row
    result = _fmt(t, e)
    result["email"]["sender_domain"] = e.sender_domain if e else None
    result["email"]["body_snippet"] = e.body_snippet if e else None
    result["email"]["body_text"] = e.body_text if e else None
    return result

@router.patch("/transactions/{transaction_id}")
async def patch_transaction(
    transaction_id: str,
    patch: TransactionPatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        patch.validate()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    row = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row

    changed_fields: dict = {}
    if patch.label is not None and patch.label != t.label:
        changed_fields["label"] = (t.label, patch.label)
    if patch.category is not None and patch.category != t.category:
        changed_fields["category"] = (t.category, patch.category)
    if patch.merchant is not None and patch.merchant != t.merchant:
        changed_fields["merchant"] = (t.merchant, patch.merchant)
    if patch.amount is not None and patch.amount != t.amount:
        changed_fields["amount"] = (float(t.amount) if t.amount is not None else None, patch.amount)

    should_learn = False
    if patch.label is not None:
        t.label = patch.label
        t.status = TransactionStatus.corrected.value
        should_learn = True
    if patch.category is not None:
        t.category = patch.category
        if patch.label is None:
            should_learn = True

    if should_learn and e and e.sender_domain:
        existing = (await db.execute(
            select(SenderRule).where(
                SenderRule.sender_domain == e.sender_domain,
                SenderRule.user_id == current_user.id,
            )
        )).scalar_one_or_none()
        current_label = patch.label if patch.label is not None else t.label
        current_category = patch.category if patch.category is not None else t.category
        if existing:
            existing.label = current_label
            existing.category = current_category
            existing.source = RuleSource.user_trained.value
        else:
            db.add(SenderRule(
                user_id=current_user.id,
                sender_domain=e.sender_domain,
                label=current_label,
                category=current_category,
                source=RuleSource.user_trained.value,
            ))
    if patch.merchant is not None:
        t.merchant = patch.merchant
    if patch.amount is not None:
        t.amount = patch.amount
    if patch.user_notes is not None:
        t.user_notes = patch.user_notes
    if patch.read is not None:
        t.read = patch.read
    if patch.flagged is not None:
        t.flagged = patch.flagged
    if patch.status is not None:
        t.status = patch.status

    if changed_fields:
        db.add(TransactionCorrection(
            transaction_id=t.id,
            user_id=current_user.id,
            old_label=changed_fields.get("label", (None, None))[0],
            new_label=changed_fields.get("label", (None, None))[1],
            old_category=changed_fields.get("category", (None, None))[0],
            new_category=changed_fields.get("category", (None, None))[1],
            old_merchant=changed_fields.get("merchant", (None, None))[0],
            new_merchant=changed_fields.get("merchant", (None, None))[1],
            old_amount=changed_fields.get("amount", (None, None))[0],
            new_amount=changed_fields.get("amount", (None, None))[1],
        ))

    await db.commit()

    # Record merchant→category correction for future pre-extraction hints
    final_merchant = patch.merchant if patch.merchant is not None else t.merchant
    final_category = patch.category if patch.category is not None else t.category
    if final_merchant and final_category:
        try:
            await merchant_store.correct(db, current_user.id, final_merchant, final_category)
            await db.commit()
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("MerchantStore.correct failed: %s", exc)

    await db.refresh(t)
    learned_rule = None
    if should_learn and e and e.sender_domain:
        learned_rule = {
            "domain": e.sender_domain,
            "label": patch.label if patch.label is not None else t.label,
            "category": patch.category if patch.category is not None else t.category,
        }
    return {"id": t.id, "status": t.status, "learned_rule": learned_rule}

async def _load_tx_email(transaction_id: str, db: AsyncSession, user_id: str):
    row = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.id == transaction_id, Email.user_id == user_id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row
    if not e:
        raise HTTPException(status_code=422, detail="No email linked to this transaction")
    return t, e


async def _load_user_llm_client(user_id: str, db: AsyncSession):
    from sqlalchemy import select as _sel
    from app.models import UserSettings
    from app.models.user import UserAIService
    from app.api._account_helpers import _decrypt_secret
    from app.classifier.llm_client import build_user_client
    user_settings = (await db.execute(_sel(UserSettings).where(UserSettings.user_id == user_id))).scalar_one_or_none()
    if not (user_settings and user_settings.active_ai_service_id):
        return None
    ai_svc = (await db.execute(_sel(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id))).scalar_one_or_none()
    if not (ai_svc and ai_svc.enabled and ai_svc.encrypted_api_key):
        return None
    try:
        return build_user_client(user_id=user_id, provider=ai_svc.provider, base_url=ai_svc.base_url, api_key=_decrypt_secret(ai_svc.encrypted_api_key), model_id=ai_svc.model_id)
    except Exception:
        return None


@router.post("/transactions/{transaction_id}/reclassify/preview")
async def reclassify_preview(
    transaction_id: str,
    method: str = Query("llm"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview reclassification. method=llm uses AI, method=rules uses deterministic rules."""
    t, e = await _load_tx_email(transaction_id, db, user_id=current_user.id)
    from app.classifier.classifier import classify_email
    from app.services.category_service import CategoryService
    user_cats = await CategoryService.load_for_llm(db, str(current_user.id))

    if method == "rules":
        from app.classifier.rules import build_domain_rules
        from app.classifier.classifier import _rules_fallback_result
        db_rules = await build_domain_rules(db)
        cls = _rules_fallback_result(e.sender_domain or "", e.subject or "", e.body_text or e.body_snippet or "", db_rules)
    else:
        user_llm_client = await _load_user_llm_client(str(current_user.id), db)
        cls = await classify_email(
            email_id=e.id,
            sender=e.sender or "",
            sender_domain=e.sender_domain or "",
            subject=e.subject or "",
            body_text=e.body_text or e.body_snippet or "",
            session=None,
            rule_engine_enabled=False,
            user_id=str(current_user.id),
            llm_client_override=user_llm_client,
            categories_override=user_cats,
        )
    return {
        "label":      cls.label.value,
        "amount":     cls.amount,
        "merchant":   cls.merchant,
        "category":   cls.category,
        "confidence": cls.confidence,
        "txn_date":   cls.txn_date.isoformat() if cls.txn_date else None,
        "status":     cls.status.value,
        "classifier_method": cls.classifier_method.value,
    }


@router.post("/transactions/{transaction_id}/reclassify")
async def reclassify_transaction(
    transaction_id: str,
    method: str = Query("llm"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Commit reclassification to DB. method=llm uses AI, method=rules uses deterministic rules."""
    t, e = await _load_tx_email(transaction_id, db, user_id=current_user.id)
    from app.classifier.classifier import classify_email
    if method == "rules":
        from app.classifier.rules import build_domain_rules
        from app.classifier.classifier import _rules_fallback_result
        db_rules = await build_domain_rules(db)
        cls = _rules_fallback_result(e.sender_domain or "", e.subject or "", e.body_text or e.body_snippet or "", db_rules)
    else:
        user_llm_client = await _load_user_llm_client(str(current_user.id), db)
        cls = await classify_email(
            email_id=e.id,
            sender=e.sender or "",
            sender_domain=e.sender_domain or "",
            subject=e.subject or "",
            body_text=e.body_text or e.body_snippet or "",
            session=db,
            rule_engine_enabled=False,
            user_id=str(current_user.id),
            llm_client_override=user_llm_client,
        )

    t.label     = cls.label.value
    t.amount    = cls.amount
    t.merchant  = cls.merchant
    t.category  = cls.category
    t.confidence = cls.confidence
    t.classifier_method = cls.classifier_method.value
    t.status    = cls.status.value
    if cls.txn_date:
        t.txn_date = cls.txn_date

    await db.commit()

    # Learn from the accepted reclassification
    learned_rule = None
    if e and e.sender_domain:
        existing = (await db.execute(
            select(SenderRule).where(
                SenderRule.sender_domain == e.sender_domain,
                SenderRule.user_id == current_user.id,
            )
        )).scalar_one_or_none()
        if existing:
            existing.label = t.label
            existing.category = t.category
            existing.source = RuleSource.user_trained.value
        else:
            db.add(SenderRule(
                user_id=current_user.id,
                sender_domain=e.sender_domain,
                label=t.label,
                category=t.category,
                source=RuleSource.user_trained.value,
            ))
        learned_rule = {
            "domain": e.sender_domain,
            "label": t.label,
            "category": t.category,
        }
        await db.commit()

    await db.refresh(t)
    result = _fmt(t, e)
    result["learned_rule"] = learned_rule
    return result


@router.post("/transactions/{transaction_id}/fetch-body")
async def fetch_transaction_body(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-fetch clean body text for a transaction's email from Gmail API.
    Updates email.body_text in DB and returns the fresh text."""
    import asyncio
    t, e = await _load_tx_email(transaction_id, db, user_id=current_user.id)
    from app.gmail.auth import get_credentials_for_user
    from app.gmail.client import _build_service, _extract_body_text

    creds = await get_credentials_for_user(db, current_user.id)
    if not creds:
        raise HTTPException(status_code=503, detail="Gmail not authenticated")
    service = await asyncio.to_thread(_build_service, creds)

    try:
        msg = await asyncio.to_thread(
            lambda eid=e.gmail_id: service.users().messages().get(
                userId="me", id=eid, format="full"
            ).execute()
        )
        body = _extract_body_text(msg.get("payload", {}))
        if body:
            e.body_text = body
            await db.commit()
            return {"body_text": body, "body_chars": len(body)}
        return {"body_text": e.body_text or "", "body_chars": len(e.body_text or ""), "note": "Could not extract body from Gmail"}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gmail fetch failed: {str(exc)}")


@router.get("/transactions/duplicates")
async def find_duplicates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Find potential duplicate expenses: same amount on the same date from different sender domains.
    Only looks at expense-labelled transactions with non-null amount and txn_date.
    """
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Email.user_id == current_user.id,
            Transaction.label == "expense",
            Transaction.amount.isnot(None),
            Transaction.txn_date.isnot(None),
        )
        .order_by(Transaction.txn_date.desc(), Transaction.amount)
    )).all()

    # Group by (amount, txn_date)
    from collections import defaultdict
    groups: dict = defaultdict(list)
    for t, e in rows:
        key = (float(t.amount), t.txn_date.isoformat())
        groups[key].append(_fmt(t, e))

    # Only return groups with 2+ items from different domains
    duplicates = []
    for (amount, txn_date), items in groups.items():
        domains = {item["email"].get("sender") for item in items}
        if len(items) >= 2 and len(domains) > 1:
            duplicates.append({
                "amount": amount,
                "txn_date": txn_date,
                "transactions": items,
            })

    return sorted(duplicates, key=lambda g: g["txn_date"], reverse=True)
