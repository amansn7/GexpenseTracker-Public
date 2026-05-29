import csv
import io
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth_deps import get_current_user
from app.classifier.merchant_store import merchant_store
from app.config import settings
from app.database import get_db
from app.dedup.service import batch_detect_duplicates
from app.models import (
    ClassificationLog,
    Email,
    RuleSource,
    SenderRule,
    Transaction,
    TransactionCorrection,
    TransactionStatus,
    User,
)
from app.services.classifier_service import get_classifier_context
from app.services.llm_service import get_effective_llm_client
from app.services.transaction_formatter import format_transaction

router = APIRouter()

BULK_SELECT_ALL_MAX = 5000


class TransactionPatch(BaseModel):
    label: str | None = None
    category: str | None = None
    merchant: str | None = None
    amount: float | None = None
    user_notes: str | None = None
    read: bool | None = None
    flagged: bool | None = None
    status: str | None = None

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
    ids: list[str] = []
    action: Literal[
        "mark_read", "mark_unread", "flag", "unflag", "delete", "detect_duplicates", "set_category", "set_label"
    ]
    select_all: bool = False
    category: str | None = None
    label: str | None = None


@router.post("/transactions/bulk")
async def bulk_transactions(
    payload: BulkAction,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.select_all:
        count_q = (
            select(func.count(Transaction.id))
            .join(Email, Transaction.email_id == Email.id)
            .where(Email.user_id == current_user.id)
        )
        total = (await db.execute(count_q)).scalar_one()
        if total > BULK_SELECT_ALL_MAX:
            raise HTTPException(
                status_code=422,
                detail=f"Too many transactions ({total}) for bulk action. Maximum is {BULK_SELECT_ALL_MAX}. Use date range filter to narrow your selection.",
            )

        BATCH_SIZE = 500
        last_id = ""
        total_updated = 0
        all_stats = None
        while True:
            rows = (
                (
                    await db.execute(
                        select(Transaction)
                        .join(Email, Transaction.email_id == Email.id)
                        .where(Email.user_id == current_user.id, Transaction.id > last_id)
                        .options(selectinload(Transaction.email))
                        .order_by(Transaction.id)
                        .limit(BATCH_SIZE)
                    )
                )
                .scalars()
                .all()
            )

            if not rows:
                break

            last_id = rows[-1].id

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
                        email = (await db.execute(select(Email).where(Email.id == t.email_id))).scalar_one_or_none()
                        if email:
                            await db.execute(delete(ClassificationLog).where(ClassificationLog.email_id == t.email_id))
                            await db.delete(email)
                        t.email_id = None
            elif payload.action == "detect_duplicates":
                tx_email_pairs = [(t, t.email) for t in rows if t.email]
                user_id = str(current_user.id)
                stats = await batch_detect_duplicates(tx_email_pairs, db, user_id)
                if all_stats is None:
                    all_stats = stats
                else:
                    for k, v in stats.items():
                        all_stats[k] = all_stats.get(k, 0) + v
            elif payload.action == "set_category":
                if not payload.category:
                    raise HTTPException(status_code=422, detail="category is required for set_category action")
                for t in rows:
                    t.category = payload.category
                    t.status = TransactionStatus.corrected.value
            elif payload.action == "set_label":
                if not payload.label:
                    raise HTTPException(status_code=422, detail="label is required for set_label action")
                for t in rows:
                    t.label = payload.label
                    t.status = TransactionStatus.corrected.value

            await db.commit()
            total_updated += len(rows)

        if payload.action == "detect_duplicates":
            return {"updated": total_updated, "duplicates": all_stats or {}}
        return {"updated": total_updated}
    else:
        rows = (
            (
                await db.execute(
                    select(Transaction)
                    .join(Email, Transaction.email_id == Email.id)
                    .where(Transaction.id.in_(payload.ids), Email.user_id == current_user.id)
                    .options(selectinload(Transaction.email))
                )
            )
            .scalars()
            .all()
        )

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
                    email = (await db.execute(select(Email).where(Email.id == t.email_id))).scalar_one_or_none()
                    if email:
                        await db.execute(delete(ClassificationLog).where(ClassificationLog.email_id == t.email_id))
                        await db.delete(email)
                    t.email_id = None
        elif payload.action == "detect_duplicates":
            tx_email_pairs = [(t, t.email) for t in rows if t.email]
            user_id = str(current_user.id)
            stats = await batch_detect_duplicates(tx_email_pairs, db, user_id)
            await db.commit()
            return {"updated": len(rows), "duplicates": stats}
        elif payload.action == "set_category":
            if not payload.category:
                raise HTTPException(status_code=422, detail="category is required for set_category action")
            for t in rows:
                t.category = payload.category
                t.status = TransactionStatus.corrected.value
        elif payload.action == "set_label":
            if not payload.label:
                raise HTTPException(status_code=422, detail="label is required for set_label action")
            for t in rows:
                t.label = payload.label
                t.status = TransactionStatus.corrected.value

        await db.commit()
        return {"updated": len(rows)}


@router.get("/transactions")
async def list_transactions(
    label: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Email.user_id == current_user.id]
    if label:
        conditions.append(Transaction.label == label)
    if status:
        conditions.append(Transaction.status == status)
    if date_from:
        conditions.append(Transaction.txn_date >= date_from)
    if date_to:
        conditions.append(Transaction.txn_date <= date_to)
    if category:
        from app.services.category_service import CategoryService
        if category == "other":
            other_aliases = CategoryService.filter_aliases("other")
            all_known = CategoryService.all_known_values()
            conditions.append(
                or_(
                    Transaction.category.is_(None),
                    func.lower(Transaction.category).in_(other_aliases),
                    ~func.lower(Transaction.category).in_(all_known),
                )
            )
        else:
            aliases = CategoryService.filter_aliases(category)
            conditions.append(func.lower(Transaction.category).in_(aliases))

    count_q = select(func.count(Transaction.id)).join(Email, Transaction.email_id == Email.id).where(*conditions)
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
        "items": [format_transaction(t, e) for t, e in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/search")
async def search_transactions(
    q: str = "",
    amount_min: float | None = None,
    amount_max: float | None = None,
    limit: int = Query(default=20, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = q.strip()
    conditions = [Email.user_id == current_user.id, Transaction.label != "ignore"]

    if amount_min is not None:
        conditions.append(Transaction.amount >= amount_min)
    if amount_max is not None:
        conditions.append(Transaction.amount <= amount_max)

    if len(q) < 2 and amount_min is None and amount_max is None:
        return {"items": []}

    if len(q) >= 2:
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
        conditions.append(match_cond)

    rows = (
        await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(*conditions)
            .order_by(desc(Transaction.created_at))
            .limit(limit)
        )
    ).all()
    return {"items": [format_transaction(t, e) for t, e in rows]}


@router.get("/transactions/low-confidence")
async def list_low_confidence_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == current_user.id,
                Transaction.confidence.isnot(None),
                Transaction.confidence < settings.LOW_CONFIDENCE_THRESHOLD,
            )
            .order_by(Transaction.confidence.asc())
            .limit(50)
        )
    ).all()
    return {"items": [format_transaction(t, e) for t, e in rows], "total": len(rows)}


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


