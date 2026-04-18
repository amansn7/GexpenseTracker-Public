# Dashboard Analytics Redesign — Design Spec

**Date:** 2026-04-11  
**Status:** Approved

---

## Overview

Redesign the dashboard to show rich analytics across 5 widgets controlled by a shared period picker. Add a separate Budgets management page. No changes to existing transaction ingestion, classifier, or sync logic.

---

## 1. Confirmed Decisions

**Widgets (5 total):**
- Category Breakdown — donut chart (where money goes)
- Monthly Trend — line chart (spending over time)
- Top Merchants — horizontal bars (biggest payees)
- Budget vs Actual — progress bars per category (vs limits)
- Income vs Expense Balance — grouped bars per month (savings rate)

**Period picker:** Single control at page top. Options: This Month / 3 Months / 6 Months / This Year. All 5 widgets update together when period changes.

**Budget limits:** Managed on a separate `/budgets` page. Dashboard shows read-only budget progress.

**Layout (Story Flow — Layout C):**
```
[ Period picker tabs                        ]
[ Expenses | Income | Saved | Rate | Review ] ← stat strip

[ Monthly Trend (2/3 wide) | Category Donut (1/3) ]
[ Top Merchants             | Income vs Expense    ]
[       Budget vs Actual (full width)              ]
```

---

## 2. Income Attribution Rule (Axis Bank Salary Shift)

**Rule:** Income transactions where `sender` contains "axis" (case-insensitive) AND `day(txn_date) >= 25` are attributed to the **following calendar month** for all stats calculations.

**Rationale:** Axis Bank credits salary in the last week of the month (e.g., Feb 28 credit = March salary). Shifting gives accurate month-over-month income figures.

**Implementation:** A pure Python helper `effective_month(txn) -> date`:
```python
from dateutil.relativedelta import relativedelta

def effective_month(txn) -> date:
    """Return the month this transaction counts toward."""
    if (
        txn.label == "income"
        and txn.txn_date.day >= 25
        and txn.sender
        and "axis" in txn.sender.lower()
    ):
        shifted = txn.txn_date + relativedelta(months=1)
        return shifted.replace(day=1)
    return txn.txn_date.replace(day=1)
```

This helper is called in `app/api/stats.py` when grouping income by month. Expense grouping always uses `txn_date` directly — rule never shifts expenses.

**Period filter:** The period filter is applied to `effective_month`, not `txn_date`. An Axis income transaction on Feb 28 with `effective_month = 2026-03-01` will appear in March stats but NOT in a "February only" filter.

**Affected endpoints:** `/api/stats/summary`, `/api/stats/monthly-trend`, `/api/stats/income-vs-expense`. Category breakdown and top merchants are expense-only — unaffected.

---

## 3. Data & API Layer

> Income from Axis Bank (day ≥ 25) is shifted to the next month per the rule in Section 2. All income queries in this section apply that shift before filtering/grouping.

### New Endpoints

All endpoints under `/api/stats/`. All accept `?period=1m|3m|6m|1y`.

#### `GET /api/stats/summary`
Returns the stat strip values for the selected period.
```json
{
  "total_expenses": 18420.50,
  "total_income": 65000.00,
  "saved": 46579.50,
  "savings_rate": 71.7,
  "needs_review_count": 3
}
```

#### `GET /api/stats/category-breakdown`
Returns per-category totals for the donut chart.
```json
{
  "categories": [
    {"category": "Food", "amount": 3420, "pct": 34.2},
    {"category": "Shopping", "amount": 2200, "pct": 22.0},
    ...
  ]
}
```

#### `GET /api/stats/monthly-trend`
Returns one data point per month within the period (expenses + income).
```json
{
  "months": [
    {"month": "2025-11", "expenses": 12400, "income": 65000},
    {"month": "2025-12", "expenses": 15200, "income": 65000},
    ...
  ]
}
```

#### `GET /api/stats/top-merchants`
Returns top 8 merchants by total expense amount in the period.
```json
{
  "merchants": [
    {"merchant": "Swiggy", "amount": 2840},
    {"merchant": "Amazon", "amount": 2100},
    ...
  ]
}
```

#### `GET /api/stats/income-vs-expense`
Returns per-month income and expense totals for grouped bar chart.
Same shape as monthly-trend — can reuse same endpoint or alias.

### New `budgets` Table

