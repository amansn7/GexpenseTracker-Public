# Design: MoneyFlow Date Range Fix + Shared DateRangeControl

Date: 2026-04-19
Status: Approved

---

## Goal

Fix the MoneyFlow (FlowView) page so it shows data for the selected time range instead of all-time data, and make the period control functional. Extract the date range UI into a reusable `DateRangeControl` component used consistently across Dashboard and Flow views.

---

## Problem

1. `FlowView` receives `flowSummary` from `App` which is built from ALL transactions with no date filter — always shows all-time data.
2. The "Month / Quarter / Year" buttons in `flow.jsx` have no `onClick` handlers — purely decorative.
3. KPI sub-texts are hardcoded strings ("2 sources", "48% of income", "over 18 days").

---

## Shared Component: `DateRangeControl`

**Location:** `static/src/shell.jsx` (exported via `window` alongside `Sidebar`, `Topbar`)

**Props:**
- `rangeFrom: string` — ISO date string (YYYY-MM-DD), left bound
- `rangeTo: string` — ISO date string (YYYY-MM-DD), right bound
- `activePreset: string | null` — currently active preset key ("7d", "30d", "90d", "1y") or null
- `onChange(from, to, preset)` — called on any change; `preset` is null when date pickers used directly

**Behavior:**
- Renders a row of 4 preset chips: `7d | 30d | 90d | 1y`
- Renders two `<input type="date">` pickers (from / to)
- Clicking a preset: computes `from = today - N days`, `to = today`, calls `onChange(from, to, presetKey)`
- Editing a date input: calls `onChange(newFrom, rangeTo, null)` or `onChange(rangeFrom, newTo, null)`
- Active preset chip is visually highlighted (`var(--ink)` background, `var(--paper)` text); others use `var(--card)`
- Date pickers reflect current `rangeFrom`/`rangeTo` at all times

**The component does not own state.** State lives in each consuming view.

---

## DashboardView Refactor

`static/src/dashboard.jsx` currently has the preset + date picker UI implemented inline. Replace that inline implementation with `<DateRangeControl>`, keeping identical behavior. No logic changes — just the UI extraction.

---

## FlowView Fix

`static/src/flow.jsx`

### State (added to `FlowView`)
- `rangeFrom: string` — default: 30 days ago
- `rangeTo: string` — default: today
- `activePreset: string` — default: `"30d"`
- `stats: object | null` — fetched summary response
- `catBreakdown: object | null` — fetched category-breakdown response
- `flowLoading: bool`

### Data Fetching
Debounced `useEffect` (300ms) with cancellation flag, triggered on `rangeFrom`/`rangeTo` changes:
```
GET /api/stats/summary?date_from={rangeFrom}&date_to={rangeTo}
GET /api/stats/category-breakdown?date_from={rangeFrom}&date_to={rangeTo}
```
Both fetched in parallel via `Promise.all`. On success: `setStats` + `setCatBreakdown`.

### Flow Data
```javascript
const rangeTxs = transactions.filter(t => t.date >= rangeFrom && t.date <= rangeTo);
const flow = stats && catBreakdown ? buildFlowSummary(rangeTxs, stats, catBreakdown) : null;
```
`flow` is null while loading; show a loading indicator in place of Sankey + WeeklyBurn.

### KPI Fixes (computed, not hardcoded)
- Income sources: `flow.income.length` sources
- Spent %: `(totalExpense / totalIncome * 100).toFixed(0)% of income`
- Daily burn sub: days elapsed = difference between `rangeFrom` and `rangeTo` in days

### Controls
Replace the "Month / Quarter / Year" buttons with `<DateRangeControl rangeFrom={rangeFrom} rangeTo={rangeTo} activePreset={activePreset} onChange={(f,t,p) => { setRangeFrom(f); setRangeTo(t); setActivePreset(p); }}/>`.

### Sankey Guard
Render `<SankeyDiagram>` and `<WeeklyBurn>` only when `flow` is non-null. Show a simple centered spinner while `flowLoading`.

---

## app.jsx Changes

- Remove `flowSummary &&` guard from FlowView render: `{view === "flow" && <FlowView transactions={transactions}/>}`
- Remove `flow={flowSummary}` prop — FlowView no longer accepts it
- `flowSummary` state + `buildFlowSummary` call in `loadData` can remain (still used by nothing else — but keep to avoid breaking anything; it's a cheap call)

Actually: `flowSummary` is only used for `FlowView`. Once FlowView is self-fetching, `flowSummary` becomes unused in `app.jsx`. Remove:
  - `const [flowSummary, setFlowSummary] = useState(null)`
  - `setFlowSummary(buildFlowSummary(...))` in `loadData`

---

## Implementation Order

1. Add `DateRangeControl` to `shell.jsx`
2. Refactor `DashboardView` to use `<DateRangeControl>` (no behavior change)
3. Fix `FlowView` — self-fetching, `<DateRangeControl>`, computed KPIs
4. Clean up `app.jsx` — remove `flowSummary` state + prop
