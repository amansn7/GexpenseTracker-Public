# Budget Edit + Category Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make budget cards clickable to edit their limits, and add a Category Links feature that allocates a fixed amount from one category's transactions toward another budget (e.g. ₹2,000 of every Rent payment fills the Maintenance budget).

**Architecture:** New `budget_links` DB table (source_category → target_category, split_amount). `GET /api/budgets` computes linked spend via `LEAST(split_amount, txn.amount)` summed per target budget. New `/api/budgets/links` CRUD endpoints. Frontend adds onClick to budget cards and a collapsible Category Links section that prefills split amounts from existing recurring expenses.

**Tech Stack:** FastAPI + SQLAlchemy async, PostgreSQL (`func.least`), Alembic migrations, pytest + httpx AsyncClient, React/JSX compiled with `esbuild`.

---

### Task 1: BudgetLink model + migration

**Files:**
- Modify: `app/models/financial.py` — append `BudgetLink` class
- Modify: `app/models/__init__.py` — add `BudgetLink` to import and `__all__`
- Create: `alembic/versions/0049_add_budget_links.py`

- [ ] **Step 1: Add BudgetLink model to `app/models/financial.py`**

Append after the `Budget` class (after line 29):

```python
class BudgetLink(Base):
    __tablename__ = "budget_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_category: Mapped[str] = mapped_column(String(100), nullable=False)
    target_category: Mapped[str] = mapped_column(String(100), nullable=False)
    split_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (
        sa.UniqueConstraint("user_id", "source_category", "target_category", name="uq_budget_link_user_src_tgt"),
    )
```

- [ ] **Step 2: Export BudgetLink from `app/models/__init__.py`**

In the `from .financial import (...)` block, add `BudgetLink,` after `Budget,`.

In the `__all__` list under `# financial`, add `"BudgetLink",` after `"Budget",`.

- [ ] **Step 3: Create migration `alembic/versions/0049_add_budget_links.py`**

```python
"""Add budget_links table

Revision ID: 0049
Revises: 0048
Create Date: 2026-05-30

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0049"
down_revision: Union[str, None] = "0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budget_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("source_category", sa.String(100), nullable=False),
        sa.Column("target_category", sa.String(100), nullable=False),
        sa.Column("split_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "source_category", "target_category",
            name="uq_budget_link_user_src_tgt"
        ),
    )
    op.create_index("ix_budget_links_user_id", "budget_links", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_budget_links_user_id", table_name="budget_links")
    op.drop_table("budget_links")
```

- [ ] **Step 4: Commit**

```bash
git add app/models/financial.py app/models/__init__.py alembic/versions/0049_add_budget_links.py
git commit -m "feat: add BudgetLink model and migration 0049"
```

---

### Task 2: Tests for Category Links API

**Files:**
- Create: `tests/test_budget_links.py`

