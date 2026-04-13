from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from app.database import get_db
from app.models import RecurringExpense

router = APIRouter()


class RecurringBody(BaseModel):
    name: str
    amount: Optional[float] = None
    category: Optional[str] = None
    frequency: str = "monthly"   # monthly | weekly | yearly
    day_of_month: Optional[int] = None
    notes: Optional[str] = None
    active: bool = True


def _fmt(r: RecurringExpense) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "amount": float(r.amount) if r.amount is not None else None,
        "category": r.category,
        "frequency": r.frequency,
        "day_of_month": r.day_of_month,
        "notes": r.notes,
        "active": r.active,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/recurring")
async def list_recurring(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(RecurringExpense).order_by(RecurringExpense.name)
    )).scalars().all()
    items = [_fmt(r) for r in rows]

    # Monthly total = sum of all active monthly items + weekly*4.33 + yearly/12
    monthly_total = 0.0
    for r in rows:
        if not r.active or r.amount is None:
            continue
        if r.frequency == "monthly":
            monthly_total += float(r.amount)
        elif r.frequency == "weekly":
            monthly_total += float(r.amount) * 4.33
        elif r.frequency == "yearly":
            monthly_total += float(r.amount) / 12

    return {"items": items, "monthly_total": round(monthly_total, 2)}


@router.post("/recurring", status_code=201)
async def create_recurring(body: RecurringBody, db: AsyncSession = Depends(get_db)):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required")
    if body.frequency not in ("monthly", "weekly", "yearly"):
        raise HTTPException(status_code=422, detail="frequency must be monthly, weekly, or yearly")
    r = RecurringExpense(
        name=body.name.strip(),
        amount=body.amount,
        category=body.category,
        frequency=body.frequency,
        day_of_month=body.day_of_month,
        notes=body.notes,
        active=body.active,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return _fmt(r)


@router.patch("/recurring/{item_id}")
async def update_recurring(item_id: str, body: RecurringBody, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(
        select(RecurringExpense).where(RecurringExpense.id == item_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    r.name = body.name.strip()
    r.amount = body.amount
    r.category = body.category
    r.frequency = body.frequency
    r.day_of_month = body.day_of_month
    r.notes = body.notes
    r.active = body.active
    await db.commit()
    await db.refresh(r)
    return _fmt(r)


@router.delete("/recurring/{item_id}")
async def delete_recurring(item_id: str, db: AsyncSession = Depends(get_db)):
    r = (await db.execute(
        select(RecurringExpense).where(RecurringExpense.id == item_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(r)
    await db.commit()
    return {"deleted": item_id}
