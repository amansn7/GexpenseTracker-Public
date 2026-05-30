from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Budget, BudgetLink, Email, Transaction, User

router = APIRouter()


class BudgetBody(BaseModel):
    category: str
    monthly_limit: float


class BudgetPatch(BaseModel):
    monthly_limit: float | None = None


class BudgetLinkBody(BaseModel):
    source_category: str
    target_category: str
    split_amount: float


@router.get("/budgets")
async def list_budgets(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    first_of_month = today.replace(day=1)

    budgets = (
        (await db.execute(select(Budget).where(Budget.user_id == current_user.id).order_by(Budget.category)))
        .scalars()
        .all()
    )

    spend_rows = (
        await db.execute(
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
        )
    ).all()

    spend_map = {r.category: float(r.spent or 0) for r in spend_rows}

    # Linked spend: for each (source_category, split_amount) link, sum min(split_amount, txn.amount)
    # per matching transaction. Computed in Python to stay compatible with SQLite and PostgreSQL.
    linked_rows = (
        await db.execute(
            select(
                BudgetLink.target_category,
                BudgetLink.split_amount,
                Transaction.amount,
            )
            .join(Transaction, Transaction.category == BudgetLink.source_category)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                BudgetLink.user_id == current_user.id,
                Email.user_id == current_user.id,
                Transaction.label == "expense",
                Transaction.txn_date >= first_of_month,
                Transaction.txn_date <= today,
                Transaction.txn_date.isnot(None),
                Transaction.status != "needs_review",
            )
        )
    ).all()

    linked_map: dict[str, float] = {}
    for row in linked_rows:
        contrib = min(float(row.split_amount), float(row.amount or 0))
        linked_map[row.target_category] = linked_map.get(row.target_category, 0.0) + contrib

    result = []
    for b in budgets:
        direct = spend_map.get(b.category, 0.0)
        linked = linked_map.get(b.category, 0.0)
        spent = direct + linked
        limit = float(b.monthly_limit)
        pct = round(spent / limit * 100, 1) if limit > 0 else 0.0
        result.append(
            {
                "id": b.id,
                "category": b.category,
                "monthly_limit": limit,
                "spent_this_month": round(spent, 2),
                "pct": pct,
                "over_budget": spent > limit,
            }
        )

    return {"budgets": result}


@router.post("/budgets", status_code=201)
async def create_budget(
    body: BudgetBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
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


@router.get("/budgets/links")
async def list_budget_links(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    links = (
        (await db.execute(select(BudgetLink).where(BudgetLink.user_id == current_user.id).order_by(BudgetLink.id)))
        .scalars()
        .all()
    )
    return {
        "links": [
            {
                "id": lnk.id,
                "source_category": lnk.source_category,
                "target_category": lnk.target_category,
                "split_amount": float(lnk.split_amount),
            }
            for lnk in links
        ]
    }


@router.post("/budgets/links", status_code=201)
async def create_budget_link(
    body: BudgetLinkBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not body.source_category.strip():
        raise HTTPException(status_code=422, detail="source_category is required")
    if not body.target_category.strip():
        raise HTTPException(status_code=422, detail="target_category is required")
    if body.source_category.strip().lower() == body.target_category.strip().lower():
        raise HTTPException(status_code=422, detail="source and target categories must differ")
    if body.split_amount <= 0:
        raise HTTPException(status_code=422, detail="split_amount must be positive")
    from sqlalchemy.exc import IntegrityError

    lnk = BudgetLink(
        user_id=current_user.id,
        source_category=body.source_category.strip(),
        target_category=body.target_category.strip(),
        split_amount=body.split_amount,
    )
    db.add(lnk)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Link for this source/target pair already exists")
    await db.refresh(lnk)
    return {
        "id": lnk.id,
        "source_category": lnk.source_category,
        "target_category": lnk.target_category,
        "split_amount": float(lnk.split_amount),
    }


@router.delete("/budgets/links/{id}")
async def delete_budget_link(
    id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    lnk = (
        await db.execute(select(BudgetLink).where(BudgetLink.id == id, BudgetLink.user_id == current_user.id))
    ).scalar_one_or_none()
    if not lnk:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(lnk)
    await db.commit()
    return {"deleted": id}


@router.patch("/budgets/{id}")
async def update_budget(
    id: int, body: BudgetPatch, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    b = (
        await db.execute(select(Budget).where(Budget.id == id, Budget.user_id == current_user.id))
    ).scalar_one_or_none()
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
    b = (
        await db.execute(select(Budget).where(Budget.id == id, Budget.user_id == current_user.id))
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(b)
    await db.commit()
    return {"deleted": id}
