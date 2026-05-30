# Self Transfer Label Design

**Date:** 2026-05-30  
**Status:** Approved

## Problem

Bank-to-bank transfers between the user's own accounts are parsed as transactions and often misclassified as income. There is no way to mark them as neutral — they inflate income stats and create noise in the financial summary.

## Solution

Add `self_transfer` as a new value to the `Label` StrEnum. Users manually mark a transaction as Self Transfer from the inbox label picker. All financial stats and budget tracking automatically exclude it — no query changes needed since stats already filter explicitly for `label == "expense"` or `label == "income"`.

## Architecture

### Label Enum (`app/models/transaction.py`)

Add one value:
```python
class Label(StrEnum):
    expense = "expense"
    income = "income"
    ignore = "ignore"
    self_transfer = "self_transfer"
```

No DB migration needed — `label` is stored as `String(20)`, not a PostgreSQL ENUM type.

### Stats and Budget — no changes

Every stats query (`app/api/stats.py`) filters `Transaction.label == "expense"` or `Transaction.label == "income"` explicitly. Budget spend query (`app/api/budgets.py`) also filters `label == "expense"`. `self_transfer` is excluded from all financial calculations with zero query changes.

### Inbox UI (`static/src/inbox-detail.jsx`)

Three touch points:

1. **Cycle button** — current cycle is `["expense", "income", "ignore"]`. Add `"self_transfer"` to the cycle (position: after `"income"`, before `"ignore"`):
   ```
   expense → income → self_transfer → ignore → expense
   ```

2. **Label select dropdown** — add option:
   ```jsx
   <option value="self_transfer">Self Transfer</option>
   ```

3. **Tag/badge display** — add `isSelfTransfer` check alongside `isIncome`/`isIgnore`. Display as a neutral grey badge labelled "transfer". The tag color should be `var(--ink-4)` (muted, not red/green — it's neither income nor expense).

## Files Changed

| File | Change |
|------|--------|
| `app/models/transaction.py` | Add `self_transfer = "self_transfer"` to `Label` StrEnum |
| `static/src/inbox-detail.jsx` | Add to cycle, dropdown, and badge display |

## Out of Scope

- Auto-detection by classifier (manual only)
- Separate "self transfer" reporting view
- Alembic migration (not needed)
