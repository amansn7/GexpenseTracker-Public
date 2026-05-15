# Inbox UX — Read/Flag Persistence, Pagination, Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist read/flagged state on Transaction, add offset/limit pagination to GET /transactions, and wire bulk actions (mark read/unread, flag/unflag, delete) in the inbox.

**Architecture:** Add `read` and `flagged` bool columns via Alembic migration; extend PATCH and add POST /transactions/bulk on the backend; update data.jsx to read real fields; update app.jsx to handle paginated response and pass loadMore to InboxView; fix updateTx mapping and add Flag/Unflag/Delete to the existing bulk toolbar in inbox.jsx.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, pytest, pytest-asyncio, React (browser globals)

---

### Task 1: DB migration — add read + flagged columns

**Files:**
- Create: `alembic/versions/0011_read_flagged.py`
- Modify: `app/models.py`

---

- [ ] **Step 1: Add the columns to the Transaction model**

Open `app/models.py`. After line 70 (`user_notes` column), add:

```python
    read:    Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
```

- [ ] **Step 2: Create the Alembic migration**

Create `alembic/versions/0011_read_flagged.py` with this exact content:

```python
"""add read and flagged columns to transactions

Revision ID: 0011
Revises: 0010b
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0011'
down_revision: Union[str, None] = '0010b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('read', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('transactions', sa.Column('flagged', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('transactions', 'flagged')
    op.drop_column('transactions', 'read')
```

- [ ] **Step 3: Run the migration**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker
alembic upgrade head
```

Expected: `Running upgrade 0010b -> 0011, add read and flagged columns to transactions`

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/0011_read_flagged.py app/models.py
git commit -m "feat: add read and flagged bool columns to Transaction"
```

---

### Task 2: Write failing backend tests

**Files:**
- Create: `tests/test_bulk_actions.py`
- Create: `tests/test_transactions_pagination.py`

---

- [ ] **Step 1: Create tests/test_bulk_actions.py**

```python
import os
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture(autouse=True)
def set_testing(monkeypatch):
    monkeypatch.setenv("TESTING", "1")


@pytest.mark.asyncio
async def test_bulk_mark_read_sets_read_true():
    """POST /api/transactions/bulk action=mark_read sets read=True on all matched txns."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from app.models import Transaction
    import uuid

    txns = []
    for i in range(3):
        t = MagicMock(spec=Transaction)
        t.id = f"tx-{i}"
        t.read = False
        t.flagged = False
        t.email_id = str(uuid.uuid4())
        txns.append(t)

    async def override_get_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = txns
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"ids": ["tx-0", "tx-1", "tx-2"], "action": "mark_read"},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == 3
        for t in txns:
            assert t.read is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bulk_flag_sets_flagged_true():
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from app.models import Transaction
    import uuid

    t = MagicMock(spec=Transaction)
    t.id = "tx-1"
    t.read = False
    t.flagged = False
    t.email_id = str(uuid.uuid4())

    async def override_get_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [t]
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"ids": ["tx-1"], "action": "flag"},
            )
        assert r.status_code == 200
        assert t.flagged is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bulk_delete_nulls_email_id_and_removes_email():
    """delete action: Email row deleted, Transaction.email_id set to None."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from app.models import Transaction, Email
    import uuid

    email_id = str(uuid.uuid4())
    t = MagicMock(spec=Transaction)
    t.id = "tx-1"
    t.email_id = email_id
    e = MagicMock(spec=Email)
    e.id = email_id

    execute_call_count = 0

    async def override_get_db():
        nonlocal execute_call_count
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call_count
            execute_call_count += 1
            result = MagicMock()
            if execute_call_count == 1:
                result.scalars.return_value.all.return_value = [t]
            else:
                result.scalar_one_or_none.return_value = e
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"ids": ["tx-1"], "action": "delete"},
            )
        assert r.status_code == 200
        assert t.email_id is None
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Create tests/test_transactions_pagination.py**

```python
import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone


@pytest.fixture(autouse=True)
def set_testing(monkeypatch):
    monkeypatch.setenv("TESTING", "1")


