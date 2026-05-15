# Dashboard Analytics Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the dashboard with 5 analytics widgets (period picker, category donut, monthly trend, top merchants, budget vs actual, income vs expense), add a Budgets CRUD page, and apply an Axis Bank salary shift rule (income on day ≥ 25 → next month attribution).

**Architecture:** New `app/api/stats.py` provides 4 analytics endpoints; `app/api/budgets.py` provides Budget CRUD. All income grouping applies `_effective_month()` to shift Axis Bank salary. Dashboard template is a full replacement using inline SVG and vanilla JS. Budget model added to `app/models.py` with Alembic migration `0004_budgets.py`.

**Tech Stack:** Python 3.9.6, FastAPI, SQLAlchemy 2.0 async, Alembic, Jinja2, inline SVG (no chart libraries), aiosqlite (tests), asyncpg (prod).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/models.py` | Modify | Add `Budget` model |
| `alembic/versions/0004_budgets.py` | Create | Migration: budgets table |
| `app/api/stats.py` | Create | 4 analytics endpoints + income shift helpers |
| `app/api/budgets.py` | Create | Budget CRUD (GET/POST/PATCH/DELETE) |
| `app/main.py` | Modify | Register stats + budgets routers, add /budgets route |
| `templates/dashboard.html` | Replace | Period picker + 5 widgets + SVG charts |
| `templates/budgets.html` | Create | Budget management page |
| `templates/base.html` | Modify | Add Budgets nav link |

---

### Task 1: Budget model + Alembic migration

**Files:**
- Modify: `app/models.py`
- Create: `alembic/versions/0004_budgets.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_models.py`:
```python
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

@pytest.mark.asyncio
async def test_budget_model_create_and_query():
    from app.models import Base, Budget
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        b = Budget(category="Food", monthly_limit=4000.0)
        session.add(b)
        await session.commit()
        row = (await session.execute(select(Budget).where(Budget.category == "Food"))).scalar_one()
        assert row.id is not None
        assert float(row.monthly_limit) == 4000.0
        assert row.created_at is not None
    await engine.dispose()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker
pytest tests/test_models.py::test_budget_model_create_and_query -v
```
Expected: FAIL — `ImportError: cannot import name 'Budget'`

- [ ] **Step 3: Add Budget model to `app/models.py`**

Append after the `RecurringExpense` class:
```python
class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    monthly_limit: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
```

Also add `Budget` to the imports line at the top of any file that will use it (no change needed in models.py itself — `Integer` is already imported).

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_models.py::test_budget_model_create_and_query -v
```
Expected: PASS

- [ ] **Step 5: Create migration `alembic/versions/0004_budgets.py`**

```python
"""add budgets table

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-11 00:04:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budgets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('monthly_limit', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category'),
    )


def downgrade() -> None:
    op.drop_table('budgets')
```

- [ ] **Step 6: Commit**

```bash
git add app/models.py alembic/versions/0004_budgets.py tests/test_models.py
git commit -m "feat: add Budget model and migration 0004"
```

---

### Task 2: Stats API with income shift helper

**Files:**
- Create: `app/api/stats.py`
- Test: `tests/test_api.py` (append new tests)

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api.py`:
```python
import uuid
from datetime import date as date_cls


def _make_email(session_factory=None):
    """Helper — returns a dict of Email kwargs with unique gmail_id."""
    return {
        "gmail_id": str(uuid.uuid4()),
        "subject": "Test",
        "sender": "test@example.com",
        "sender_domain": "example.com",
    }


@pytest.mark.asyncio
async def test_effective_month_no_shift():
    from app.api.stats import _effective_month
    d = date_cls(2026, 3, 15)
    assert _effective_month(d, "income", "axis bank") == date_cls(2026, 3, 1)


@pytest.mark.asyncio
async def test_effective_month_shifts_axis_day_25():
    from app.api.stats import _effective_month
    d = date_cls(2026, 2, 28)
    assert _effective_month(d, "income", "AXIS BANK SALARY") == date_cls(2026, 3, 1)


@pytest.mark.asyncio
async def test_effective_month_no_shift_non_axis():
    from app.api.stats import _effective_month
    d = date_cls(2026, 2, 28)
    assert _effective_month(d, "income", "HDFC BANK") == date_cls(2026, 2, 1)


@pytest.mark.asyncio
async def test_effective_month_no_shift_expense():
    from app.api.stats import _effective_month
    d = date_cls(2026, 2, 28)
    # Expenses never shift
    assert _effective_month(d, "expense", "AXIS BANK") == date_cls(2026, 2, 1)


