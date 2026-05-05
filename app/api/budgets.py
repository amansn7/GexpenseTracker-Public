from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Budget, Transaction, Email, User

router = APIRouter()


class BudgetBody(BaseModel):
    category: str
    monthly_limit: float


class BudgetPatch(BaseModel):
    monthly_limit: Optional[float] = None


@router.get("/budgets")
async def list_budgets(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    first_of_month = today.replace(day=1)

    budgets = (await db.execute(
        select(Budget).where(Budget.user_id == current_user.id).order_by(Budget.category)
    )).scalars().all()

    spend_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("spent"))
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= first_of_month,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            # Exclude needs_review: unreviewed transactions may not be confirmed expenses
            Transaction.status != "needs_review",
            Email.user_id == current_user.id,
        )
        .group_by(Transaction.category)
    )).all()

    spend_map = {r.category: float(r.spent or 0) for r in spend_rows}

    result = []
    for b in budgets:
        spent = spend_map.get(b.category, 0.0)
        limit = float(b.monthly_limit)
        pct = round(spent / limit * 100, 1) if limit > 0 else 0.0
        result.append({
            "id": b.id,
            "category": b.category,
            "monthly_limit": limit,
            "spent_this_month": round(spent, 2),
            "pct": pct,
            "over_budget": spent > limit,
        })

    return {"budgets": result}


@router.post("/budgets", status_code=201)
async def create_budget(body: BudgetBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not body.category.strip():
        raise HTTPException(status_code=422, detail="category is required")
    if body.monthly_limit <= 0:
        raise HTTPException(status_code=422, detail="monthly_limit must be positive")
    from sqlalchemy.exc import IntegrityError
    b = Budget(user_id=current_user.id, category=body.category.strip(), monthly_limit=body.monthly_limit)
    db.add(b)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Budget for this category already exists")
    await db.refresh(b)
    return {"id": b.id, "category": b.category, "monthly_limit": float(b.monthly_limit)}


@router.patch("/budgets/{id}")
async def update_budget(id: int, body: BudgetPatch, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = (await db.execute(
        select(Budget).where(Budget.id == id, Budget.user_id == current_user.id)
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    if body.monthly_limit is not None:
        if body.monthly_limit <= 0:
            raise HTTPException(status_code=422, detail="monthly_limit must be positive")
        b.monthly_limit = body.monthly_limit
    await db.commit()
    await db.refresh(b)
    return {"id": b.id, "category": b.category, "monthly_limit": float(b.monthly_limit)}


@router.delete("/budgets/{id}")
async def delete_budget(id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = (await db.execute(
        select(Budget).where(Budget.id == id, Budget.user_id == current_user.id)
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(b)
    await db.commit()
    return {"deleted": id}
