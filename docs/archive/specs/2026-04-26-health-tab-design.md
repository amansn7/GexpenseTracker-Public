# Health Tab Design

## Overview

Add a dedicated "Health" tab to MoneyFlow that shows financial resilience metrics: savings rate, runway (months of expenses covered), current balance, and monthly net trend bars. Complements the existing Flow (Sankey) view without replacing it.

---

## Mental Models

User selected: **Flow Diagram** (existing, keep as-is) + **Runway & Savings Rate** (new Health tab).

---

## Data Model

### New fields on `user_settings`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `starting_balance` | Decimal(12,2) | yes | Declared anchor balance in rupees |
| `starting_balance_date` | Date | yes | Date the anchor applies from |

Both fields optional. If null, falls back to all-time transaction history.

---

## Backend

### New endpoint: `GET /api/stats/health`

**Query params:** `months` (int, default 6, allowed: 3 / 6 / 12)

**Computation:**
```
current_balance     = starting_balance + Σ(net transactions from starting_balance_date → now)
                      OR Σ(all-time net transactions) if starting_balance is null

monthly_net[m]      = Σ income[m] − Σ expenses[m]

avg_monthly_income  = avg(income over last 3 months)
avg_monthly_expense = avg(expenses over last 3 months)

savings_rate        = avg_monthly_net / avg_monthly_income × 100
                      (0 if avg_monthly_income == 0)

runway_months       = current_balance / avg_monthly_expense
                      (null if avg_monthly_expense == 0)
```

**Response shape:**
```json
{
  "current_balance": 142000.00,
  "savings_rate": 24.1,
  "runway_months": 4.2,
  "starting_balance": 100000.00,
  "starting_balance_date": "2026-01-01",
  "balance_mode": "anchored",
  "monthly_net": [
    { "month": "2026-01", "income": 85000, "expenses": 62000, "net": 23000 },
    { "month": "2026-02", "income": 90000, "expenses": 71000, "net": 19000 }
  ]
}
```

`balance_mode`: `"anchored"` if starting_balance set, `"computed"` otherwise.

**Only counts confirmed transactions** (status = `auto` or `confirmed`), same filter as other stats endpoints.

---

## Settings UI

New "Financial Health" section in Account settings (after Categories section):

```
Financial Health
─────────────────────────────────────────────────────────
Starting balance   [₹ ________]   as of [YYYY-MM-DD]

"This anchors your current balance calculation.
 Leave blank to use all tracked transaction history."

                                              [Save]
```

- Number input (rupees integer, no decimals required in UI)
- Date input (type="date"), must not be in the future
- `PATCH /api/account/settings` payload: `{ starting_balance, starting_balance_date }`
- Saving with blank fields clears the anchor (falls back to all-history mode)
- Success: inline "Saved" confirmation, no page reload

---

## Frontend — Health Tab

### Navigation

New nav item **"Health"** inserted between Dashboard and Flow in the sidebar/tab bar.

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Savings Rate            Runway                     │
│  ┌────────────────┐  ┌────────────────┐             │
│  │    24.1%       │  │   4.2 mo       │             │
│  │ of income      │  │ at current burn│             │
│  └────────────────┘  └────────────────┘             │
│                                                      │
│  Current balance: ₹1,42,000                         │
│  ₹1,00,000 starting · ₹42,000 from transactions     │
│                                                      │
│  Monthly net                    [3mo] [6mo] [12mo]  │
│  ┌──────────────────────────────────────────────┐   │
│  │  ▓  ▓     ▓  ▓  ▓  ▓  (green=+, red=-)     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### States

| State | Behavior |
|-------|----------|
| No starting balance set | Balance row shows "Based on all tracked history". Inline nudge: "Set a starting balance in Settings for more accuracy." |
| `runway_months` null | Runway card shows "—" with sub-label "No expenses tracked" |
| `savings_rate` negative | Card shows negative %, label changes to "of income over-spent" |
| < 1 month of data | Monthly net section shows friendly empty state: "Not enough history yet. Come back after a full month." |
| Loading | Skeleton pulse on stat cards and bar chart |

### Bar chart

- One bar per month for the selected `months` window
- Green bar for positive net, red for negative
- Hover tooltip: "Jan 2026 · ₹23,000 net (₹85k in, ₹62k out)"
- Same visual style as existing charts (parchment background, ink colors from CSS vars)

### Toggle

3mo / 6mo / 12mo pill toggle in section header. Changing selection re-fetches `/api/stats/health?months=N`. Default: 6.

---

## Migration

New Alembic migration adds `starting_balance` (Numeric 12,2, nullable) and `starting_balance_date` (Date, nullable) to `user_settings`.

---

## Out of Scope

- Budget Envelopes mental model (not selected)
- Bank account connection / OFX import
- Net worth tracking (assets beyond cash)
- Push notifications for runway thresholds
