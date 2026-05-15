# Reports Page — Design

## Goal

A "Reports" sidebar view showing a month-by-month summary table: Income, Expenses, Net savings, Savings rate. No charts — data-dense table that lets users scan financial health across months at a glance.

## Architecture

New `/api/stats/monthly-summary` endpoint groups existing transactions by calendar month. New `static/src/reports.jsx` renders the table. No new DB models.

---

## Backend: `/api/stats/monthly-summary`

**File**: `app/api/stats.py` (add new route to existing stats router)

**Query**:
```python
SELECT
  strftime('%Y-%m', txn_date) AS month,
  SUM(CASE WHEN label='income' THEN amount ELSE 0 END) AS income,
  SUM(CASE WHEN label='expense' THEN ABS(amount) ELSE 0 END) AS expenses
FROM transactions
WHERE txn_date IS NOT NULL
  AND status != 'needs_review'
GROUP BY month
ORDER BY month DESC
LIMIT 24
```

**Response**:
```json
{
  "months": [
    {
      "month": "2026-04",
      "label": "April 2026",
      "income": 45000.0,
      "expenses": 32000.0,
      "net": 13000.0,
      "savings_rate": 28.9
    }
  ]
}
```

`net = income - expenses`. `savings_rate = (net / income * 100)` if income > 0 else 0. Both rounded to 1 decimal.

---

## Frontend: `static/src/reports.jsx`

**ReportsView** component:

- Topbar: "Reports", subtitle "month-by-month"
- Loads data on mount via `GET /api/stats/monthly-summary`
- Section band header: "Monthly Summary"
- Table inside secBody:

| Month | Income | Expenses | Net | Savings Rate |
|---|---|---|---|---|
| April 2026 | ₹45,000 | ₹32,000 | +₹13,000 | 28.9% |

Styling:
- Month column: serif font, left-aligned
- Income: `--pos` green, mono
- Expenses: `--neg` red, mono
- Net: green if positive, red if negative, mono, bold
- Savings Rate: small badge — green ≥ 20%, amber 10–20%, red < 10%
- Alternating row background: `--card` / `--paper-2`
- Row hover: `--paper-2`

**Loading state**: spinner
**Empty state**: "No transaction data yet. Sync your Gmail to get started."

---

## Sidebar nav

Add "Reports" nav item under Tools section in `shell.jsx`. Icon: `"chart"` (existing icon).

---

## Data flow

```
ReportsView mounts → GET /api/stats/monthly-summary → local state
ReportsView renders table rows from response
```

No prop threading needed — ReportsView fetches its own data.

---

## Error handling

- Fetch error: show "Could not load reports" with retry button

---

## Testing

- `tests/test_stats_monthly.py`: seed transactions across 3 months, assert income/expenses/net/savings_rate correct; assert `needs_review` transactions excluded

---

## Files to modify

| File | Change |
|---|---|
| `app/api/stats.py` | Add `/stats/monthly-summary` route |
| `static/src/reports.jsx` | New file — ReportsView |
| `static/src/shell.jsx` | Add Reports nav item |
| `static/src/app.jsx` | Add ReportsView route |
| `templates/index.html` | Add reports.jsx script tag |