EXPORT_MAX_ROWS = 10000
EXPORT_BATCH_SIZE = 1000


async def _stream_export_csv(db, user_id, filters, total):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=EXPORT_COLUMNS)
    writer.writeheader()
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    conditions = [Email.user_id == user_id]
    if filters.get("date_from"):
        conditions.append(Transaction.txn_date >= filters["date_from"])
    if filters.get("date_to"):
        conditions.append(Transaction.txn_date <= filters["date_to"])
    if filters.get("label"):
        conditions.append(Transaction.label == filters["label"])

    last_id = ""
    while True:
        rows = (
            await db.execute(
                select(Transaction, Email)
                .join(Email, Transaction.email_id == Email.id)
                .where(*conditions, Transaction.id > last_id)
                .order_by(Transaction.id)
                .limit(EXPORT_BATCH_SIZE)
            )
        ).all()

        if not rows:
            break

        for t, e in rows:
            last_id = t.id
            writer.writerow(
                {
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
                }
            )

        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)


@router.get("/transactions/export")
async def export_transactions(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    label: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conditions = [Email.user_id == current_user.id]
    if date_from:
        conditions.append(Transaction.txn_date >= date_from)
    if date_to:
        conditions.append(Transaction.txn_date <= date_to)
    if label:
        conditions.append(Transaction.label == label)

    count_q = select(func.count(Transaction.id)).join(Email, Transaction.email_id == Email.id).where(*conditions)
    total = (await db.execute(count_q)).scalar_one()

    has_date_filter = date_from is not None or date_to is not None
    if total > EXPORT_MAX_ROWS and not has_date_filter:
        raise HTTPException(
            status_code=422,
            detail="Export limited to 10,000 rows. Please specify a date range (date_from and/or date_to) to narrow your export.",
        )

    headers = {
        "Content-Disposition": 'attachment; filename="transactions.csv"',
        "X-Row-Count": str(total),
    }
    if total > 5000:
        headers["X-Warning"] = f"Large export: {total} rows. Consider narrowing your date range or applying filters."

    filters = {"date_from": date_from, "date_to": date_to, "label": label}
    return StreamingResponse(
        _stream_export_csv(db, current_user.id, filters, total),
        media_type="text/csv",
        headers=headers,
    )


@router.get("/transactions/{transaction_id}")
async def get_transaction(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row
    result = format_transaction(t, e)
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

    row = (
        await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
        )
    ).one_or_none()
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
        existing = (
            await db.execute(
                select(SenderRule).where(
                    SenderRule.sender_domain == e.sender_domain,
                    SenderRule.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        current_label = patch.label if patch.label is not None else t.label
        current_category = patch.category if patch.category is not None else t.category
        if existing:
            existing.label = current_label
            existing.category = current_category
            existing.source = RuleSource.user_trained.value
        else:
            db.add(
                SenderRule(
                    user_id=current_user.id,
                    sender_domain=e.sender_domain,
                    label=current_label,
                    category=current_category,
                    source=RuleSource.user_trained.value,
                )
            )
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
        db.add(
            TransactionCorrection(
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
            )
        )

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
    row = (
        await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(Transaction.id == transaction_id, Email.user_id == user_id)
        )
    ).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row
    if not e:
        raise HTTPException(status_code=422, detail="No email linked to this transaction")
    return t, e


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
    from app.classifier.context import ClassificationContext

    ctx = await get_classifier_context(str(current_user.id), db)

    if method == "rules":
        from app.classifier.classifier import _rules_fallback_result

        db_rules = ctx["rules"]
        cls = _rules_fallback_result(
            e.sender_domain or "", e.subject or "", e.body_text or e.body_snippet or "", db_rules
        )
    else:
        user_llm_client = await get_effective_llm_client(str(current_user.id), db)
        cls = await classify_email(
            ClassificationContext(
                email_id=e.id,
                sender=e.sender or "",
                sender_domain=e.sender_domain or "",
                subject=e.subject or "",
                body_text=e.body_text or e.body_snippet or "",
                session=None,
                rule_engine_enabled=False,
                user_id=str(current_user.id),
                llm_client_override=user_llm_client,
                categories_override=ctx["categories"],
            )
        )
    return {
        "label": cls.label.value,
        "amount": cls.amount,
        "merchant": cls.merchant,
        "category": cls.category,
        "confidence": cls.confidence,
        "txn_date": cls.txn_date.isoformat() if cls.txn_date else None,
        "status": cls.status.value,
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
    from app.classifier.context import ClassificationContext

    if method == "rules":
        from app.classifier.classifier import _rules_fallback_result

        ctx = await get_classifier_context(str(current_user.id), db)
        db_rules = ctx["rules"]
        cls = _rules_fallback_result(
            e.sender_domain or "", e.subject or "", e.body_text or e.body_snippet or "", db_rules
        )
    else:
        user_llm_client = await get_effective_llm_client(str(current_user.id), db)
        cls = await classify_email(
            ClassificationContext(
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
        )

    t.label = cls.label.value
    t.amount = cls.amount
    t.merchant = cls.merchant
    t.category = cls.category
    t.confidence = cls.confidence
    t.classifier_method = cls.classifier_method.value
    t.status = cls.status.value
    if cls.txn_date:
        t.txn_date = cls.txn_date

    await db.commit()

    # Learn from the accepted reclassification
    learned_rule = None
    if e and e.sender_domain:
        existing = (
            await db.execute(
                select(SenderRule).where(
                    SenderRule.sender_domain == e.sender_domain,
                    SenderRule.user_id == current_user.id,
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.label = t.label
            existing.category = t.category
            existing.source = RuleSource.user_trained.value
        else:
            db.add(
                SenderRule(
                    user_id=current_user.id,
                    sender_domain=e.sender_domain,
                    label=t.label,
                    category=t.category,
                    source=RuleSource.user_trained.value,
                )
            )
        learned_rule = {
            "domain": e.sender_domain,
            "label": t.label,
            "category": t.category,
        }
        await db.commit()

    await db.refresh(t)
    result = format_transaction(t, e)
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
            lambda eid=e.gmail_id: service.users().messages().get(userId="me", id=eid, format="full").execute()
        )
        body = _extract_body_text(msg.get("payload", {}))
        if body:
            e.body_text = body
            await db.commit()
            return {"body_text": body, "body_chars": len(body)}
        return {
            "body_text": e.body_text or "",
            "body_chars": len(e.body_text or ""),
            "note": "Could not extract body from Gmail",
        }
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
    rows = (
        await db.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == current_user.id,
                Transaction.label == "expense",
                Transaction.amount.isnot(None),
                Transaction.txn_date.isnot(None),
            )
            .order_by(Transaction.txn_date.desc(), Transaction.amount)
        )
    ).all()

    # Group by (amount, txn_date)
    from collections import defaultdict

    groups: dict = defaultdict(list)
    for t, e in rows:
        key = (float(t.amount), t.txn_date.isoformat())
        groups[key].append(format_transaction(t, e))

    # Only return groups with 2+ items from different domains
    duplicates = []
    for (amount, txn_date), items in groups.items():
        domains = {item["email"].get("sender") for item in items}
        if len(items) >= 2 and len(domains) > 1:
            duplicates.append(
                {
                    "amount": amount,
                    "txn_date": txn_date,
                    "transactions": items,
                }
            )

    return sorted(duplicates, key=lambda g: g["txn_date"], reverse=True)
