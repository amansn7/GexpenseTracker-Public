# Stats Pipeline Unification — Design Document

## Overview

Replace 8 separate `/api/stats/*` endpoints + duplicate frontend fetches with a single
composable `/api/stats` endpoint. Every view requests exactly what it needs in one call.

---

## 1. Backend: Unified `GET /api/stats`

### Request

```
GET /api/stats?sections=summary,categoryBreakdown,topMerchants,health
&date_from=2026-01-01&date_to=2026-05-29
&category=Food
&months=6
&compare=true
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sections` | comma-sep string | `"summary"` | Which data sections to include |
| `date_from` | ISO date | — | Explicit range start |
| `date_to` | ISO date | — | Explicit range end |
| `category` | string | — | Filter by category alias |
| `period` | `1m\|3m\|6m\|1y` | — | Fallback if no date_from/date_to |
| `months` | `3\|6\|12` | `6` | For `health` section only |
| `compare` | bool | `false` | Include `previousPeriod` section |

### Available Sections

| Section | Returns | Requires | Used By |
|---------|---------|----------|---------|
| `summary` | Aggregated totals (expense, income, CC, investments, savings, savings_rate, needs_review_count, unread_count) | date range or period | FlowView, DashboardView |
| `categoryBreakdown` | Per-category amounts + pct + txn_count | date range or period | FlowView, DashboardView |
| `topMerchants` | Top 8 merchants by spend | date range or period | DashboardView |
| `health` | Balance, savings_rate, runway, monthly_net | months param | DashboardView, HealthView |
| `monthlySummary` | 12-month table (with labels, net, savings_rate) | — | ReportsView |
| `monthlyTrend` | Month-by-month expense/income | date range or period | (API consumers) |
| `budgets` | All budgets with spent_this_month | — | DashboardView |
| `previousPeriod` | `summary` for the previous period of same length | `compare=true` + date range | FlowView, DashboardView |

### Response Shape

```jsonc
{
  // ── summary ──────────────────────────────────────────────────
  "summary": {
    "total_expenses": 45231.50,
    "total_income": 85000.00,
    "total_cc_payments": 8500.00,
    "total_cc_payments_count": 3,
    "total_investments": 15000.00,
    "total_investments_count": 2,
    "saved": 16268.50,
    "savings_rate": 19.1,
    "needs_review_count": 4,
    "unread_count": 12
  },

  // ── categoryBreakdown ───────────────────────────────────────
  "categoryBreakdown": {
    "categories": [
      { "category": "food", "amount": 12500.00, "pct": 27.6, "txn_count": 45 },
      { "category": "transport", "amount": 3200.00, "pct": 7.1, "txn_count": 12 }
    ],
    "total": 45231.50
  },

  // ── topMerchants ────────────────────────────────────────────
  "topMerchants": {
    "merchants": [
      { "merchant": "Zepto", "amount": 8500.00 },
      { "merchant": "Uber", "amount": 3200.00 }
    ]
  },

  // ── health ──────────────────────────────────────────────────
  "health": {
    "current_balance": 152300.00,
    "savings_rate": 22.5,
    "runway_months": 14.2,
    "starting_balance": 100000.00,
    "starting_balance_date": "2025-01-01",
    "balance_mode": "anchored",
    "monthly_net": [
      { "month": "2026-01", "income": 85000, "expenses": 42000, "net": 43000 },
      { "month": "2026-02", "income": 85000, "expenses": 38000, "net": 47000 }
    ],
    "total_cc_payments": 35000.00,
    "total_investments": 60000.00
  },

  // ── monthlySummary ──────────────────────────────────────────
  "monthlySummary": {
    "months": [
      { "month": "2026-05", "label": "May 2026", "income": 85000,
        "expenses": 42200.00, "net": 42800.00, "savings_rate": 50.4 }
    ]
  },

  // ── monthlyTrend ────────────────────────────────────────────
  "monthlyTrend": {
    "months": [
      { "month": "2026-05", "expenses": 42200.00, "income": 85000.00 }
    ]
  },

  // ── budgets ─────────────────────────────────────────────────
  "budgets": {
    "budgets": [
      { "id": 1, "category": "Food", "monthly_limit": 15000,
        "spent_this_month": 12500.00, "pct": 83.3, "over_budget": false }
    ]
  },

  // ── previousPeriod (only if compare=true) ───────────────────
  "previousPeriod": {
    "date_from": "2025-12-01",
    "date_to": "2025-12-31",
    "summary": { /* same shape as above */ }
  }
}
```

Missing sections are `undefined` (not `null`). Frontend checks `if (result.summary)` etc.

### Backend Implementation Strategy

**File:** `app/api/stats.py` — add a new `@router.get("/stats")` handler.

```python
@router.get("/stats")
async def get_stats(
    sections: str = "summary",
    date_from: date | None = None,
    date_to: date | None = None,
    category: str | None = None,
    period: str = "1m",
    months: int = 6,
    compare: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
```

**Batch optimization:** When multiple sections are requested, compute shared date
bounds once, then execute only the required queries. Reuse filter predicates
across sections (e.g., `expense_where` is shared by summary + topMerchants).

**Previous period:** When `compare=true`, compute the previous date range
server-side (same logic currently duplicated in FlowView + DashboardView):

```python
if compare and date_from and date_to:
    range_days = (date_to - date_from).days
    prev_from = date_from - timedelta(days=range_days + 1)
    prev_to = date_from - timedelta(days=1)
    # re-invoke summary queries with prev range
```

