# Review Queue N+1 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-row `domain_count` query in `get_review_queue` with a single pre-aggregation query, reducing N+1 DB round-trips to 2 always.

**Architecture:** Before iterating the review queue rows, run one `GROUP BY sender_domain` query to count all needs-review items per domain. Store in a dict. In the loop, replace the inner `db.execute` with a `dict.get` lookup. Subtract 1 to preserve the existing "other items from this domain" semantics.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest, pytest-asyncio

---

### Task 1: Fix the N+1 query in get_review_queue

**Files:**
- Modify: `app/api/review.py`
- Create: `tests/test_review.py`

---

- [ ] **Step 1: Write the failing test**

Create `tests/test_review.py` with this content:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_review_queue_domain_count_no_n1():
    """
    3 transactions from the same sender domain → each should report domain_count=2.
    db.execute must be called exactly 2 times (main query + aggregate), not 4.
    """
    from httpx import AsyncClient, ASGITransport
    import os
    os.environ["TESTING"] = "1"
    from app.main import app
    from app.database import get_db

    # --- build fake DB rows ---
    from app.models import Transaction, Email, TransactionStatus
    from datetime import datetime, timezone
    import uuid

    def _make_pair(domain: str, txn_id: str):
        e = MagicMock(spec=Email)
        e.id = str(uuid.uuid4())
        e.sender = f"noreply@{domain}"
        e.sender_domain = domain
        e.subject = "Debit alert"
        e.received_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
        e.body_snippet = "Rs.100 debited"
        e.gmail_link = f"https://mail.google.com/mail/u/0/#inbox/{e.id}"

        t = MagicMock(spec=Transaction)
        t.id = txn_id
        t.label = "expense"
        t.amount = 100.0
        t.merchant = "TestMerchant"
        t.category = "Shopping"
        t.confidence = 0.9
        t.status = TransactionStatus.needs_review.value
        return t, e

    tx1, em1 = _make_pair("swiggy.in", "tx-1")
    tx2, em2 = _make_pair("swiggy.in", "tx-2")
    tx3, em3 = _make_pair("swiggy.in", "tx-3")

    review_rows = [(tx1, em1), (tx2, em2), (tx3, em3)]

    # domain aggregate result: swiggy.in → 3
    agg_row = MagicMock()
    agg_row.sender_domain = "swiggy.in"
    agg_row.cnt = 3

    execute_call_count = 0

    async def override_get_db():
        db = AsyncMock(spec=AsyncSession)

        def execute_side_effect(query):
            nonlocal execute_call_count
            execute_call_count += 1
            result = MagicMock()
            if execute_call_count == 1:
                # main review queue query
                result.all.return_value = review_rows
            else:
                # aggregate query
                result.all.return_value = [agg_row]
            return result

        db.execute = AsyncMock(side_effect=execute_side_effect)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/review")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 3
        for item in data:
            assert item["domain_count"] == 2, f"expected 2, got {item['domain_count']}"
        assert execute_call_count == 2, f"expected 2 db.execute calls, got {execute_call_count}"
    finally:
        app.dependency_overrides.pop(get_db, None)
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker
pytest tests/test_review.py::test_get_review_queue_domain_count_no_n1 -v
```

Expected: **FAIL** — `execute_call_count` will be 4 (1 main + 3 per-row), not 2. The `domain_count` values will likely be wrong too since the mock isn't set up to handle per-row queries.

- [ ] **Step 3: Apply the fix to get_review_queue**

Open `app/api/review.py`. Replace the entire `get_review_queue` function (lines 29–72) with:

```python
@router.get("/review")
async def get_review_queue(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email)
        .where(Transaction.status == TransactionStatus.needs_review.value)
        .order_by(desc(Email.received_at))
    )).all()

    # Pre-aggregate domain counts in one query instead of one query per row
    domain_counts_rows = (await db.execute(
        select(Email.sender_domain, func.count().label("cnt"))
        .join(Transaction, Transaction.email_id == Email.id)
        .where(
            Transaction.status == TransactionStatus.needs_review.value,
            Email.sender_domain.isnot(None),
        )
        .group_by(Email.sender_domain)
    )).all()
    domain_counts = {r.sender_domain: r.cnt for r in domain_counts_rows}

    result = []
    for t, e in rows:
        domain_count = max(0, domain_counts.get(e.sender_domain or "", 0) - 1)
        result.append({
            "id": t.id,
            "label": t.label,
            "amount": float(t.amount) if t.amount is not None else None,
            "merchant": t.merchant,
            "category": t.category,
            "confidence": t.confidence,
            "domain_count": domain_count,
            "email": {
                "subject": e.subject,
                "sender": e.sender,
                "sender_domain": e.sender_domain,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "body_snippet": e.body_snippet,
                "gmail_link": e.gmail_link,
            },
        })

    return result
```

Note: `func` is already imported at the top of `review.py` via `from sqlalchemy import select, desc` — add `func` to that import if it's not there:
```python
from sqlalchemy import select, desc, func
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pytest tests/test_review.py::test_get_review_queue_domain_count_no_n1 -v
```

Expected: **PASS**

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
pytest --tb=short -q
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/review.py tests/test_review.py
git commit -m "fix: replace N+1 domain_count queries in review queue with single GROUP BY"
```
