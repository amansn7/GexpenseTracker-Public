from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models import Email, Transaction

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
            "gmail_link": e.gmail_link,
            # transaction fields (None if no linked transaction)
            "txn_id": t.id if t else None,
            "label": t.label if t else None,
            "status": t.status if t else None,
            "amount": float(t.amount) if t and t.amount is not None else None,
            "merchant": t.merchant if t else None,
            "category": t.category if t else None,
        }
        for e, t in rows
    ]