def _make_row(txn_id: str):
    from app.models import Transaction, Email
    t = MagicMock(spec=Transaction)
    t.id = txn_id
    t.label = "expense"
    t.amount = 100.0
    t.currency = "INR"
    t.merchant = "TestMerchant"
    t.category = "food"
    t.txn_date = None
    t.confidence = 0.9
    t.status = "auto"
    t.classifier_method = "llm"
    t.user_notes = None
    t.read = False
    t.flagged = False
    t.created_at = datetime(2026, 4, 1, tzinfo=timezone.utc)

    e = MagicMock(spec=Email)
    e.subject = "Debit alert"
    e.sender = "noreply@test.com"
    e.received_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    e.gmail_link = "https://mail.google.com/mail/u/0/#inbox/abc"
    return t, e


@pytest.mark.asyncio
async def test_list_transactions_returns_paginated_shape():
    """GET /api/transactions returns {items, total, offset, limit}."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    rows = [_make_row(f"tx-{i}") for i in range(3)]
    execute_call = 0

    async def override_get_db():
        nonlocal execute_call
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call
            execute_call += 1
            result = MagicMock()
            if execute_call == 1:
                result.scalar_one.return_value = 3  # total count
            else:
                result.all.return_value = rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/transactions?offset=0&limit=2")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert "offset" in data
        assert "limit" in data
        assert data["total"] == 3
        assert data["offset"] == 0
        assert data["limit"] == 2
        assert isinstance(data["items"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_transactions_items_include_read_and_flagged():
    """Each item in response includes read and flagged fields."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db

    rows = [_make_row("tx-1")]
    execute_call = 0

    async def override_get_db():
        nonlocal execute_call
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call
            execute_call += 1
            result = MagicMock()
            if execute_call == 1:
                result.scalar_one.return_value = 1
            else:
                result.all.return_value = rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/transactions")
        assert r.status_code == 200
        item = r.json()["items"][0]
        assert "read" in item
        assert "flagged" in item
        assert item["read"] is False
        assert item["flagged"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 3: Run both test files to confirm they fail**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker
pytest tests/test_bulk_actions.py tests/test_transactions_pagination.py -v
```

Expected: **FAIL** — `POST /api/transactions/bulk` returns 404 (not implemented), and `GET /api/transactions` returns a list (not dict with `items`/`total`).

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/test_bulk_actions.py tests/test_transactions_pagination.py
git commit -m "test: failing tests for bulk actions and pagination"
```

---

### Task 3: Implement backend — PATCH extension, bulk endpoint, pagination

**Files:**
- Modify: `app/api/transactions.py`

---

- [ ] **Step 1: Replace the entire transactions.py with the updated version**

Open `app/api/transactions.py` and make these changes:

**1a. Extend `TransactionPatch`** (after line 16):

Replace:
```python
class TransactionPatch(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    user_notes: Optional[str] = None
```

With:
```python
class TransactionPatch(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    merchant: Optional[str] = None
    amount: Optional[float] = None
    user_notes: Optional[str] = None
    read: Optional[bool] = None
    flagged: Optional[bool] = None
```

**1b. Update `_fmt`** to include `read` and `flagged` (after `user_notes`):

Replace:
```python
def _fmt(t: Transaction, e: "Email | None") -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "amount": float(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
        "user_notes": t.user_notes,
        "email": {
            "subject": e.subject if e else None,
            "sender": e.sender if e else None,
            "received_at": e.received_at.isoformat() if e and e.received_at else None,
            "gmail_link": e.gmail_link if e else None,
        },
    }
```

With:
```python
def _fmt(t: Transaction, e: "Email | None") -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "amount": float(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
        "user_notes": t.user_notes,
        "read": bool(t.read),
        "flagged": bool(t.flagged),
        "email": {
            "subject": e.subject if e else None,
            "sender": e.sender if e else None,
            "received_at": e.received_at.isoformat() if e and e.received_at else None,
            "gmail_link": e.gmail_link if e else None,
        },
    }
```

**1c. Update `list_transactions`** — add `offset`/`limit` params, switch to inner join (hides orphaned txns after delete), and wrap response:

Replace the entire `list_transactions` function:
```python
@router.get("/transactions")
async def list_transactions(
    label: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if label:     conditions.append(Transaction.label == label)
    if status:    conditions.append(Transaction.status == status)
    if date_from: conditions.append(Transaction.txn_date >= date_from)
    if date_to:   conditions.append(Transaction.txn_date <= date_to)
    if category:  conditions.append(Transaction.category == category)

    count_q = (
        select(func.count(Transaction.id))
        .join(Email, Transaction.email_id == Email.id)
        .where(*conditions)
    )
    data_q = (
        select(Transaction, Email)
        .join(Email, Transaction.email_id == Email.id)
        .where(*conditions)
        .order_by(desc(Transaction.created_at))
        .offset(offset)
        .limit(limit)
    )
    total = (await db.execute(count_q)).scalar_one()
    rows = (await db.execute(data_q)).all()
    return {
        "items": [_fmt(t, e) for t, e in rows],
        "total": total,
        "offset": offset,
        "limit": limit,
    }
```

**1d. Add `read` and `flagged` handling to `patch_transaction`** — add after the `user_notes` block (around line 116):

```python
    if patch.read is not None:
        t.read = patch.read
    if patch.flagged is not None:
        t.flagged = patch.flagged
```

**1e. Add `BulkAction` model and `POST /transactions/bulk` endpoint** — add after the imports block (after `router = APIRouter()`), before `list_transactions`. Also add `List, Literal` to the typing import.

At the top of the file, update the typing import:
```python
from typing import Optional, List, Literal
```

Add the model and endpoint after `router = APIRouter()`:

```python
class BulkAction(BaseModel):
    ids: List[str]
    action: Literal["mark_read", "mark_unread", "flag", "unflag", "delete"]


@router.post("/transactions/bulk")
async def bulk_transactions(payload: BulkAction, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Transaction).where(Transaction.id.in_(payload.ids))
    )).scalars().all()

    if payload.action == "mark_read":
        for t in rows:
            t.read = True
    elif payload.action == "mark_unread":
        for t in rows:
            t.read = False
    elif payload.action == "flag":
        for t in rows:
            t.flagged = True
    elif payload.action == "unflag":
        for t in rows:
            t.flagged = False
    elif payload.action == "delete":
        for t in rows:
            if t.email_id:
                email = (await db.execute(
                    select(Email).where(Email.id == t.email_id)
                )).scalar_one_or_none()
                if email:
                    await db.delete(email)
                t.email_id = None

    await db.commit()
    return {"updated": len(rows)}
```

- [ ] **Step 2: Run the tests to confirm they pass**

```bash
pytest tests/test_bulk_actions.py tests/test_transactions_pagination.py -v
```

Expected: all **PASS**

- [ ] **Step 3: Run full test suite**

```bash
pytest --tb=short -q
```

Expected: all previously passing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/transactions.py
git commit -m "feat: bulk actions endpoint, pagination, read/flagged on PATCH"
```

---

### Task 4: Frontend — data.jsx field fix + app.jsx pagination

**Files:**
- Modify: `static/src/data.jsx`
- Modify: `static/src/app.jsx`

---

- [ ] **Step 1: Fix transformTransaction in data.jsx**

Open `static/src/data.jsx`. Find lines 71–72:

```javascript
    read: t.status === "confirmed" || t.status === "corrected",
    flag: conf < 0.7 || t.status === "needs_review",
```

Replace with:

```javascript
    read: t.read ?? false,
    flag: t.flagged ?? false,
```

- [ ] **Step 2: Update app.jsx — paginated loadData + loadMore state**

Open `static/src/app.jsx`.

**2a.** Add `loadingMore` and `totalTransactions` state alongside the existing state declarations (around line 16):

```javascript
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
```

**2b.** Update `loadData` to handle the paginated response shape. Find:

```javascript
      const [txRaw, summary, catBreakdown] = await Promise.all([
        API.get("/api/transactions"),
        API.get("/api/stats/summary"),
        API.get("/api/stats/category-breakdown"),
      ]);
      const txs = txRaw.map(transformTransaction);
      setTransactions(txs);
```

Replace with:

```javascript
      const [txRaw, summary, catBreakdown] = await Promise.all([
        API.get("/api/transactions?offset=0&limit=50"),
        API.get("/api/stats/summary"),
        API.get("/api/stats/category-breakdown"),
      ]);
      const txs = txRaw.items.map(transformTransaction);
      setTransactions(txs);
      setTotalTransactions(txRaw.total);
```

**2c.** Add `loadMore` function after the `loadData` definition (before the `useEffect` calls):

```javascript
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await API.get(`/api/transactions?offset=${transactions.length}&limit=50`);
      setTransactions(ts => [...ts, ...data.items.map(transformTransaction)]);
    } catch (_) {}
    setLoadingMore(false);
  };
