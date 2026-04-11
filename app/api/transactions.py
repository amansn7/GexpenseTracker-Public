from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, extract
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.database import get_db
from app.models import Transaction, Email, SenderRule, Label, TransactionStatus, RuleSource

router = APIRouter()

class TransactionPatch(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    user_notes: Optional[str] = None

def _fmt(t: Transaction, e: Email) -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "amount": float(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
        "user_notes": t.user_notes,
        "email": {
            "subject": e.subject,
            "sender": e.sender,
            "received_at": e.received_at.isoformat() if e.received_at else None,
            "gmail_link": e.gmail_link,
        },
    }

@router.get("/transactions")
async def list_transactions(
    label: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction, Email).join(Email).order_by(desc(Transaction.created_at))
    if label:
        q = q.where(Transaction.label == label)
    if status:
        q = q.where(Transaction.status == status)
    if date_from:
        q = q.where(Transaction.txn_date >= date_from)
    if date_to:
        q = q.where(Transaction.txn_date <= date_to)
    if category:
        q = q.where(Transaction.category == category)
    rows = (await db.execute(q)).all()
    return [_fmt(t, e) for t, e in rows]

@router.get("/transactions/{transaction_id}")
async def get_transaction(transaction_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(Transaction, Email).join(Email).where(Transaction.id == transaction_id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row
    result = _fmt(t, e)
    result["email"]["sender_domain"] = e.sender_domain
    result["email"]["body_snippet"] = e.body_snippet
    return result

@router.patch("/transactions/{transaction_id}")
async def patch_transaction(
    transaction_id: str,
    patch: TransactionPatch,
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(Transaction, Email).join(Email).where(Transaction.id == transaction_id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row

    if patch.label is not None:
        t.label = patch.label
        t.status = TransactionStatus.corrected.value
        if e.sender_domain:
            existing = (await db.execute(
                select(SenderRule).where(SenderRule.sender_domain == e.sender_domain)
            )).scalar_one_or_none()
            new_category = patch.category or t.category
            if existing:
                existing.label = patch.label
                if patch.category is not None:
                    existing.category = patch.category
                existing.source = RuleSource.user_trained.value
            else:
                db.add(SenderRule(
                    sender_domain=e.sender_domain,
                    label=patch.label,
                    category=new_category,
                    source=RuleSource.user_trained.value,
                ))
    if patch.category is not None:
        t.category = patch.category
    if patch.amount is not None:
        t.amount = patch.amount
    if patch.user_notes is not None:
        t.user_notes = patch.user_notes

    await db.commit()
    await db.refresh(t)
    return {"id": t.id, "status": t.status}

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    from datetime import date as date_cls
    now = date_cls.today()
    rows = (await db.execute(
        select(Transaction.label, Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.txn_date.isnot(None),
            extract("month", Transaction.txn_date) == now.month,
            extract("year", Transaction.txn_date) == now.year,
            Transaction.status != TransactionStatus.needs_review.value,
        )
        .group_by(Transaction.label, Transaction.category)
    )).all()

    total_expense = sum(float(r.total or 0) for r in rows if r.label == "expense")
    total_income = sum(float(r.total or 0) for r in rows if r.label == "income")
    return {
        "month": f"{now.year}-{now.month:02d}",
        "total_expense": total_expense,
        "total_income": total_income,
        "by_category": [
            {"label": r.label, "category": r.category, "total": float(r.total or 0)}
            for r in rows
        ],
    }
