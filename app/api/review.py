from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models import Transaction, Email, TransactionStatus

router = APIRouter()

@router.get("/review")
async def get_review_queue(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email)
        .where(Transaction.status == TransactionStatus.needs_review.value)
        .order_by(desc(Email.received_at))
    )).all()
    return [
        {
            "id": t.id,
            "label": t.label,
            "amount": float(t.amount) if t.amount is not None else None,
            "merchant": t.merchant,
            "category": t.category,
            "confidence": t.confidence,
            "email": {
                "subject": e.subject,
                "sender": e.sender,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "body_snippet": e.body_snippet,
                "gmail_link": e.gmail_link,
            },
        }
        for t, e in rows
    ]
