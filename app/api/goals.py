"""Goals service router — CRUD for savings goals and contributions."""

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Goal, GoalContribution, User

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: date | None = None
    category: str | None = None
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()

    @field_validator("target_amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("target_amount must be positive")
        return v


class GoalPatch(BaseModel):
    name: str | None = None
    target_amount: float | None = None
    target_date: date | None = None
    category: str | None = None
    notes: str | None = None
    active: bool | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("name must not be blank")
        return v.strip() if v is not None else v

    @field_validator("target_amount")
    @classmethod
    def amount_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("target_amount must be positive")
        return v


class ContributionCreate(BaseModel):
    amount: float
    note: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _compute_current_amount(db: AsyncSession, goal_id: str) -> float:
    """Return SUM of contributions for goal_id, 0.0 if none."""
    row = (
        await db.execute(select(func.sum(GoalContribution.amount)).where(GoalContribution.goal_id == goal_id))
    ).scalar()
    return float(row or 0.0)


def _build_response(goal: Goal, current_amount: float) -> dict:
    target = float(goal.target_amount)
    pct = round(min(current_amount / target * 100, 100.0), 2) if target > 0 else 0.0
    remaining = round(max(target - current_amount, 0.0), 2)
    return {
        "id": goal.id,
        "name": goal.name,
        "target_amount": target,
        "current_amount": round(current_amount, 2),
        "pct": pct,
        "remaining": remaining,
        "target_date": goal.target_date.isoformat() if goal.target_date else None,
        "category": goal.category,
        "notes": goal.notes,
        "active": goal.active,
        "created_at": goal.created_at.isoformat() if goal.created_at else None,
    }


async def _get_own_goal(goal_id: str, user: User, db: AsyncSession) -> Goal:
    """Fetch goal by id + user_id, raise 404 if missing."""
    g = (await db.execute(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Goal not found")
    return g


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/goals")
async def list_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goals = (
        (await db.execute(select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.created_at.desc())))
        .scalars()
        .all()
    )

    result = []
    for g in goals:
        try:
            current = await _compute_current_amount(db, g.id)
            result.append(_build_response(g, current))
        except Exception as exc:
            logger.exception("Failed to build response for goal %s: %s", g.id, exc)
            raise
    return {"goals": result}


@router.get("/goals/{goal_id}")
async def get_goal(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = await _get_own_goal(goal_id, current_user, db)
    current = await _compute_current_amount(db, g.id)
    return _build_response(g, current)


@router.post("/goals", status_code=201)
async def create_goal(
    body: GoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = Goal(
        user_id=current_user.id,
        name=body.name,
        target_amount=body.target_amount,
        target_date=body.target_date,
        category=body.category,
        notes=body.notes,
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _build_response(g, 0.0)


@router.patch("/goals/{goal_id}")
async def update_goal(
    goal_id: str,
    body: GoalPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = await _get_own_goal(goal_id, current_user, db)
    if body.name is not None:
        g.name = body.name
    if body.target_amount is not None:
        g.target_amount = body.target_amount
    if body.target_date is not None:
        g.target_date = body.target_date
    if body.category is not None:
        g.category = body.category
    if body.notes is not None:
        g.notes = body.notes
    if body.active is not None:
        g.active = body.active
    await db.commit()
    await db.refresh(g)
    current = await _compute_current_amount(db, g.id)
    return _build_response(g, current)


@router.post("/goals/{goal_id}/contributions", status_code=201)
async def add_contribution(
    goal_id: str,
    body: ContributionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    g = await _get_own_goal(goal_id, current_user, db)
    c = GoalContribution(
        goal_id=g.id,
        user_id=current_user.id,
        amount=body.amount,
        note=body.note,
    )
    db.add(c)
    await db.commit()
    await db.refresh(g)
    current = await _compute_current_amount(db, g.id)
    return _build_response(g, current)


@router.delete("/goals/{goal_id}")
async def delete_goal(
    goal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import delete as sa_delete

    g = await _get_own_goal(goal_id, current_user, db)
    gid = g.id
    # Delete contributions first (SQLite may not enforce FK cascade without PRAGMA)
    await db.execute(sa_delete(GoalContribution).where(GoalContribution.goal_id == gid))
    await db.delete(g)
    await db.commit()
    return {"deleted": gid}