```sql
CREATE TABLE budgets (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(100) NOT NULL UNIQUE,
  monthly_limit NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

#### `GET /api/budgets`
Returns all budget rows with current-month actual spend joined from transactions.
```json
{
  "budgets": [
    {
      "id": 1,
      "category": "Food",
      "monthly_limit": 4000,
      "spent_this_month": 3420,
      "pct": 85.5,
      "over_budget": false
    }
  ]
}
```

#### `POST /api/budgets`
Body: `{"category": "Food", "monthly_limit": 4000}`

#### `PATCH /api/budgets/{id}`
Body: `{"monthly_limit": 5000}` (partial update)

#### `DELETE /api/budgets/{id}`

---

## 4. Dashboard Widget Rendering

All charts rendered with inline SVG — no external chart library dependency. Data fetched client-side on page load and on period picker change. Each widget shows a skeleton/loading state while fetching.

### Period Picker
Four tabs at top: "This month" / "3 months" / "6 months" / "This year". Clicking a tab fires parallel fetches for all 5 stat endpoints. Active tab stored in `localStorage` (persists across page reloads).

### Widget Details

**Monthly Trend (line chart, 2/3 width):**
- SVG polyline for expenses. Second line (income) rendered in green if income data present.
- X-axis: month labels. Y-axis: implied by SVG scaling.
- Hover/tooltip: not required for Phase 1.

**Category Donut (1/3 width):**
- SVG with `stroke-dasharray` circles for each category.
- Legend inline below/beside donut.
- Max 6 categories shown; remainder grouped as "Other".

**Top Merchants (horizontal bars):**
- Sorted descending by amount.
- Bar width = `(amount / max_amount) * 100%`.
- Show top 8 merchants.

**Income vs Expense (grouped bars):**
- One column-pair per month. Green bar = income, red bar = expense.
- Heights proportional to max value across all months.

**Budget vs Actual (full width):**
- Grid of category cards (4-column on desktop, 2 on mobile).
- Each card: category name, `₹spent / ₹limit`, color-coded progress bar.
  - Green: < 70% of limit
  - Yellow/amber: 70–99%
  - Red: >= 100% (over budget)
- Uses current-month data regardless of period picker (budgets are always monthly).
- "Manage budgets →" link at bottom-right points to `/budgets`.

---

## 5. Budgets Page (`/budgets`)

Accessible from sidebar nav and from "Manage budgets →" link on dashboard.

**Layout:**
- Header: "Monthly Budgets" + "Add budget" button
- Table: Category | Monthly Limit | This Month Spent | % Used | Actions (Edit / Delete)
- Add/edit via inline form or modal — inline form preferred (no extra dependencies)
- Category field is a free-text input (user types category name matching transaction categories)

**Behavior:**
- Delete: immediate, no confirmation dialog required
- Edit: inline edit row that saves on Enter or blur
- If no budgets set: empty state with prompt to add one

---

## 6. Stat Strip Changes

Current strip: Total Expenses, Total Income, Savings %, Needs Review  
New strip (5 cards): Expenses | Income | Saved (₹) | Savings Rate (%) | Needs Review

"Saved" card = Income − Expenses for the period. Savings Rate = (Saved / Income) × 100. Both controlled by the period picker.

---

## 7. Database Migration

New Alembic migration `0004_budgets.py`:
- Creates `budgets` table (id, category, monthly_limit, created_at)
- Chains from 0003 (recurring_expenses)

---

## 8. File Changes Summary

| File | Change |
|------|--------|
| `app/models.py` | Add `Budget` model |
| `alembic/versions/0004_budgets.py` | New migration |
| `app/api/stats.py` | New — 4 stat endpoints |
| `app/api/budgets.py` | New — CRUD endpoints |
| `app/main.py` | Register stats + budgets routers, add `/budgets` route |
| `templates/dashboard.html` | Full redesign — period picker, 5 widgets, SVG charts |
| `templates/budgets.html` | New — budgets management page |
| `templates/base.html` | Add Budgets nav link |

No changes to: classifier, sync, Gmail client, recurring, review, settings.

---

## 9. Out of Scope (Phase 1)

- Chart tooltips / hover interactivity
- Exporting data as CSV
- Per-merchant drill-down
- Budget alerts / notifications
- Mobile-optimized chart sizing (desktop-first)
