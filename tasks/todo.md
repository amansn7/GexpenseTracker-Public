# Backfill Service Improvement Plan

## Issues Found
1. `backfill-bodies` has **no progress reporting** — no `_user_progress` writes → SyncProgressOverlay gets no data
2. `backfill-bodies` runs **synchronously inline** — blocks request handler, no timeout, could hang
3. No dedicated **frontend UI** for triggering backfill-bodies — users can't see progress
4. Batch size inconsistency: 100 (backfill-bodies) vs 50 (fetch-range backfill)

## Tasks

### Backend
- [ ] Add `_user_progress` writes to `backfill-bodies` (phase, phase_detail, current, total, log events)
- [ ] Normalize batch size to 50 for consistency
- [ ] Add `/api/sync/trigger-backfill-bodies` endpoint → fires background task, returns immediately

### Frontend
- [ ] Add `AdminBackfillBodiesSection` to `account.jsx` (uses `useBackgroundJob` hook, shows SyncProgressOverlay)
- [ ] Add `AdminBackfillBodiesSection` to `admin.jsx`
- [ ] Wire up with SyncProgressOverlay for live progress

### Verify
- [ ] Run existing tests
- [ ] Test end-to-end flow

---

# Money Flow Tab Redesign — Full Plan

## Audit Summary
- **What works**: Sankey renders, KPIs work, data pipeline solid, date range filtering works
- **What's missing**: No click-through, bare tooltips, wasted Pool column, hard-to-scan amounts, no txn counts, disconnected Weekly Burn, no comparison context, fragile mobile view

## Design Principles (from PRODUCT.md + DESIGN.md)
- Clarity over density — financial data is stressful, every screen answers one question
- Warm earth tones (cream backgrounds, terra-cotta accent ≤10%)
- Flat surfaces with tonal layering (paper → paper-2 → card)
- Fraunces serif for titles, Geist sans for body, Geist Mono for amounts
- No gradients, no glassmorphism, no dark-SaaS template
- "The Warm Ledger" — personal notebook meets professional finance tool

## New Layout
```
[KPI Row: Remaining | Income | Spent | Daily burn]
[Sankey: Income Sources → Meaningful Pool → Where It Went]
[Insights/Summary row: savings rate, daily burn, top category, committed vs free]
[Weekly Burn — integrated as footer]
```
Pool column shows: total inflow, fixed vs variable split, committed vs discretionary ratio.

---

## Wave 1 — Core Interactivity + Readability (files: flow.jsx, app.jsx)
- [ ] Pass `setView` + `setCategoryFilter` callbacks from App → FlowView for click-through navigation
- [ ] Make Sankey nodes clickable (income, expense, CC, investment, savings) → navigate to Inbox with category filter
- [ ] Replace native `<title>` with rich positioned tooltip overlay showing: category name, amount, txn count, % of total, top 3 merchants
- [ ] Use `fmtK()` consistently inside SVG nodes for amount readability
- [ ] Add transaction counts to each expense node label: `₹15,000 · 8 txn`
- [ ] Increase font sizes in SVG for primary amounts

## Wave 2 — Visual Restructure (files: flow.jsx)
- [ ] Redesign Pool column to show meaningful breakdown: total inflow, committed vs discretionary mini-split
- [ ] Merge Weekly Burn into main Sankey section as integrated footer (remove separate secWrap)
- [ ] Add month-over-month delta arrows behind category amounts (↗12% / ↘5%)
- [ ] Add budget comparison bars to nodes (show % of budget consumed)
- [ ] Improve mobile Sankey: stacked horizontal bars (proportional, clickable) instead of flat list

## Wave 3 — New Features (files: flow.jsx, data.jsx, possible backend)
- [ ] Income source detail panel: hovering income node shows txn count, domain breakdown, consistency pattern
- [ ] Category drill-down mini-modal on click (top 5 merchants, 3 recent txn, view all CTA)
- [ ] "Upcoming commitments" disclosure below Remaining KPI: `₹4K committed · ₹8K free`
- [ ] Smooth empty state with guide illustration when no data
- [ ] Keyboard navigation: arrow keys between nodes, Enter to drill, Escape to go back

## Wave 4 — Backend API additions (files: stats.py)
- [ ] Add previous-period comparison data to stats endpoints (for month-over-month deltas)
- [ ] Add `txn_count` to category-breakdown endpoint response
- [ ] Add per-category merchant breakdown endpoint for hover/click drill-down
- [ ] Add committed/fixed expense data for upcoming commitments calculation

### Verify
- [ ] Run existing tests
- [ ] Manual smoke test: click each category → lands on Inbox with correct filter
- [ ] Manual smoke test: hover each node → tooltip shows correct data
- [ ] Test mobile responsive layout
- [ ] Build frontend and verify no JS errors
