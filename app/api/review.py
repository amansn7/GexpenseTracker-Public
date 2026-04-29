import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import Optional
from app.auth_deps import get_current_user
from app.database import get_db, AsyncSessionLocal
from app.models import Transaction, Email, TransactionStatus, SenderRule, Label, RuleSource, User
from app.classifier.classifier import classify_email

logger = logging.getLogger(__name__)

_REPROCESS_CONCURRENCY = 4   # max concurrent LLM calls during bulk reprocess


router = APIRouter()


@router.get("/review/count")
async def get_review_count(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import func
    result = await db.execute(
        select(func.count())
        .select_from(Transaction)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.user_id == current_user.id,
        )
    )
    return {"count": result.scalar() or 0}


@router.get("/review")
async def get_review_queue(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.user_id == current_user.id,
        )
        .order_by(desc(Email.received_at))
    )).all()

    # Pre-aggregate domain counts in one query instead of one query per row
    domain_counts_rows = (await db.execute(
        select(Email.sender_domain, func.count().label("cnt"))
        .join(Transaction, Transaction.email_id == Email.id)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.sender_domain.isnot(None),
            Email.user_id == current_user.id,
        )
        .group_by(Email.sender_domain)
    )).all()
    domain_counts = {r.sender_domain: r.cnt for r in domain_counts_rows}

    result = []
    for t, e in rows:
        domain_count = max(0, domain_counts.get(e.sender_domain or "", 0) - 1)
        result.append({
            "id": t.id,
            "label": t.label,
            "amount": float(t.amount) if t.amount is not None else None,
            "merchant": t.merchant,
            "category": t.category,
            "confidence": t.confidence,
            "domain_count": domain_count,
            "email": {
                "subject": e.subject,
                "sender": e.sender,
                "sender_domain": e.sender_domain,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "body_snippet": e.body_snippet,
                "gmail_link": e.gmail_link,
            },
        })

    return result


@router.post("/review/{transaction_id}/reprocess")
async def reprocess_transaction(transaction_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Re-run the rule engine + LLM classifier on the email and update the transaction."""
    row = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(Transaction.id == transaction_id, Email.user_id == current_user.id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    t, e = row

    logger.info("Reprocessing transaction %s (email %s)", t.id, e.gmail_id)
    try:
        result = await classify_email(
            email_id=e.id,
            sender=e.sender or "",
            sender_domain=e.sender_domain or "",
            subject=e.subject or "",
            body_text=e.body_text or e.body_snippet or "",
            session=db,
        )
    except Exception as exc:
        logger.error("Reprocess failed for %s: %s", t.id, exc)
        raise HTTPException(status_code=502, detail=f"Classification error: {exc}")

    # Update transaction fields with new result
    t.label = result.label.value
    t.amount = result.amount
    t.merchant = result.merchant
    t.category = result.category
    t.txn_date = result.txn_date
    t.confidence = result.confidence
    t.status = result.status.value
    t.classifier_method = result.classifier_method.value

    await db.commit()
    await db.refresh(t)

    return {
        "id": t.id,
        "label": t.label,
        "amount": float(t.amount) if t.amount is not None else None,
        "merchant": t.merchant,
        "category": t.category,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
    }


# ── Bulk reprocess progress (in-memory, single-user) ─────────────────────────

_bulk_progress = {
    "running": False,
    "total": 0,
    "done": 0,
    "errors": 0,
    "moved_out": 0,   # items that got high confidence and left the queue
}


@router.get("/review/reprocess-all/progress")
async def reprocess_all_progress(current_user: User = Depends(get_current_user)):
    return dict(_bulk_progress)


@router.post("/review/reprocess-all")
async def reprocess_all(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Kick off background bulk reprocessing of every needs_review transaction.
    Returns immediately; poll /api/review/reprocess-all/progress for status.
    """
    if _bulk_progress["running"]:
        return {"message": "Already running", "progress": dict(_bulk_progress)}

    # Fetch IDs now; processing happens in background
    rows = (await db.execute(
        select(Transaction.id)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.user_id == current_user.id,
        )
    )).scalars().all()

    if not rows:
        return {"message": "Nothing to reprocess", "progress": dict(_bulk_progress)}

    ids = list(rows)
    asyncio.create_task(_bulk_reprocess_task(ids))
    return {"message": f"Started reprocessing {len(ids)} items", "total": len(ids)}


