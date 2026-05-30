# Budget Edit + Category Links Design

**Date:** 2026-05-30  
**Status:** Approved

## Problem

1. Budget cards are not clickable — the edit modal exists in code but is unreachable from the list view.
2. A single "Rent" payment in India often covers both rent and society maintenance. There is no way to have one transaction fill multiple budgets, so "Maintenance" budget always shows zero even though it is covered by the rent payment.
3. RecurringExpenses for "Rent" and "Maintenance" exist in the DB but play no role in budget spend tracking.

## Solution Overview

Two changes:

1. **Budget card click-to-edit** — wire onClick on each card to open the existing BudgetModal.
2. **Category Links** — a new DB-backed feature that lets users define: "when a Rent transaction is recorded, allocate ₹N of it toward the Maintenance budget."

---

## Architecture

### Data Model — new table `budget_links`

```python
class BudgetLink(Base):
    __tablename__ = "budget_links"
    id: int (PK, autoincrement)
    user_id: str (FK → users.id, CASCADE)
    source_category: str(100)   # e.g. "Rent"
    target_category: str(100)   # e.g. "Maintenance"
    split_amount: float (Numeric 12,2)  # fixed INR amount per transaction
    created_at: datetime
    UniqueConstraint(user_id, source_category, target_category)
```

Migration: `0049_add_budget_links.py`

### API — new router `/api/budgets/links`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/budgets/links` | List all links for current user |
| POST | `/api/budgets/links` | Create `{source_category, target_category, split_amount}` |
| DELETE | `/api/budgets/links/{id}` | Remove a link |

Validation:
- `split_amount` must be > 0
- `source_category` != `target_category`
- Duplicate (user, source, target) → 409

### Spend Calculation Change

In `GET /api/budgets`, for each budget B with category C:

```
direct_spend = sum(transactions where category=C, this month, confirmed)

linked_spend = for each BudgetLink L where L.target_category=C:
    sum(min(L.split_amount, txn.amount) for each txn where txn.category=L.source_category, this month, confirmed)

total_spent = direct_spend + linked_spend
```

Single SQL query per budget using LEFT JOIN on budget_links to avoid N+1. The `min(split_amount, txn.amount)` cap prevents a ₹500 rent transaction from inflating a ₹2,000 maintenance budget.

### RecurringExpense Integration

When the frontend renders the "Add Link" form, it fetches `GET /api/recurring` to find recurring expenses that match the selected target category. If found, it prefills `split_amount` with the recurring expense amount. This is frontend-only — no backend coupling between the two models.

---

## Frontend

### Budget Card Edit

`BudgetsView` — add to each card div:
```jsx
onClick={() => setModal(budget)}
```
No other changes needed. BudgetModal already handles the edit path when `item` is truthy.

### Category Links Section

New collapsible section at bottom of BudgetsView, below the budget list.

**List state:**
```
Category Links          [+ Add Link]

Rent → Maintenance   ₹2,000/txn   [×]
```

**Add Link form (inline, expands on button click):**
- Source category: text input with datalist from existing budget categories
- Target budget: dropdown of existing budgets (excluding source)
- Split amount: number input, prefilled from matching recurring expense if found
- Save / Cancel buttons

**Budget card display:** no visual change needed — the spend calculation already includes linked spend, so the progress bar and "₹X spent" number reflect the combined total automatically.

---

## Error Handling

- POST link: 409 if duplicate (show "Link already exists")
- POST link: 422 if split_amount ≤ 0 or source = target
- DELETE: 404 handled silently (stale UI edge case)
- If recurring expense fetch fails, form still works — split_amount just starts empty

---

## Testing

- Unit: `test_budget_links.py` — CRUD operations, duplicate constraint, spend calculation with linked categories
- Edge cases: split_amount > txn.amount (capped), no transactions in source category (zero linked spend), circular links (A→B, B→A — allowed, independent calculations)
- No migration rollback needed for new additive table

---

## Files Changed

| File | Change |
|------|--------|
| `app/models/financial.py` | Add `BudgetLink` model |
| `alembic/versions/0049_add_budget_links.py` | New migration |
| `app/api/budgets.py` | Modified spend query + new links router |
| `app/models/__init__.py` | Export `BudgetLink` |
| `static/src/budgets.jsx` | Card onClick + Category Links UI section |