@pytest.mark.asyncio
async def test_stats_summary_empty(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/summary?period=1m")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_expenses"] == 0.0
        assert data["total_income"] == 0.0
        assert data["savings_rate"] == 0.0
        assert data["needs_review_count"] == 0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stats_category_breakdown_empty(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/category-breakdown?period=1m")
        assert resp.status_code == 200
        assert resp.json()["categories"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stats_top_merchants_empty(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/top-merchants?period=1m")
        assert resp.status_code == 200
        assert resp.json()["merchants"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_stats_monthly_trend_empty(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/stats/monthly-trend?period=1m")
        assert resp.status_code == 200
        data = resp.json()
        assert "months" in data
        assert isinstance(data["months"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_api.py::test_effective_month_no_shift tests/test_api.py::test_stats_summary_empty -v
```
Expected: FAIL — `ImportError: cannot import name '_effective_month' from 'app.api.stats'`

- [ ] **Step 3: Create `app/api/stats.py`**

```python
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models import Transaction, Email

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_months(d: date, n: int) -> date:
    """Add n months to date d, returning the 1st of that month."""
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    return d.replace(year=year, month=month, day=1)


def _effective_month(txn_date: date, label: str, sender: Optional[str]) -> date:
    """Return the month this transaction is attributed to.

    Axis Bank income on day >= 25 shifts to the 1st of the following month.
    All other transactions: 1st of their own month.
    """
    if (
        label == "income"
        and txn_date.day >= 25
        and sender
        and "axis" in sender.lower()
    ):
        return _add_months(txn_date, 1)
    return txn_date.replace(day=1)


def _period_start(period: str) -> date:
    """Return first day of the earliest month in the requested period."""
    today = date.today()
    if period == "3m":
        return _add_months(today, -2)
    if period == "6m":
        return _add_months(today, -5)
    if period == "1y":
        return _add_months(today, -11)
    # default: 1m — this month only
    return today.replace(day=1)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats/summary")
async def stats_summary(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)
    this_month = today.replace(day=1)

    # Expenses: filter by txn_date
    expense_rows = (await db.execute(
        select(Transaction.amount)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).scalars().all()

    # Income: fetch from one month before start to catch shifted entries,
    # then filter by effective_month in Python
    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "income",
            Transaction.txn_date >= _add_months(start, -1),
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    total_income = sum(
        float(r.amount or 0)
        for r in income_rows
        if start <= _effective_month(r.txn_date, "income", r.sender) <= this_month
    )
    total_expenses = sum(float(a or 0) for a in expense_rows)
    saved = total_income - total_expenses
    savings_rate = round(saved / total_income * 100, 1) if total_income > 0 else 0.0

    needs_review_count = (await db.execute(
        select(func.count()).select_from(Transaction)
        .where(Transaction.status == "needs_review")
    )).scalar_one()

    return {
        "total_expenses": round(total_expenses, 2),
        "total_income": round(total_income, 2),
        "saved": round(saved, 2),
        "savings_rate": savings_rate,
        "needs_review_count": needs_review_count,
    }


@router.get("/stats/category-breakdown")
async def stats_category_breakdown(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)

    rows = (await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
        .group_by(Transaction.category)
        .order_by(desc("total"))
    )).all()

    total = sum(float(r.total or 0) for r in rows)
    categories = [
        {
            "category": r.category or "Uncategorized",
            "amount": round(float(r.total or 0), 2),
            "pct": round(float(r.total or 0) / total * 100, 1) if total > 0 else 0.0,
        }
        for r in rows
    ]

    # Merge beyond top 6 into "Other"
    if len(categories) > 6:
        other_amount = sum(c["amount"] for c in categories[6:])
        categories = categories[:6]
        categories.append({
            "category": "Other",
            "amount": round(other_amount, 2),
            "pct": round(other_amount / total * 100, 1) if total > 0 else 0.0,
        })

    return {"categories": categories, "total": round(total, 2)}


@router.get("/stats/monthly-trend")
async def stats_monthly_trend(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)
    this_month = today.replace(day=1)

    # Build all month keys in range
    months: dict = {}
    m = start
    while m <= this_month:
        key = m.strftime("%Y-%m")
        months[key] = {"month": key, "expenses": 0.0, "income": 0.0}
        m = _add_months(m, 1)

    # Expenses by txn_date month
    expense_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in expense_rows:
        key = r.txn_date.strftime("%Y-%m")
        if key in months:
            months[key]["expenses"] += float(r.amount or 0)

    # Income by effective_month
    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "income",
            Transaction.txn_date >= _add_months(start, -1),
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in income_rows:
        em = _effective_month(r.txn_date, "income", r.sender)
        key = em.strftime("%Y-%m")
        if key in months:
            months[key]["income"] += float(r.amount or 0)

    result = sorted(months.values(), key=lambda x: x["month"])
    for entry in result:
        entry["expenses"] = round(entry["expenses"], 2)
        entry["income"] = round(entry["income"], 2)

    return {"months": result}


@router.get("/stats/top-merchants")
async def stats_top_merchants(period: str = "1m", db: AsyncSession = Depends(get_db)):
    today = date.today()
    start = _period_start(period)

    rows = (await db.execute(
        select(Transaction.merchant, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
            Transaction.merchant.isnot(None),
        )
        .group_by(Transaction.merchant)
        .order_by(desc("total"))
        .limit(8)
    )).all()

    return {
        "merchants": [
            {"merchant": r.merchant, "amount": round(float(r.total or 0), 2)}
            for r in rows
        ]
    }


@router.get("/stats/income-vs-expense")
async def stats_income_vs_expense(period: str = "1m", db: AsyncSession = Depends(get_db)):
    """Same shape as monthly-trend — delegates to the same logic."""
    today = date.today()
    start = _period_start(period)
    this_month = today.replace(day=1)

    months: dict = {}
    m = start
    while m <= this_month:
        key = m.strftime("%Y-%m")
        months[key] = {"month": key, "expenses": 0.0, "income": 0.0}
        m = _add_months(m, 1)

    expense_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount)
        .where(
            Transaction.label == "expense",
            Transaction.txn_date >= start,
            Transaction.txn_date <= today,
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in expense_rows:
        key = r.txn_date.strftime("%Y-%m")
        if key in months:
            months[key]["expenses"] += float(r.amount or 0)

    income_rows = (await db.execute(
        select(Transaction.txn_date, Transaction.amount, Email.sender)
        .join(Email, Transaction.email_id == Email.id)
        .where(
            Transaction.label == "income",
            Transaction.txn_date >= _add_months(start, -1),
            Transaction.txn_date.isnot(None),
            Transaction.status != "needs_review",
        )
    )).all()

    for r in income_rows:
        em = _effective_month(r.txn_date, "income", r.sender)
        key = em.strftime("%Y-%m")
        if key in months:
            months[key]["income"] += float(r.amount or 0)

    result = sorted(months.values(), key=lambda x: x["month"])
    for entry in result:
        entry["expenses"] = round(entry["expenses"], 2)
        entry["income"] = round(entry["income"], 2)

    return {"months": result}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_api.py::test_effective_month_no_shift \
       tests/test_api.py::test_effective_month_shifts_axis_day_25 \
       tests/test_api.py::test_effective_month_no_shift_non_axis \
       tests/test_api.py::test_effective_month_no_shift_expense \
       tests/test_api.py::test_stats_summary_empty \
       tests/test_api.py::test_stats_category_breakdown_empty \
       tests/test_api.py::test_stats_top_merchants_empty \
       tests/test_api.py::test_stats_monthly_trend_empty -v
```
Expected: PASS (routers not yet registered → routes 404 for now, but helper unit tests pass)

Note: The API endpoint tests will 404 until Task 4 registers the router. That's OK — run the helper unit tests first to validate logic, then re-run all after Task 4.

- [ ] **Step 5: Commit**

```bash
git add app/api/stats.py tests/test_api.py
git commit -m "feat: add stats API with Axis Bank income shift rule"
```

---

### Task 3: Budgets API

**Files:**
- Create: `app/api/budgets.py`
- Test: `tests/test_api.py` (append)

- [ ] **Step 1: Write failing tests**

Append to `tests/test_api.py`:
```python
@pytest.mark.asyncio
async def test_list_budgets_empty(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/budgets")
        assert resp.status_code == 200
        assert resp.json()["budgets"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_and_delete_budget(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/budgets", json={"category": "Food", "monthly_limit": 4000})
            assert resp.status_code == 201
            created = resp.json()
            assert created["category"] == "Food"
            assert created["monthly_limit"] == 4000.0
            budget_id = created["id"]

            resp2 = await client.get("/api/budgets")
            assert any(b["category"] == "Food" for b in resp2.json()["budgets"])

            resp3 = await client.delete(f"/api/budgets/{budget_id}")
            assert resp3.status_code == 200

            resp4 = await client.get("/api/budgets")
            assert resp4.json()["budgets"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_budget(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = (await client.post("/api/budgets", json={"category": "Shopping", "monthly_limit": 3000})).json()
            budget_id = created["id"]
            resp = await client.patch(f"/api/budgets/{budget_id}", json={"monthly_limit": 5000})
            assert resp.status_code == 200
            assert resp.json()["monthly_limit"] == 5000.0
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_api.py::test_list_budgets_empty -v
```
Expected: FAIL — 404 (router not registered yet)

- [ ] **Step 3: Create `app/api/budgets.py`**

```python
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

    # Actual spend per category this month (expenses only, confirmed)
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
```

- [ ] **Step 4: Commit (router not yet registered — tests still fail)**

```bash
git add app/api/budgets.py tests/test_api.py
git commit -m "feat: add budgets CRUD API"
```

---

### Task 4: Register routers + add routes in `app/main.py`

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Update imports and router registrations**

Replace the existing import line:
```python
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api
```
with:
```python
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api
from app.api import stats as stats_api, budgets as budgets_api
```

After the existing `app.include_router(recurring_api.router, prefix="/api")` line, add:
```python
app.include_router(stats_api.router, prefix="/api")
app.include_router(budgets_api.router, prefix="/api")
```

After the existing `@app.get("/recurring", ...)` route, add:
```python
@app.get("/budgets", response_class=HTMLResponse)
async def budgets_page(request: Request):
    return templates.TemplateResponse("budgets.html", {"request": request})
```

- [ ] **Step 2: Run all stats + budgets tests**

```bash
pytest tests/test_api.py::test_stats_summary_empty \
       tests/test_api.py::test_stats_category_breakdown_empty \
       tests/test_api.py::test_stats_top_merchants_empty \
       tests/test_api.py::test_stats_monthly_trend_empty \
       tests/test_api.py::test_list_budgets_empty \
       tests/test_api.py::test_create_and_delete_budget \
       tests/test_api.py::test_update_budget -v
```
Expected: all PASS

- [ ] **Step 3: Run full test suite**

```bash
pytest -v
```
Expected: all tests pass (no regressions)

- [ ] **Step 4: Commit**

```bash
git add app/main.py
git commit -m "feat: register stats and budgets routers, add /budgets page route"
```

---

### Task 5: Dashboard template redesign

**Files:**
- Replace: `templates/dashboard.html`

- [ ] **Step 1: Replace `templates/dashboard.html` with the following**

```html
{% extends "base.html" %}
{% block content %}

<!-- Service alerts -->
<div id="alerts-wrap" style="margin-bottom:16px"></div>

<!-- Period picker -->
<div style="display:flex;gap:8px;margin-bottom:20px;align-items:center">
  <span style="font-size:12px;color:#555;margin-right:4px">Period:</span>
  <button class="period-tab" data-period="1m" onclick="setPeriod('1m')">This month</button>
  <button class="period-tab" data-period="3m" onclick="setPeriod('3m')">3 months</button>
  <button class="period-tab" data-period="6m" onclick="setPeriod('6m')">6 months</button>
  <button class="period-tab" data-period="1y" onclick="setPeriod('1y')">This year</button>
</div>

<!-- Stat strip -->
<div class="stat-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px">
  <div class="stat-card"><div class="label">Expenses</div><div class="value expense" id="s-expense">&#8377;&#8212;</div></div>
  <div class="stat-card"><div class="label">Income</div><div class="value income" id="s-income">&#8377;&#8212;</div></div>
  <div class="stat-card"><div class="label">Saved</div><div class="value income" id="s-saved">&#8377;&#8212;</div></div>
  <div class="stat-card"><div class="label">Savings Rate</div><div class="value" id="s-rate" style="color:#7c83fd">&#8212;</div></div>
  <div class="stat-card"><div class="label">Needs Review</div><div class="value warn" id="s-review">&#8212;</div></div>
</div>

<!-- Row 1: Trend (2/3) + Donut (1/3) -->
<div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">

  <!-- Monthly Trend -->
  <div class="card">
    <div class="card-header">
      Monthly Trend
      <span id="trend-legend" style="font-size:11px;color:#555"></span>
    </div>
    <div style="padding:16px">
      <svg id="trend-svg" viewBox="0 0 500 120" width="100%" style="display:block;overflow:visible">
        <text x="250" y="60" text-anchor="middle" fill="#333" font-size="13">Loading…</text>
      </svg>
    </div>
  </div>

  <!-- Category Donut -->
  <div class="card">
    <div class="card-header">Category Breakdown</div>
    <div style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px">
      <svg id="donut-svg" viewBox="0 0 180 180" width="160" height="160" style="display:block;overflow:visible">
        <circle cx="90" cy="90" r="60" fill="none" stroke="#1e1e32" stroke-width="22"/>
        <text x="90" y="95" text-anchor="middle" fill="#333" font-size="13">Loading…</text>
      </svg>
      <div id="donut-legend" style="width:100%;max-width:200px"></div>
    </div>
  </div>

</div>

<!-- Row 2: Merchants (1/2) + Income vs Expense (1/2) -->
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">

  <!-- Top Merchants -->
  <div class="card">
    <div class="card-header">Top Merchants</div>
    <div id="merchants-list" style="padding:16px">
      <div style="color:#333;text-align:center;padding:20px">Loading…</div>
    </div>
  </div>

  <!-- Income vs Expense -->
  <div class="card">
    <div class="card-header">
      Income vs Expense
      <span style="font-size:11px;color:#555"><span style="color:#5db87d">●</span> Income &nbsp;<span style="color:#e07070">●</span> Expense</span>
    </div>
    <div style="padding:16px">
      <svg id="ive-svg" viewBox="0 0 400 120" width="100%" style="display:block;overflow:visible">
        <text x="200" y="60" text-anchor="middle" fill="#333" font-size="13">Loading…</text>
      </svg>
    </div>
  </div>

</div>

<!-- Row 3: Budget vs Actual (full width) -->
<div class="card" style="margin-bottom:16px">
  <div class="card-header">
    Budget vs Actual <span style="font-size:11px;color:#555">(current month)</span>
    <a href="/budgets" class="link" style="font-size:12px">Manage budgets &rarr;</a>
  </div>
  <div id="budget-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px">
    <div style="color:#333;text-align:center;padding:20px;grid-column:1/-1">Loading…</div>
  </div>
</div>

<style>
.period-tab {
  background: transparent;
  border: 1px solid #2a2a4a;
  color: #666;
  border-radius: 6px;
  padding: 5px 14px;
  font-size: 12px;
  cursor: pointer;
}
.period-tab.active {
  background: #7c83fd;
  border-color: #7c83fd;
  color: #fff;
}
</style>

<script>
function _esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _inr(n) { return '\u20B9' + Number(n).toLocaleString('en-IN', {minimumFractionDigits:2}); }

// ── Period picker ──────────────────────────────────────────────
let _period = localStorage.getItem('dashboard_period') || '1m';

function setPeriod(p) {
  _period = p;
  localStorage.setItem('dashboard_period', p);
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === p);
  });
  loadCharts(p);
}

// ── Alerts ─────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    const alerts = await fetch('/api/alerts').then(r => r.json());
    const wrap = document.getElementById('alerts-wrap');
    const unread = alerts.filter(a => !a.read);
    if (!unread.length) { wrap.innerHTML = ''; return; }
    const colors = { error:'#e07070', warning:'#f0a500', info:'#7c83fd' };
    wrap.innerHTML = unread.map(a => `
      <div style="display:flex;align-items:flex-start;gap:10px;background:#1a1a2e;border:1px solid ${colors[a.level]||'#2a2a4a'};border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px">
        <span style="color:${colors[a.level]};font-weight:700;flex-shrink:0">${a.level.toUpperCase()}</span>
        <div style="flex:1"><span style="color:#ccc">${_esc(a.message)}</span><span style="color:#444;font-size:11px;margin-left:8px">${new Date(a.ts).toLocaleTimeString('en-IN')}</span></div>
        <button onclick="clearAlerts()" style="background:none;border:none;color:#444;cursor:pointer;font-size:16px;padding:0 2px">&times;</button>
      </div>`).join('');
  } catch(e) {}
}

async function clearAlerts() {
  await fetch('/api/alerts/clear', { method: 'POST' });
  document.getElementById('alerts-wrap').innerHTML = '';
}

// ── Chart renderers ────────────────────────────────────────────
const COLORS = ['#e07070','#7c83fd','#5db87d','#f0a500','#a78bfa','#60c9e0','#f08080'];

function renderSummary(data) {
  document.getElementById('s-expense').textContent = _inr(data.total_expenses);
  document.getElementById('s-income').textContent  = _inr(data.total_income);
  document.getElementById('s-saved').textContent   = _inr(data.saved);
  document.getElementById('s-rate').textContent    = data.savings_rate.toFixed(1) + '%';
  document.getElementById('s-review').textContent  = data.needs_review_count + ' emails';
  // Update nav badge
  const badge = document.getElementById('review-count');
  if (badge) {
    if (data.needs_review_count > 0) { badge.textContent = data.needs_review_count; badge.style.display = 'inline'; }
    else badge.style.display = 'none';
  }
}

function renderDonut(categories) {
  const svg = document.getElementById('donut-svg');
  const leg = document.getElementById('donut-legend');
  if (!categories.length) {
    svg.innerHTML = '<circle cx="90" cy="90" r="60" fill="none" stroke="#1e1e32" stroke-width="22"/><text x="90" y="95" text-anchor="middle" fill="#555" font-size="12">No data</text>';
    leg.innerHTML = '';
    return;
  }
  const cx = 90, cy = 90, r = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let circles = '<circle cx="90" cy="90" r="60" fill="none" stroke="#1e1e32" stroke-width="22"/>';
  let legend = '';
  const total = categories.reduce((s, c) => s + c.amount, 0);
  categories.forEach((cat, i) => {
    const pct = total > 0 ? cat.amount / total : 0;
    const dash = pct * circ;
    const gap  = circ - dash;
    const color = COLORS[i % COLORS.length];
    circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="22"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += dash;
    legend += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#888;margin-bottom:4px">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(cat.category)}</span>
      <span style="color:#ccc;font-weight:600;white-space:nowrap">\u20B9${cat.amount.toLocaleString('en-IN')}</span>
    </div>`;
  });
  svg.innerHTML = circles;
  leg.innerHTML = legend;
}

function renderTrend(months) {
  const svg = document.getElementById('trend-svg');
  const leg = document.getElementById('trend-legend');
  if (!months.length) {
    svg.innerHTML = '<text x="250" y="60" text-anchor="middle" fill="#555" font-size="13">No data</text>';
    leg.innerHTML = '';
    return;
  }
  const W=500, H=120, pL=50, pR=20, pT=10, pB=30;
  const cW = W-pL-pR, cH = H-pT-pB;
  const n = months.length;
  const maxVal = Math.max(...months.map(m => Math.max(m.expenses, m.income)), 1);
  const xOf = i => pL + (n === 1 ? cW/2 : (i/(n-1))*cW);
  const yOf = v => pT + cH - (v/maxVal)*cH;
  const expPts = months.map((m,i) => `${xOf(i).toFixed(1)},${yOf(m.expenses).toFixed(1)}`).join(' ');
  const incPts = months.map((m,i) => `${xOf(i).toFixed(1)},${yOf(m.income).toFixed(1)}`).join(' ');
  const hasIncome = months.some(m => m.income > 0);
  let s = `<line x1="${pL}" y1="${pT+cH}" x2="${W-pR}" y2="${pT+cH}" stroke="#2a2a4a" stroke-width="1"/>`;
  if (hasIncome) s += `<polyline points="${incPts}" fill="none" stroke="#5db87d" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<polyline points="${expPts}" fill="none" stroke="#e07070" stroke-width="2" stroke-linejoin="round"/>`;
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  months.forEach((m,i) => {
    const lbl = MONS[parseInt(m.month.split('-')[1])-1];
    s += `<text x="${xOf(i).toFixed(1)}" y="${H-4}" text-anchor="middle" font-size="9" fill="#444">${lbl}</text>`;
  });
  svg.innerHTML = s;
  leg.innerHTML = `<span style="color:#e07070">&#9679; Expense</span>${hasIncome ? '<span style="color:#5db87d;margin-left:12px">&#9679; Income</span>' : ''}`;
}

function renderMerchants(merchants) {
  const el = document.getElementById('merchants-list');
  if (!merchants.length) {
    el.innerHTML = '<div style="color:#555;text-align:center;padding:20px">No merchant data for this period</div>';
    return;
  }
  const max = merchants[0].amount;
  el.innerHTML = merchants.map(m => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;color:#888;margin-bottom:4px;font-size:12px">
        <span>${_esc(m.merchant)}</span>
        <span style="color:#e07070">\u20B9${m.amount.toLocaleString('en-IN')}</span>
      </div>
      <div style="height:5px;background:#2a2a4a;border-radius:3px">
        <div style="width:${max > 0 ? (m.amount/max*100).toFixed(1) : 0}%;height:5px;background:#e07070;border-radius:3px"></div>
      </div>
    </div>`).join('');
}

function renderIncomeVsExpense(months) {
  const svg = document.getElementById('ive-svg');
  if (!months.length) {
    svg.innerHTML = '<text x="200" y="60" text-anchor="middle" fill="#555" font-size="13">No data</text>';
    return;
  }
  const W=400, H=120, pL=10, pR=10, pT=10, pB=25;
  const cW=W-pL-pR, cH=H-pT-pB;
  const maxVal = Math.max(...months.map(m => Math.max(m.income, m.expenses)), 1);
  const n = months.length;
  const groupW = cW / n;
  const barW = Math.min(groupW * 0.35, 18);
  const MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let s = `<line x1="${pL}" y1="${pT+cH}" x2="${W-pR}" y2="${pT+cH}" stroke="#2a2a4a" stroke-width="1"/>`;
  months.forEach((m, i) => {
    const cx = pL + i*groupW + groupW/2;
    const x1 = cx - barW - 1;
    const x2 = cx + 1;
    const hInc = m.income   > 0 ? (m.income   / maxVal) * cH : 0;
    const hExp = m.expenses > 0 ? (m.expenses / maxVal) * cH : 0;
    if (hInc > 0) s += `<rect x="${x1.toFixed(1)}" y="${(pT+cH-hInc).toFixed(1)}" width="${barW.toFixed(1)}" height="${hInc.toFixed(1)}" fill="#5db87d" rx="2"/>`;
    if (hExp > 0) s += `<rect x="${x2.toFixed(1)}" y="${(pT+cH-hExp).toFixed(1)}" width="${barW.toFixed(1)}" height="${hExp.toFixed(1)}" fill="#e07070" rx="2"/>`;
    const lbl = MONS[parseInt(m.month.split('-')[1])-1];
    s += `<text x="${cx}" y="${H-4}" text-anchor="middle" font-size="8" fill="#444">${lbl}</text>`;
  });
  svg.innerHTML = s;
}

function renderBudget(budgets) {
  const el = document.getElementById('budget-grid');
  if (!budgets.length) {
    el.innerHTML = '<div style="color:#555;padding:20px;text-align:center;grid-column:1/-1">No budgets set. <a href="/budgets" class="link">Add budget limits &rarr;</a></div>';
    return;
  }
  el.innerHTML = budgets.map(b => {
    const color = b.pct >= 100 ? '#e07070' : b.pct >= 70 ? '#f0a500' : '#5db87d';
    const pctW  = Math.min(b.pct, 100).toFixed(1);
    return `<div style="background:#13131f;border:1px solid #2a2a4a;border-radius:8px;padding:12px">
      <div style="font-size:12px;color:#888;margin-bottom:4px">${_esc(b.category)}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
        <span style="color:${color};font-weight:600">\u20B9${b.spent_this_month.toLocaleString('en-IN')}</span>
        <span style="color:#444">/ \u20B9${b.monthly_limit.toLocaleString('en-IN')}</span>
      </div>
      <div style="height:5px;background:#2a2a4a;border-radius:3px">
        <div style="width:${pctW}%;height:5px;background:${color};border-radius:3px;transition:width .3s"></div>
      </div>
    </div>`;
  }).join('');
}

// ── Main loader ────────────────────────────────────────────────
async function loadCharts(period) {
  try {
    const [summary, categories, trend, merchants, ive, budgets] = await Promise.all([
      fetch(`/api/stats/summary?period=${period}`).then(r => r.json()),
      fetch(`/api/stats/category-breakdown?period=${period}`).then(r => r.json()),
      fetch(`/api/stats/monthly-trend?period=${period}`).then(r => r.json()),
      fetch(`/api/stats/top-merchants?period=${period}`).then(r => r.json()),
      fetch(`/api/stats/income-vs-expense?period=${period}`).then(r => r.json()),
      fetch('/api/budgets').then(r => r.json()),
    ]);
    renderSummary(summary);
    renderDonut(categories.categories);
    renderTrend(trend.months);
    renderMerchants(merchants.merchants);
    renderIncomeVsExpense(ive.months);
    renderBudget(budgets.budgets);
  } catch(e) {
    console.error('Dashboard load error:', e);
  }
}

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set active tab
  document.querySelectorAll('.period-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === _period);
  });
  loadAlerts();
  loadCharts(_period);
});
</script>
{% endblock %}
```

- [ ] **Step 2: Start the dev server and verify in browser**

```bash
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000 — verify:
- Period picker tabs visible at top
- 5 stat cards render (show ₹— until data loads)
- 5 widget sections visible with "Loading…" states
- Charts render after fetch completes (or show "No data" if DB is empty)
- Switching period tabs re-fetches all charts
- Period selection persists after page reload (localStorage)
- Alerts section renders if any alerts exist

- [ ] **Step 3: Commit**

```bash
git add templates/dashboard.html
git commit -m "feat: redesign dashboard with analytics widgets and period picker"
```

---

### Task 6: Budgets management page

**Files:**
- Create: `templates/budgets.html`

- [ ] **Step 1: Create `templates/budgets.html`**

```html
{% extends "base.html" %}
{% block content %}

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
  <h2 style="font-size:20px;font-weight:700;color:#e0e0e0">Monthly Budgets</h2>
  <button class="btn-primary" onclick="showAddForm()">+ Add budget</button>
</div>

<!-- Add form (hidden by default) -->
<div id="add-form" class="card" style="display:none;margin-bottom:20px;padding:16px">
  <div style="display:flex;gap:12px;align-items:flex-end">
    <div style="flex:1">
      <label style="font-size:11px;color:#888;display:block;margin-bottom:4px">Category</label>
      <input id="new-cat" type="text" placeholder="e.g. Food" style="width:100%">
    </div>
    <div style="flex:1">
      <label style="font-size:11px;color:#888;display:block;margin-bottom:4px">Monthly limit (₹)</label>
      <input id="new-limit" type="number" min="1" placeholder="4000" style="width:100%">
    </div>
    <button class="btn-primary" onclick="createBudget()">Save</button>
    <button class="btn-ghost" onclick="hideAddForm()">Cancel</button>
  </div>
  <div id="add-error" style="color:#e07070;font-size:12px;margin-top:8px;display:none"></div>
</div>

<!-- Table -->
<div class="card">
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Monthly Limit</th>
        <th>This Month Spent</th>
        <th>% Used</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="budgets-body">
      <tr><td colspan="5" style="color:#555;padding:20px;text-align:center">Loading…</td></tr>
    </tbody>
  </table>
</div>

<script>
function _esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let _budgets = [];

async function loadBudgets() {
  const data = await fetch('/api/budgets').then(r => r.json());
  _budgets = data.budgets;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('budgets-body');
  if (!_budgets.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#555;padding:24px;text-align:center">No budgets yet. Click "Add budget" to create one.</td></tr>';
    return;
  }
  tbody.innerHTML = _budgets.map(b => {
    const color = b.pct >= 100 ? '#e07070' : b.pct >= 70 ? '#f0a500' : '#5db87d';
    return `<tr id="row-${b.id}">
      <td style="font-weight:500">${_esc(b.category)}</td>
      <td>
        <span id="limit-display-${b.id}">&#8377;${b.monthly_limit.toLocaleString('en-IN')}</span>
        <input id="limit-input-${b.id}" type="number" min="1"
          style="display:none;width:100px;background:#111;color:#ccc;border:1px solid #7c83fd;border-radius:4px;padding:3px 6px;font-size:13px"
          value="${b.monthly_limit}"
          onkeydown="if(event.key==='Enter')saveBudget(${b.id})"
          onblur="saveBudget(${b.id})">
      </td>
      <td style="color:${color}">&#8377;${b.spent_this_month.toLocaleString('en-IN')}</td>
      <td>
        <span style="color:${color};font-weight:600">${b.pct.toFixed(1)}%</span>
        <div style="margin-top:4px;height:4px;background:#2a2a4a;border-radius:2px;width:80px">
          <div style="width:${Math.min(b.pct,100).toFixed(1)}%;height:4px;background:${color};border-radius:2px"></div>
        </div>
      </td>
      <td>
        <button onclick="editBudget(${b.id})" class="btn-ghost" style="padding:3px 10px;font-size:12px;margin-right:6px">Edit</button>
        <button onclick="deleteBudget(${b.id})" style="background:none;border:none;color:#e07070;cursor:pointer;font-size:12px;padding:3px 6px">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function showAddForm() {
  document.getElementById('add-form').style.display = 'block';
  document.getElementById('new-cat').focus();
  document.getElementById('add-error').style.display = 'none';
}

function hideAddForm() {
  document.getElementById('add-form').style.display = 'none';
  document.getElementById('new-cat').value = '';
  document.getElementById('new-limit').value = '';
}

async function createBudget() {
  const cat   = document.getElementById('new-cat').value.trim();
  const limit = parseFloat(document.getElementById('new-limit').value);
  const errEl = document.getElementById('add-error');

  if (!cat) { errEl.textContent = 'Category is required'; errEl.style.display = 'block'; return; }
  if (!limit || limit <= 0) { errEl.textContent = 'Monthly limit must be positive'; errEl.style.display = 'block'; return; }

  const resp = await fetch('/api/budgets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: cat, monthly_limit: limit }),
  });

  if (resp.ok) {
    hideAddForm();
    await loadBudgets();
  } else {
    const err = await resp.json();
    errEl.textContent = err.detail || 'Error creating budget';
    errEl.style.display = 'block';
  }
}

function editBudget(id) {
  // Show inline input, hide display span
  document.getElementById(`limit-display-${id}`).style.display = 'none';
  const inp = document.getElementById(`limit-input-${id}`);
  inp.style.display = 'inline-block';
  inp.focus();
  inp.select();
}

async function saveBudget(id) {
  const inp = document.getElementById(`limit-input-${id}`);
  if (!inp || inp.style.display === 'none') return;
  const limit = parseFloat(inp.value);
  if (!limit || limit <= 0) {
    // Reset to original
    inp.style.display = 'none';
    document.getElementById(`limit-display-${id}`).style.display = 'inline';
    return;
  }
  inp.style.display = 'none';
  document.getElementById(`limit-display-${id}`).style.display = 'inline';

  await fetch(`/api/budgets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monthly_limit: limit }),
  });
  await loadBudgets();
}

async function deleteBudget(id) {
  await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
  await loadBudgets();
}

loadBudgets();
</script>
{% endblock %}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:8000/budgets — verify:
- "Monthly Budgets" header + "Add budget" button visible
- Empty state message shown when no budgets
- Clicking "Add budget" shows inline form
- Adding a budget (e.g. "Food", 4000) saves and shows in table
- Edit button switches limit to an editable input; pressing Enter or clicking away saves
- Delete removes row immediately
- "This Month Spent" shows actual spend from transactions

- [ ] **Step 3: Commit**

```bash
git add templates/budgets.html
git commit -m "feat: add budgets management page"
```

---

### Task 7: Add Budgets nav link in base template

**Files:**
- Modify: `templates/base.html`

- [ ] **Step 1: Add nav link in `templates/base.html`**

In `templates/base.html`, after the Recurring nav link:
```html
<a href="/recurring" id="nav-recurring">Recurring</a>
```
Add:
```html
<a href="/budgets" id="nav-budgets">Budgets</a>
```

Also add the active-state highlight. After the `else if (path.startsWith('/recurring'))` line in the inline script block at the bottom of base.html:
```javascript
else if (path.startsWith('/recurring')) document.getElementById('nav-recurring').classList.add('active');
```
Add:
```javascript
else if (path.startsWith('/budgets')) document.getElementById('nav-budgets').classList.add('active');
```

- [ ] **Step 2: Verify in browser**

Reload any page — "Budgets" appears in nav. Clicking it navigates to `/budgets` with active highlight.

- [ ] **Step 3: Run full test suite**

```bash
pytest -v
```
Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add templates/base.html
git commit -m "feat: add Budgets link to nav"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ 5 widgets: donut, trend, top merchants, budget vs actual, income vs expense
- ✅ Period picker: 1m/3m/6m/1y, controls all widgets together, persists in localStorage
- ✅ Axis Bank income shift: day ≥ 25, shifts to next month, expenses unaffected
- ✅ Budget page: CRUD with inline edit, empty state, delete
- ✅ Stat strip: Expenses/Income/Saved/Rate/Review (period-controlled)
- ✅ Budget vs Actual: always current month, "Manage budgets →" link
- ✅ Top merchants: top 8, sorted desc by amount
- ✅ Category donut: max 6 categories + "Other"
- ✅ Alembic migration 0004 chained from 0003
- ✅ Nav link for Budgets in base.html

**No placeholders found.**

**Type consistency:** `_effective_month()` signature is `(txn_date: date, label: str, sender: Optional[str]) -> date` — consistent across all usages in stats.py tests and production code.