```

**2d.** Pass the new props to `<InboxView>`. Find:

```javascript
          <InboxView
            transactions={transactions}
            setTransactions={setTransactions}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            filter={inboxFilter}
            setFilter={setInboxFilter}
          />
```

Replace with:

```javascript
          <InboxView
            transactions={transactions}
            setTransactions={setTransactions}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            filter={inboxFilter}
            setFilter={setInboxFilter}
            loadMore={loadMore}
            totalTransactions={totalTransactions}
            loadingMore={loadingMore}
          />
```

- [ ] **Step 3: Commit**

```bash
git add static/src/data.jsx static/src/app.jsx
git commit -m "feat: paginated transactions load, loadMore, real read/flagged fields"
```

---

### Task 5: Frontend — inbox.jsx wiring, bulk additions, infinite scroll

**Files:**
- Modify: `static/src/inbox.jsx`

---

- [ ] **Step 1: Accept new props in InboxView**

Open `static/src/inbox.jsx`. Find line 444:

```javascript
const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {} }) => {
```

Replace with:

```javascript
const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, loadMore = () => {}, totalTransactions = 0, loadingMore = false }) => {
```

- [ ] **Step 2: Fix updateTx to persist read and flag (flagged) to API**

Find the `updateTx` function (around line 553):

```javascript
  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }
    // Optimistic local update
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi) return;
    // Persist to DB
    const apiPatch = {};
    if (patch.cat    !== undefined) apiPatch.category   = patch.cat;
    if (patch.note   !== undefined) apiPatch.user_notes = patch.note;
    if (patch.amount !== undefined) apiPatch.amount     = Math.abs(patch.amount);
    if (Object.keys(apiPatch).length > 0) {
      API.patch(`/api/transactions/${id}`, apiPatch).catch(err => console.error("patch failed:", err));
    }
  };