- [ ] **Step 1: Write failing tests**

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_list_links_empty(db_session, mock_user):
    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/budgets/links")
        assert resp.status_code == 200
        assert resp.json() == {"links": []}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_link(db_session, mock_user):
    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
            )
        assert resp.status_code == 201
        body = resp.json()
        assert body["source_category"] == "Rent"
        assert body["target_category"] == "Maintenance"
        assert body["split_amount"] == 2000.0
        assert "id" in body
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_link_duplicate_returns_409(db_session, mock_user):
    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
            )
            resp = await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 3000},
            )
        assert resp.status_code == 409
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_link_same_category_returns_422(db_session, mock_user):
    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Rent", "split_amount": 1000},
            )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_link_zero_amount_returns_422(db_session, mock_user):
    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 0},
            )
        assert resp.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_delete_link(db_session, mock_user):
    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = (
                await client.post(
                    "/api/budgets/links",
                    json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
                )
            ).json()
            resp = await client.delete(f"/api/budgets/links/{created['id']}")
            assert resp.status_code == 200
            listing = await client.get("/api/budgets/links")
            assert listing.json()["links"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_budget_links.py -v 2>&1 | head -30
```

Expected: errors like `404 Not Found` or `AttributeError` — the endpoints don't exist yet.

---

### Task 3: Implement Category Links API endpoints

**Files:**
- Modify: `app/api/budgets.py` — add links CRUD before the existing `{id}` routes

- [ ] **Step 1: Add imports and Pydantic model to `app/api/budgets.py`**

At the top of the file, add `BudgetLink` to the models import:

```python
from app.models import Budget, BudgetLink, Email, Transaction, User
```

After the existing `BudgetPatch` class, add:

```python
class BudgetLinkBody(BaseModel):
    source_category: str
    target_category: str
    split_amount: float
```

- [ ] **Step 2: Add links endpoints to `app/api/budgets.py`**

Insert these three routes BEFORE the existing `@router.patch("/budgets/{id}")` route:

```python
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
```

- [ ] **Step 3: Run tests to confirm they pass**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_budget_links.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/budgets.py tests/test_budget_links.py
git commit -m "feat: add Category Links CRUD endpoints + tests"
```

---

### Task 4: Tests for linked spend calculation

**Files:**
- Modify: `tests/test_budget_links.py` — append spend calculation test

- [ ] **Step 1: Append failing spend test**

Look up how `db_session`, `mock_user`, `Email`, and `Transaction` are created in `tests/conftest.py` — the pattern matches Task 2's fixtures exactly. Append to `tests/test_budget_links.py`:

```python
from datetime import date, timezone, datetime

from app.models import Budget, BudgetLink, Email, Transaction
from app.models.transaction import Label, TransactionStatus


@pytest.mark.asyncio
async def test_linked_spend_included_in_budget(db_session, mock_user):
    """Rent transaction of 20000 with link split_amount=2000 → Maintenance budget shows 2000 spent."""
    today = date.today()

    # Create a dummy email owned by mock_user
    email = Email(
        id="test-email-link-1",
        user_id=mock_user.id,
        message_id="msg-link-1",
        subject="Rent paid",
        sender="landlord@example.com",
        received_at=datetime.now(timezone.utc),
        body_text="Rent 20000",
    )
    db_session.add(email)

    # Rent transaction
    txn = Transaction(
        id="test-txn-link-1",
        email_id=email.id,
        amount=20000.0,
        category="Rent",
        label=Label.expense,
        status=TransactionStatus.confirmed,
        txn_date=today,
        description="Rent payment",
    )
    db_session.add(txn)

    # Budget for Maintenance (no direct transactions)
    budget = Budget(user_id=mock_user.id, category="Maintenance", monthly_limit=2000)
    db_session.add(budget)

    # Link: Rent → Maintenance, split 2000
    link = BudgetLink(
        user_id=mock_user.id,
        source_category="Rent",
        target_category="Maintenance",
        split_amount=2000.0,
    )
    db_session.add(link)
    await db_session.commit()

    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/budgets")
        assert resp.status_code == 200
        maintenance = next(
            (b for b in resp.json()["budgets"] if b["category"] == "Maintenance"), None
        )
        assert maintenance is not None
        assert maintenance["spent_this_month"] == 2000.0
        assert maintenance["pct"] == 100.0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_linked_spend_capped_at_split_amount(db_session, mock_user):
    """Rent transaction of 500 with split_amount=2000 → Maintenance shows 500 (capped at txn.amount)."""
    today = date.today()

    email = Email(
        id="test-email-link-2",
        user_id=mock_user.id,
        message_id="msg-link-2",
        subject="Small rent",
        sender="landlord@example.com",
        received_at=datetime.now(timezone.utc),
        body_text="Rent 500",
    )
    db_session.add(email)

    txn = Transaction(
        id="test-txn-link-2",
        email_id=email.id,
        amount=500.0,
        category="Rent",
        label=Label.expense,
        status=TransactionStatus.confirmed,
        txn_date=today,
        description="Rent payment",
    )
    db_session.add(txn)

    budget = Budget(user_id=mock_user.id, category="Maintenance", monthly_limit=2000)
    db_session.add(budget)

    link = BudgetLink(
        user_id=mock_user.id,
        source_category="Rent",
        target_category="Maintenance",
        split_amount=2000.0,
    )
    db_session.add(link)
    await db_session.commit()

    async def override():
        yield db_session
    app.dependency_overrides[get_db] = override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/budgets")
        maintenance = next(b for b in resp.json()["budgets"] if b["category"] == "Maintenance")
        assert maintenance["spent_this_month"] == 500.0
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_budget_links.py::test_linked_spend_included_in_budget tests/test_budget_links.py::test_linked_spend_capped_at_split_amount -v
```

Expected: FAIL — `spent_this_month` will be 0 because linked spend is not yet calculated.

---

### Task 5: Implement linked spend calculation

**Files:**
- Modify: `app/api/budgets.py` — update `list_budgets` to include linked spend

- [ ] **Step 1: Update `list_budgets` in `app/api/budgets.py`**

Add `func` already imported. Add `BudgetLink` to the models import (done in Task 3). Update the `list_budgets` function body after the `spend_rows` query block:

Replace the entire `list_budgets` function with:

```python
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
                Transaction.status != "needs_review",
                Email.user_id == current_user.id,
            )
            .group_by(Transaction.category)
        )
    ).all()

    spend_map = {r.category: float(r.spent or 0) for r in spend_rows}

    # Linked spend: for each budget_link where user_id matches, sum LEAST(split_amount, txn.amount)
    # grouped by target_category. This lets a Rent transaction partially fill a Maintenance budget.
    linked_rows = (
        await db.execute(
            select(
                BudgetLink.target_category,
                func.sum(func.least(BudgetLink.split_amount, Transaction.amount)).label("linked_spent"),
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
            .group_by(BudgetLink.target_category)
        )
    ).all()

    linked_map = {r.target_category: float(r.linked_spent or 0) for r in linked_rows}

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
```

- [ ] **Step 2: Run all budget link tests**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/test_budget_links.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 3: Run full test suite to check no regressions**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: existing budget tests still pass. Any failures should be investigated before continuing.

- [ ] **Step 4: Commit**

```bash
git add app/api/budgets.py tests/test_budget_links.py
git commit -m "feat: include linked spend in budget calculation (LEAST cap per transaction)"
```

---

### Task 6: Frontend — budget card click-to-edit

**Files:**
- Modify: `static/src/budgets.jsx` — add onClick to budget cards

- [ ] **Step 1: Wire budget card onClick in `BudgetsView`**

In `budgets.jsx`, find the budget card `<div>` (around line 892). It currently has `cursor: "pointer"` but no `onClick`. Add the handler:

```jsx
onClick={() => setModal(budget)}
```

The full card opening tag becomes:

```jsx
<div
  key={budget.id}
  className="stagger-card"
  onClick={() => setModal(budget)}
  style={{ '--i': idx,
    background: over ? "var(--neg-soft)" : "var(--card)",
    border: "1px solid " + (over ? "var(--neg)" : "var(--line)"),
    borderRadius: 8,
    padding: "14px 16px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  }}
>
```

- [ ] **Step 2: Build frontend**

```bash
cd /Users/amansaini/GexpenseTracker && npm run build 2>&1 | tail -5
```

Expected: `static/dist/bundle.js` updated, no errors.

- [ ] **Step 3: Commit**

```bash
git add static/src/budgets.jsx static/dist/bundle.js
git commit -m "feat: make budget cards clickable to open edit modal"
```

---

### Task 7: Frontend — Category Links UI

**Files:**
- Modify: `static/src/budgets.jsx` — add state, load logic, and Category Links section to `BudgetsView`

- [ ] **Step 1: Add state for links to `BudgetsView`**

Inside `BudgetsView`, after the existing `const [goalProcessingDone, ...]` line, add:

```jsx
const [links, setLinks] = useState([]);
const [linksExpanded, setLinksExpanded] = useState(false);
const [showAddLink, setShowAddLink] = useState(false);
const [linkForm, setLinkForm] = useState({ source_category: "", target_category: "", split_amount: "" });
const [linkSaving, setLinkSaving] = useState(false);
const [linkErr, setLinkErr] = useState(null);
const [recurringExpenses, setRecurringExpenses] = useState([]);
```

- [ ] **Step 2: Load links with budgets + load recurring on form open**

Replace the existing `load` function:

```jsx
const load = () => {
  setLoading(true);
  Promise.all([
    API.get("/api/budgets"),
    API.get("/api/budgets/links"),
  ])
    .then(([d, l]) => { setBudgets(d.budgets); setLinks(l.links || []); setLoading(false); })
    .catch(e => { setError(e.message); setLoading(false); });
};
```

Add a function to load recurring expenses (for split amount prefill) after `load`:

```jsx
const loadRecurring = async () => {
  try {
    const r = await API.get("/api/recurring");
    setRecurringExpenses(r.items || r || []);
  } catch (_) {}
};
```

Add a function to prefill split amount when target changes:

```jsx
const prefillSplitFromRecurring = (targetCat) => {
  const match = recurringExpenses.find(r =>
    normCat(r.category || r.name, false) === normCat(targetCat, false)
  );
  if (match?.amount) {
    setLinkForm(f => ({ ...f, split_amount: String(match.amount) }));
  }
};
```

Add link CRUD handlers after `prefillSplitFromRecurring`:

```jsx
const addLink = async () => {
  const amount = parseFloat(linkForm.split_amount);
  if (!linkForm.source_category) { setLinkErr("Source category required"); return; }
  if (!linkForm.target_category) { setLinkErr("Target budget required"); return; }
  if (!amount || amount <= 0) { setLinkErr("Split amount must be positive"); return; }
  setLinkSaving(true); setLinkErr(null);
  try {
    const result = await API.post("/api/budgets/links", {
      source_category: linkForm.source_category,
      target_category: linkForm.target_category,
      split_amount: amount,
    });
    setLinks(prev => [...prev, result]);
    setShowAddLink(false);
    setLinkForm({ source_category: "", target_category: "", split_amount: "" });
    load(); // refresh budget spent values
  } catch (e) { setLinkErr(e.message); }
  setLinkSaving(false);
};

const deleteLink = async (id) => {
  try {
    await API.delete(`/api/budgets/links/${id}`);
    setLinks(prev => prev.filter(l => l.id !== id));
    load(); // refresh budget spent values
  } catch (e) { setLinkErr(e.message); }
};
```

- [ ] **Step 3: Add Category Links section to JSX**

Insert the following block in `BudgetsView`'s return, after the closing `</div>` of the budget list section (after line ~938, before the final `</div>`):

```jsx
{/* Category Links section */}
<div style={{ margin: "0 28px 20px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
  <div
    onClick={() => setLinksExpanded(e => !e)}
    style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
  >
    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>Category Links</span>
    {links.length > 0 && (
      <span style={{ fontSize: 10, color: "var(--ink-4)" }}>{links.length} link{links.length !== 1 ? "s" : ""}</span>
    )}
    <button
      onClick={e => {
        e.stopPropagation();
        if (!showAddLink) loadRecurring();
        setShowAddLink(v => !v);
        setLinksExpanded(true);
        setLinkErr(null);
      }}
      style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 4, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 11, cursor: "pointer", minHeight: 44 }}
    >
      + Add Link
    </button>
    <span className={"chevron" + (linksExpanded ? " open" : "")}>&#8963;</span>
  </div>
  <div className={"expandable-body" + (linksExpanded ? " open" : "")}>
    <div className="expandable-inner" style={{ padding: "0 14px 12px" }}>
      {showAddLink && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>New Link</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 3 }}>Source category</div>
              <input
                list="link-source-list"
                value={linkForm.source_category}
                onChange={e => setLinkForm(f => ({ ...f, source_category: e.target.value }))}
                placeholder="e.g. Rent"
                style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
              />
              <datalist id="link-source-list">
                {budgets.map(b => <option key={b.id} value={b.category} />)}
              </datalist>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2, fontSize: 14, color: "var(--ink-3)" }}>→</div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 3 }}>Target budget</div>
              <select
                value={linkForm.target_category}
                onChange={e => {
                  const v = e.target.value;
                  setLinkForm(f => ({ ...f, target_category: v }));
                  prefillSplitFromRecurring(v);
                }}
                style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
              >
                <option value="">Select budget…</option>
                {budgets
                  .filter(b => normCat(b.category, false) !== normCat(linkForm.source_category, false))
                  .map(b => <option key={b.id} value={b.category}>{b.category}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 3 }}>Split amount (₹/txn)</div>
              <input
                type="number"
                min="1"
                value={linkForm.split_amount}
                onChange={e => setLinkForm(f => ({ ...f, split_amount: e.target.value }))}
                placeholder="2000"
                style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
          </div>
          {linkErr && <div style={{ fontSize: 11, color: "var(--neg)" }}>{linkErr}</div>}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addLink} disabled={linkSaving} style={{ padding: "5px 14px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 12, cursor: linkSaving ? "default" : "pointer", opacity: linkSaving ? 0.65 : 1, minHeight: 44 }}>
              {linkSaving ? "Saving…" : "Save Link"}
            </button>
            <button onClick={() => { setShowAddLink(false); setLinkErr(null); setLinkForm({ source_category: "", target_category: "", split_amount: "" }); }} style={{ padding: "5px 14px", borderRadius: 5, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 12, cursor: "pointer", minHeight: 44 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {links.length === 0 && !showAddLink ? (
        <div style={{ fontSize: 12, color: "var(--ink-4)", padding: "4px 0" }}>No links. Add one to split a source category's spend into another budget.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {links.map(lnk => (
            <div key={lnk.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--paper-2)", borderRadius: 5, border: "1px solid var(--line)" }}>
              <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>{lnk.source_category}</span>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>→</span>
              <span style={{ fontSize: 12, color: "var(--ink)" }}>{lnk.target_category}</span>
              <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>{fmtMoneyB(lnk.split_amount)}/txn</span>
              <button onClick={() => deleteLink(lnk.id)} style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "none", color: "var(--ink-3)", fontSize: 10, cursor: "pointer", minHeight: 44 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Build frontend**

```bash
cd /Users/amansaini/GexpenseTracker && npm run build 2>&1 | tail -5
```

Expected: no errors, `static/dist/bundle.js` updated.

- [ ] **Step 5: Run full test suite**

```bash
cd /Users/amansaini/GexpenseTracker && python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add static/src/budgets.jsx static/dist/bundle.js
git commit -m "feat: add Category Links UI — inline add/delete, recurring expense prefill"
```

---

## Self-Review

**Spec coverage:**
- ✅ Budget cards clickable to edit → Task 6
- ✅ `budget_links` DB table → Task 1
- ✅ GET/POST/DELETE `/api/budgets/links` → Tasks 2–3
- ✅ Linked spend via `LEAST(split_amount, txn.amount)` → Tasks 4–5
- ✅ Category Links UI with add/delete → Task 7
- ✅ Recurring expense prefill → Task 7 (`prefillSplitFromRecurring`)
- ✅ Alembic migration `0049` → Task 1

**Placeholder scan:** No TBDs, all code blocks complete.

**Type consistency:**
- `BudgetLink` model fields (`source_category`, `target_category`, `split_amount`) match across model, migration, API, and tests ✓
- `linked_map` keyed by `target_category` string, same key used in `spend_map` lookup ✓
- `links` state in frontend is array of `{id, source_category, target_category, split_amount}` matching API response shape ✓
- `load()` called after add/delete link to refresh spend values ✓
