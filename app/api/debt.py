from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Debt, User

router = APIRouter()


class DebtBody(BaseModel):
    name: str
    total_amount: float
    paid_amount: float = 0.0
    interest_rate: float | None = None
    target_date: date | None = None
    notes: str | None = None


def _fmt(d: Debt) -> dict:
    total = float(d.total_amount)
    paid = float(d.paid_amount)
    remaining = round(total - paid, 2)
    pct_paid = round(paid / total * 100, 1) if total > 0 else 0.0
    return {
        "id": d.id,
        "name": d.name,
        "total_amount": total,
        "paid_amount": paid,
        "remaining": remaining,
        "pct_paid": pct_paid,
        "interest_rate": d.interest_rate,
        "target_date": d.target_date.isoformat() if d.target_date else None,
        "notes": d.notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("/debts")
async def list_debts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        (
            await db.execute(
                select(Debt)
                .where(Debt.user_id == current_user.id)
                .order_by((Debt.total_amount - Debt.paid_amount).desc())
            )
        )
        .scalars()
        .all()
    )
    return {"items": [_fmt(d) for d in rows]}


@router.post("/debts", status_code=201)
async def create_debt(
    body: DebtBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required")
    if body.total_amount <= 0:
        raise HTTPException(status_code=422, detail="total_amount must be positive")
    if body.paid_amount < 0:
        raise HTTPException(status_code=422, detail="paid_amount cannot be negative")
    if body.paid_amount > body.total_amount:
        raise HTTPException(status_code=422, detail="paid_amount cannot exceed total_amount")
    d = Debt(
        user_id=current_user.id,
        name=body.name.strip(),
        total_amount=body.total_amount,
        paid_amount=body.paid_amount,
        interest_rate=body.interest_rate,
        target_date=body.target_date,
        notes=body.notes,
    )
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return _fmt(d)


@router.patch("/debts/{id}")
async def update_debt(
    id: str, body: DebtBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    d = (await db.execute(select(Debt).where(Debt.id == id, Debt.user_id == current_user.id))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    if body.total_amount <= 0:
        raise HTTPException(status_code=422, detail="total_amount must be positive")
    if body.paid_amount < 0:
        raise HTTPException(status_code=422, detail="paid_amount cannot be negative")
    if body.paid_amount > body.total_amount:
        raise HTTPException(status_code=422, detail="paid_amount cannot exceed total_amount")
    d.name = body.name.strip()
    d.total_amount = body.total_amount
    d.paid_amount = body.paid_amount
    d.interest_rate = body.interest_rate
    d.target_date = body.target_date
    d.notes = body.notes
    await db.commit()
    await db.refresh(d)
    return _fmt(d)


@router.delete("/debts/{id}")
async def delete_debt(id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    d = (await db.execute(select(Debt).where(Debt.id == id, Debt.user_id == current_user.id))).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(d)
    await db.commit()
    return {"deleted": id}