```

Replace with:

```javascript
  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi) return;
    const apiPatch = {};
    if (patch.cat    !== undefined) apiPatch.category   = patch.cat;
    if (patch.note   !== undefined) apiPatch.user_notes = patch.note;
    if (patch.amount !== undefined) apiPatch.amount     = Math.abs(patch.amount);
    if (patch.read   !== undefined) apiPatch.read       = patch.read;
    if (patch.flag   !== undefined) apiPatch.flagged    = patch.flag;
    if (Object.keys(apiPatch).length > 0) {
      API.patch(`/api/transactions/${id}`, apiPatch).catch(err => console.error("patch failed:", err));
    }
  };
```

- [ ] **Step 3: Replace bulkPatch / bulkMarkRead / bulkMarkUnread with bulk API helpers**

Find (around lines 482–491):

```javascript
  const bulkPatch = async (patch) => {
    await Promise.all([...selectedIds].map(id =>
      API.patch(`/api/transactions/${id}`, patch).catch(() => {})
    ));
    setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? { ...t, ...patch } : t));
    clearSelect();
  };

  const bulkMarkRead = () => bulkPatch({ status: "confirmed", read: true });
  const bulkMarkUnread = () => bulkPatch({ status: "auto", read: false });
```

Replace with:

```javascript
  const bulkAction = async (action, localPatch) => {
    const ids = [...selectedIds];
    setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? { ...t, ...localPatch } : t));
    clearSelect();
    await API.post("/api/transactions/bulk", { ids, action }).catch(() => {});
  };

  const bulkMarkRead   = () => bulkAction("mark_read",   { read: true });
  const bulkMarkUnread = () => bulkAction("mark_unread", { read: false });
  const bulkFlag       = () => bulkAction("flag",        { flag: true });
  const bulkUnflag     = () => bulkAction("unflag",      { flag: false });

  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} email(s)? Classification data is kept.`)) return;
    const ids = [...selectedIds];
    setTransactions(ts => ts.filter(t => !selectedIds.has(t.id)));
    clearSelect();
    await API.post("/api/transactions/bulk", { ids, action: "delete" }).catch(() => {});
  };
```

