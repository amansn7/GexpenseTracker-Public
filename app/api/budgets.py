from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models import Budget, Transaction

router = APIRouter()


class BudgetBody(BaseModel):
    category: str
    monthly_limit: float


class BudgetPatch(BaseModel):
    monthly_limit: Optional[float] = None


@router.get("/budgets")
async def list_budgets(db: AsyncSession = Depends(get_db)):
    today = date.today()
    first_of_month = today.replace(day=1)

    budgets = (await db.execute(
        select(Budget).order_by(Budget.category)
    )).scalars().all()

    spend_rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("spent"))
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= first_of_month,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
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
async def create_budget(body: BudgetBody, db: AsyncSession = Depends(get_db)):
    if not body.category.strip():
        raise HTTPException(status_code=422, detail="category is required")
    if body.monthly_limit <= 0:
        raise HTTPException(status_code=422, detail="monthly_limit must be positive")
    b = Budget(category=body.category.strip(), monthly_limit=body.monthly_limit)
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return {"id": b.id, "category": b.category, "monthly_limit": float(b.monthly_limit)}


@router.patch("/budgets/{budget_id}")
async def update_budget(budget_id: int, body: BudgetPatch, db: AsyncSession = Depends(get_db)):
    b = (await db.execute(
        select(Budget).where(Budget.id == budget_id)
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


@router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: int, db: AsyncSession = Depends(get_db)):
    b = (await db.execute(
        select(Budget).where(Budget.id == budget_id)
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(b)
    await db.commit()
    return {"deleted": budget_id}
