# FlowView Deferred Features — Implementation Plan

## Overview

Three features for `flow.jsx` that were deferred pending backend API changes, now planned with a "no backend changes needed" approach where possible.

---

## 1. Month-over-Month Deltas (↗12% Arrows)

**Approach: Frontend-only, same pattern as Dashboard `compareStats`**

### Why not backend?
Dashboard already proves this pattern works (`dashboard.jsx:66-74`). No new endpoint needed. Calendar-month alignment is overkill for KPI arrows — relative-period comparison is fine.

### Changes

**`static/src/flow.jsx`**:

1. Add state: `const [compareStats, setCompareStats] = React.useState(null);`
2. Add `deltaPct` helper (copy from `dashboard.jsx:94-97`):
```js
const deltaPct = (current, previous) => {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous * 100).toFixed(1);
};
```
3. Add `useEffect` to fetch previous-period stats (lines 66-74 from dashboard):
```js
React.useEffect(() => {
  if (!rangeFrom || !rangeTo) { setCompareStats(null); return; }
  const rangeMs = new Date(rangeTo) - new Date(rangeFrom);
  const prevFrom = new Date(new Date(rangeFrom).getTime() - rangeMs - 1).toISOString().slice(0, 10);
  const prevTo = new Date(new Date(rangeFrom).getTime() - 1).toISOString().slice(0, 10);
  API.get(`/api/stats/summary?date_from=${prevFrom}&date_to=${prevTo}`)
    .then(d => setCompareStats(d))
    .catch(() => {});
}, [rangeFrom, rangeTo]);
```
4. Compute deltas in render body:
```js
const prevExpense = compareStats?.total_expenses ?? null;
const prevIncome = compareStats?.total_income ?? null;
const prevSavings = compareStats?.saved ?? null;
const expDelta = deltaPct(totalExpense, prevExpense);
const incDelta = deltaPct(totalIncome, prevIncome);
const savDelta = deltaPct(savings, prevSavings);
```
5. Append delta arrows to KPI card `flowStyles.kpiSub` divs:
   - **Remaining/Overspend**: `{savDelta != null && <span style={{color: parseFloat(savDelta) >= 0 ? "var(--pos)" : "var(--neg)", marginLeft: 6, fontSize: 11}}>{parseFloat(savDelta) >= 0 ? "↑" : "↓"}{Math.abs(savDelta)}%</span>}`
   - **Income**: `{incDelta != null && ...}`
   - **Spent**: `{expDelta != null && <span style={{color: "var(--neg)", marginLeft: 6, fontSize: 11}}>↑{Math.abs(expDelta)}%</span>}`
   - **Daily burn**: `{expDelta != null && <span style={{fontSize: 11, color: "var(--ink-3)", marginLeft: 4}}>vs prev {expDelta > 0 ? "↑" : "↓"}{Math.abs(expDelta)}%</span>}`

**Files touched**: 1 (`flow.jsx`)
**Risk**: Low. Exact copy of proven Dashboard pattern. Adding ~30 lines.

---

## 2. Budget Comparison Bars in Sankey

**Approach: Show only when FlowView range aligns with current month**

### Why not arbitrary ranges?
Budgets are defined per calendar month. Showing budget-vs-actual for a 90-day range against a 30-day limit is misleading. Prorating is complex and semantically questionable. Guard to current-month-only.

### Changes

**`static/src/flow.jsx`**:

1. Add state: `const [budgets, setBudgets] = React.useState([]);`
2. Add `useEffect` guard that fetches budgets only when range aligns with current month:
```js
const firstOfMonth = todayStr.slice(0, 7) + "-01";
const isCurrentMonth = rangeFrom === firstOfMonth && rangeTo === todayStr;

React.useEffect(() => {
  if (isCurrentMonth) {
    API.get("/api/budgets").then(d => setBudgets(d.budgets || [])).catch(() => {});
  } else {
    setBudgets([]);
  }
}, [isCurrentMonth]);
```
3. Build a budget lookup map: `const budgetMap = Object.fromEntries(budgets.map(b => [b.category, b]));`
4. In `SankeyDiagram` (or `FlowView` → pass as prop), for each right-node expense category that has a matching budget entry, overlay a small progress bar:
   - Inside the `rightNodes.map()` in `SankeyDiagram`, after the category bar, if the category has a budget entry, render a mini bar at the bottom of the node rect:
     ```jsx
     {budgetInfo && (
       <g>
         <rect x={RIGHT_X + 4} y={n.y + n.h - 8} width={RIGHT_W - 8} height={4} rx={2} fill="rgba(0,0,0,0.15)"/>
         <rect x={RIGHT_X + 4} y={n.y + n.h - 8} width={Math.min(1, budgetInfo.pct / 100) * (RIGHT_W - 8)} height={4} rx={2} fill={budgetInfo.over_budget ? "var(--neg)" : "var(--pos)"} opacity="0.8"/>
       </g>
     )}
     ```
   - Add budget info to the tooltip content: `"57% of ₹5K budget"`
5. Handle the `budgetMap` in `buildFlowSummary` or pass it as a separate prop to `SankeyDiagram`. Simple pass-through is cleaner: compute in `FlowView`, pass as `budgetMap` prop.

**Files touched**: 1 (`flow.jsx`)
**Risk**: Low-Medium. Small SVG addition. Need to account for node minimum height (6px) — hide budget bar if `n.h < 20` to avoid visual clutter.