async def _bulk_reprocess_task(transaction_ids: list):
    _bulk_progress.update({"running": True, "total": len(transaction_ids),
                            "done": 0, "errors": 0, "moved_out": 0})
    sem = asyncio.Semaphore(_REPROCESS_CONCURRENCY)

    async def _one(txn_id: str):
        async with sem:
            try:
                async with AsyncSessionLocal() as session:
                    row = (await session.execute(
                        select(Transaction, Email)
                        .join(Email, Transaction.email_id == Email.id)
                        .where(Transaction.id == txn_id)
                    )).one_or_none()
                    if not row:
                        return

                    t, e = row

                    result = await classify_email(
                        email_id=e.id,
                        sender=e.sender or "",
                        sender_domain=e.sender_domain or "",
                        subject=e.subject or "",
                        body_text=e.body_text or e.body_snippet or "",
                        session=session,
                    )

                    t.label = result.label.value
                    t.amount = result.amount
                    t.merchant = result.merchant
                    t.category = result.category
                    t.txn_date = result.txn_date
                    t.confidence = result.confidence
                    t.status = result.status.value
                    t.classifier_method = result.classifier_method.value

                    await session.commit()

                    if result.status.value != TransactionStatus.needs_review.value:
                        _bulk_progress["moved_out"] += 1

                _bulk_progress["done"] += 1
                logger.info("Bulk reprocess %s/%s: %s",
                            _bulk_progress["done"], _bulk_progress["total"], txn_id)
            except Exception as exc:
                _bulk_progress["errors"] += 1
                _bulk_progress["done"] += 1
                logger.error("Bulk reprocess error for %s: %s", txn_id, exc)

    await asyncio.gather(*[_one(tid) for tid in transaction_ids])
    _bulk_progress["running"] = False
    logger.info("Bulk reprocess complete: %s", _bulk_progress)


class BatchActionBody(BaseModel):
    action: str          # "ignore_domain" | "expense_domain" | "income_domain"
    domain: str
    category: Optional[str] = None


@router.post("/review/batch")
async def batch_action(body: BatchActionBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Apply label to ALL needs_review transactions from a given sender domain.
    Also upserts a SenderRule so future emails from this domain are auto-classified.
    """
    if body.action not in ("ignore_domain", "expense_domain", "income_domain"):
        raise HTTPException(status_code=422, detail="Invalid action")

    label_map = {
        "ignore_domain": "ignore",
        "expense_domain": "expense",
        "income_domain": "income",
    }
    label = label_map[body.action]

    # Find all needs_review transactions for this domain
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.sender_domain == body.domain,
            Email.user_id == current_user.id,
        )
    )).all()

    for t, e in rows:
        t.label = label
        t.status = TransactionStatus.confirmed.value
        if body.category:
            t.category = body.category

    # Upsert sender rule
    existing = (await db.execute(
        select(SenderRule).where(
            SenderRule.sender_domain == body.domain,
            SenderRule.user_id == current_user.id,
        )
    )).scalar_one_or_none()

    if existing:
        existing.label = label
        if body.category:
            existing.category = body.category
        existing.source = RuleSource.user_trained.value
    else:
        db.add(SenderRule(
            user_id=current_user.id,
            sender_domain=body.domain,
            label=label,
            category=body.category,
            source=RuleSource.user_trained.value,
        ))

    await db.commit()
    return {"updated": len(rows), "domain": body.domain, "label": label}
