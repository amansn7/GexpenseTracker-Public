# Design: Review Queue N+1 Fix

Date: 2026-04-20
Status: Approved

---

## Problem

`GET /api/review` fires one extra DB query per transaction to compute `domain_count` — how many other needs-review items share the same sender domain. With N transactions in the review queue, this produces N+1 round-trips.

Relevant code: `app/api/review.py::get_review_queue`, lines 42–52.

---

## Fix

Replace the per-row query with a single pre-aggregation query before the result loop.

### Step 1 — Pre-aggregate domain counts (one query)

```python
domain_counts_rows = await db.execute(
    select(Email.sender_domain, func.count().label("cnt"))
    .join(Transaction, Transaction.email_id == Email.id)
    .where(
        Transaction.status == TransactionStatus.needs_review.value,
        Email.sender_domain.isnot(None),
    )
    .group_by(Email.sender_domain)
)
domain_counts = {r.sender_domain: r.cnt for r in domain_counts_rows.all()}
```

### Step 2 — Replace inner loop query with dict lookup

```python
domain_count = max(0, domain_counts.get(e.sender_domain or "", 0) - 1)
```

The `-1` preserves existing API semantics: `domain_count` is the number of *other* needs-review items from the same domain, excluding the current transaction.

---

## Result

- **Before:** 1 + N DB queries (N = review queue size)
- **After:** 2 DB queries always

No schema changes. No API contract changes. Response shape identical.

---

## Testing

Add one test to `tests/test_api.py` (or a new `tests/test_review.py`):

- Mock DB with 3 transactions from the same sender domain, all `needs_review`
- Call `GET /api/review`
- Assert each item has `domain_count == 2`
- Assert `db.execute` was called exactly **2 times** (main query + aggregate), not 4