---

## 3. Category Drill-Down Modal

**Approach: Overlay modal with transaction list for the clicked category**

### Why modal not drawer/modal-to-inbox?
- Modal keeps user in FlowView context (no navigation loss)
- Existing modal pattern in codebase (`budgets.jsx:43`, `goals.jsx:77`, `recurring.jsx:54` — all use same overlay pattern)
- `Row` component exists in `inbox-detail.jsx:1` — can reuse for transaction list

### Changes

**`static/src/flow.jsx`**:

1. Add state:
```js
const [drillCategory, setDrillCategory] = React.useState(null); // null | {cat, label, color}
const [drillTxns, setDrillTxns] = React.useState([]);
const [drillLoading, setDrillLoading] = React.useState(false);
```

2. Modify `handleCategoryClick` to open modal instead of navigating (for expense categories):
```js
const handleCategoryClick = (cat) => {
  if (!cat || cat === "__income__") {
    if (onNavigateToView) onNavigateToView("inbox");
    return;
  }
  setDrillCategory(cat);
};
```

3. Add `useEffect` to fetch transactions when drillCategory changes:
```js
React.useEffect(() => {
  if (!drillCategory) { setDrillTxns([]); return; }
  let cancelled = false;
  setDrillLoading(true);
  const qp = `category=${encodeURIComponent(drillCategory)}&date_from=${rangeFrom}&date_to=${rangeTo}&limit=200`;
  API.get(`/api/transactions?${qp}`)
    .then(d => { if (!cancelled) setDrillTxns(d.items || []); })
    .catch(() => {})
    .finally(() => { if (!cancelled) setDrillLoading(false); });
  return () => { cancelled = true; };
}, [drillCategory, rangeFrom, rangeTo]);
```

4. Add modal component (inline in flow.jsx, matching existing pattern):
```jsx
{drillCategory && (
  <div style={{position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16}}
    onClick={() => setDrillCategory(null)}>
    <div style={{background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px -16px var(--shadow-lg)"}}
      onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div style={{padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", flexShrink: 0}}>
        <CategoryDot cat={drillCategory} size={10}/>
        <span style={{fontSize: 16, fontWeight: 500, marginLeft: 8}}>{CategoryService.display(drillCategory).label}</span>
        <span style={{marginLeft: 12, fontSize: 12, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace"}}>
          {catBreakdown?.categories?.find(c => normCat(c.category) === drillCategory)?.amount ? fmtK(
            catBreakdown.categories.find(c => normCat(c.category) === drillCategory).amount
          ) : ""}
        </span>
        <button onClick={() => setDrillCategory(null)}
          style={{marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4}}>
          <Icon name="x" size={16}/>
        </button>
      </div>
      {/* Transaction list */}
      <div style={{overflowY: "auto", padding: "8px 0", flex: 1}}>
        {drillLoading ? (
          <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: 13}}>Loading…</div>
        ) : drillTxns.length === 0 ? (
          <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-4)", fontSize: 13}}>No transactions in this range</div>
        ) : (
          drillTxns.map((tx, i) => (
            <div key={tx.id} className="anim-row" style={{"--i": i, display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: i < drillTxns.length - 1 ? "1px solid var(--line)" : "none"}}>
              <MerchantLogo merchant={tx.merchant} size={24}/>
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{fontSize: 13, fontWeight: 500}}>{tx.merchant || "Unknown"}</div>
                <div style={{fontSize: 11, color: "var(--ink-4)", marginTop: 1}}>{tx.date}</div>
              </div>
              <div style={{fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 600, color: "var(--neg)"}}>
                {fmtK(Math.abs(tx.amount))}
              </div>
            </div>
          ))
        )}
      </div>
      {/* Footer with link to full view */}
      <div style={{padding: "10px 20px", borderTop: "1px solid var(--line)", textAlign: "center", flexShrink: 0}}>
        <button onClick={() => { setDrillCategory(null); handleCategoryClick(drillCategory); }}
          style={{border: "none", background: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", fontWeight: 500}}>
          View all in inbox →
        </button>
      </div>
    </div>
  </div>
)}
```

5. Import `MerchantLogo` if not already available in scope — check `window.MerchantLogo` from shell or existing globals.

**Files touched**: 1 (`flow.jsx`)
**Risk**: Medium. New component (~70 lines). Uses existing API pattern (`/api/transactions` with params already supported). No backend change.

---

## Execution Order & Dependencies

| Step | Feature | Est. Lines | Depends On | Risk |
|------|---------|-----------|------------|------|
| 1 | MoM deltas (compareStats + UI arrows) | ~35 | None | Low |
| 2 | Budget bars (useEffect guard + SVG overlay) | ~25 | Step 1 (same file) | Low |
| 3 | Category drill-down modal | ~90 | Steps 1-2 (same file) | Medium |

All three are independent — they modify different parts of `flow.jsx`. Can be implemented in any order.

## Verification

- `npm run build` (esbuild) — no type errors
- Manual: open FlowView, verify:
  - [ ] KPI cards show delta arrows (↗/↘) with correct sign
  - [ ] Budget bars appear only when range = current month
  - [ ] Budget bars disappear when range ≠ current month
  - [ ] Click expense category → modal opens with transaction list
  - [ ] Click "View all in inbox" → navigates to inbox with filter
  - [ ] Modal closes on background click, X button, or Escape
- No test changes needed (this is JSX-only UI work, no backend logic)