**Backward compat:** All existing `/api/stats/summary`, `/api/stats/category-breakdown`,
etc. endpoints are **kept as-is** — they delegate to the same helper functions.
No changes to existing consumers (external API users, tests).

**No caching layer** at this stage (cache headers can be added later if needed).

---

## 2. Frontend: Per-View Migration

### FlowView (`static/src/flow.jsx`)

**Current:** 3 fetches (summary + categoryBreakdown + previous summary)

```js
// Current (lines 705-726)
const [s, c] = await Promise.all([
  API.get(`/api/stats/summary?${dateQP}${catQP}`),
  API.get(`/api/stats/category-breakdown?${dateQP}${catQP}`),
]);
// ... separate effect for previous period fetch
```

**New:** 1 fetch (with `compare=true`)

```js
const result = await API.get(`/api/stats?sections=summary,categoryBreakdown&${dateQP}${catQP}&compare=true`);
setStats(result.summary);
setCatBreakdown(result.categoryBreakdown);
setCompareStats(result.previousPeriod?.summary ?? null);
```

**Changes:**
- `stats` ← renamed from `result.summary` (same shape)
- `catBreakdown` ← `result.categoryBreakdown` (same shape)
- `compareStats` ← `result.previousPeriod?.summary` (same shape)
- Remove the separate `useEffect` for previous period fetch
- Remove `compareStats` computation (now server-side)
- ~25 lines removed, ~10 lines added

### DashboardView (`static/src/dashboard.jsx`)

**Current:** 6 fetches (budgets + health + summary + categoryBreakdown +
topMerchants + previous summary)

```js
// Current (lines 37-70)
API.get("/api/budgets").then(...);
API.get("/api/stats/health?months=6").then(...);
const [s, c, tm] = await Promise.all([
  API.get(`/api/stats/summary?${dateQP}${catQP}`),
  API.get(`/api/stats/category-breakdown?${dateQP}${catQP}`),
  API.get(`/api/stats/top-merchants?${dateQP}`),
]);
// ... separate effect for previous period fetch
```

**New:** 1 fetch (with `compare=true`)

```js
const result = await API.get(
  `/api/stats?sections=summary,categoryBreakdown,topMerchants,health,budgets&${dateQP}${catQP}&compare=true`
);
setStats(result.summary);
setCatBreakdown(result.categoryBreakdown);
setHealth(result.health);
setTopMerchants(result.topMerchants?.merchants || []);
setBudgets(result.budgets?.budgets || []);
setCompareStats(result.previousPeriod?.summary ?? null);
```

**Changes:**
- Remove the separate `useEffect` for budgets + health
- Merge into the existing debounced fetch
- 6 `<script>` calls → 1
- ~30 lines removed

### HealthView (`static/src/health.jsx`)

**Current:** 1 fetch

```js
API.get(`/api/stats/health?months=${months}`)
```

**New:** same pattern

```js
const result = await API.get(`/api/stats?sections=health&months=${months}`);
setData(result);  // use result.health directly
```

**Changes:**
- Minimal: map `result.health` instead of raw response
- Response shape is identical — just nested under `health` key

### ReportsView (`static/src/reports.jsx`)

**Current:** 1 fetch

```js
API.get("/api/stats/monthly-summary")
```

**New:** same pattern

```js
const result = await API.get(`/api/stats?sections=monthlySummary`);
setMonths(result.monthlySummary.months);
```

**Changes:**
- Minimal: access via `result.monthlySummary.months`
- Response shape identical

### GoalsView + BudgetsView + DebtView + RecurringView

**No changes.** These are CRUD views with their own endpoints. They don't overlap
with the stats pipeline. BudgetsView creates/edits/deletes budgets; only the
DashboardView's read-only budget snapshot is migrated to the unified endpoint.

---

## 3. Migration Order

| Step | Files | Effort | Risk |
|------|-------|--------|------|
| 1. Add unified endpoint to `app/api/stats.py` | `app/api/stats.py` | Medium | None (additive) |
| 2. Migrate FlowView to `sections=summary,categoryBreakdown` + `compare` | `flow.jsx` | Small | Affects Money Flow tab |
| 3. Migrate DashboardView to consolidated fetch | `dashboard.jsx` | Small | Affects Dashboard tab |
| 4. Migrate HealthView | `health.jsx` | Trivial | Affects Health tab |
| 5. Migrate ReportsView | `reports.jsx` | Trivial | Affects Reports tab |
| 6. Remove unused state/effects | All above | Small | Cleanup |
| 7. Run `npm run build` | — | — | Verify frontend compiles |
| 8. Smoke test all views | — | — | Verify parity |

**Defer to a future pass:**
- Shared stats cache between views (avoids refetch on navigate)
- Server-side subscription/unread/flagged stats (currently computed client-side from raw transactions)
- `compare` support for `categoryBreakdown` and `topMerchants`

---

## 4. Files Changed

| File | Type | Change |
|------|------|--------|
| `app/api/stats.py` | Backend | +~200 lines for unified handler |
| `static/src/flow.jsx` | Frontend | ~10 lines changed, ~25 removed |
| `static/src/dashboard.jsx` | Frontend | ~15 lines changed, ~30 removed |
| `static/src/health.jsx` | Frontend | ~3 lines changed |
| `static/src/reports.jsx` | Frontend | ~3 lines changed |

**Total: ~5 files, ~230 lines added, ~60 removed**

---

## 5. Verification

1. `cd app && python -m pytest tests/ -x -q` — all existing tests pass (backward compat)
2. `npm run build` — frontend compiles cleanly
3. Manual smoke: navigate between Flow, Dashboard, Health, Reports — same data renders