- [ ] **Step 4: Add Flag, Unflag, Delete buttons to the bulk action toolbar**

Find the bulk toolbar (around line 650):

```javascript
      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px -8px rgba(0,0,0,0.4)", zIndex: 50, fontSize: 13, fontWeight: 500 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6 }}>{selectedIds.size} selected</span>
          <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Read</button>
          <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Unread</button>
          <button onClick={bulkReclassify} disabled={bulkReclassState==="running"} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: bulkReclassState==="running"?"default":"pointer", fontWeight: 500 }}>
            {bulkReclassState==="running" ? `${bulkProgress.done}/${bulkProgress.total} done` : bulkReclassState==="done" ? "Done ✓" : "Re-classify (LLM)"}
          </button>
          <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Re-classify (Manual)</button>
          <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      )}
```

Replace with:

```javascript
      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px -8px rgba(0,0,0,0.4)", zIndex: 50, fontSize: 13, fontWeight: 500 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6 }}>{selectedIds.size} selected</span>
          <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Read</button>
          <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Unread</button>
          <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Flag</button>
          <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Unflag</button>
          <button onClick={bulkReclassify} disabled={bulkReclassState==="running"} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: bulkReclassState==="running"?"default":"pointer", fontWeight: 500 }}>
            {bulkReclassState==="running" ? `${bulkProgress.done}/${bulkProgress.total} done` : bulkReclassState==="done" ? "Done ✓" : "Re-classify (LLM)"}
          </button>
          <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Re-classify (Manual)</button>
          <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "#fca5a5", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Delete</button>
          <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      )}
```

- [ ] **Step 5: Add infinite scroll + loading spinner**

**5a.** Add a `listRef` ref at the top of `InboxView` state declarations (after line 444, with the other `useState` calls):

```javascript
  const listRef = React.useRef(null);
```

**5b.** Add the scroll effect after the existing `useEffect` hooks in `InboxView` (after the `filter !== "duplicates"` effect, around line 469):

```javascript
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100
          && transactions.length < totalTransactions
          && !loadingMore) {
        loadMore();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [transactions.length, totalTransactions, loadingMore, loadMore]);
```

**5c.** Attach `listRef` to the list div. Find (around line 571):

```javascript
        <div style={inboxStyles.list}>
```

Replace with:

```javascript
        <div ref={listRef} style={inboxStyles.list}>
```

**5d.** Add the loading spinner at the bottom of the list. Find the closing of the list content (right before `</div>` that closes the list div, after the grouped map, around line 644):

```javascript
        </div>

        {selected && <DetailPanel ...
```

Insert before the `</div>` that closes the list div:

```javascript
          {loadingMore && (
            <div style={{ padding: "20px 32px", display: "flex", justifyContent: "center" }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ width: 20, height: 20, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/>
            </div>
          )}
          {!loadingMore && transactions.length < totalTransactions && transactions.length > 0 && (
            <div style={{ padding: "16px 32px", textAlign: "center", fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
              {transactions.length} of {totalTransactions} · scroll for more
            </div>
          )}
```

- [ ] **Step 6: Run the full test suite**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker
pytest --tb=short -q
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add static/src/inbox.jsx
git commit -m "feat: inbox bulk actions (flag/unflag/delete), infinite scroll, read/flag wiring"
```
