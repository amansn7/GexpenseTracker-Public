# Phase 4: Performance & State Architecture

**Source:** design-audit.md §11.1 (C1-C5)
**Effort:** ~7-9 days
**Dependencies:** None

## Overview

The app has critical performance bottlenecks: no list virtualization, defeated React.memo, redundant render computations, monolithic App re-renders, and a single 474KB bundle. This phase fixes the foundation so the app doesn't crash at scale.

## Items

### C1 — List Virtualization (2-3 days)

Replace the transaction list in `inbox.jsx` with a virtualized list using `react-window` or `virtuoso`.

- Install package: `npm install react-window`
- Replace the direct `txs.map()` in the grouped rendering with `<FixedSizeList>` or `<Virtuoso>`
- Virtualize to viewport height + 2x overscan (default: ~5 rows visible → render ~15)
- Ensure the infinite scroll trigger integrates with the virtualized scroll container
- Test with 500, 2000, 5000 transactions

### C2 — Fix React.memo on Row (0.5 day)

Fix the `updateTx` function so `prev.tx === next.tx` comparison works.

- Change `setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))`
- To: use `useRef` to store a mutable Map, or use Immer-style immutable updates
- Alternative: change Row's `React.memo` comparison to a deep-ish compare on relevant fields

### C3 — Memoize Render Computations (0.5 day)

Wrap render-body computations in `useMemo`.

- `counts` object in app.jsx (4+ `.filter()` calls on transactions)
- `curCat` derivation
- `effectiveDateRange` derivation
- `titles` object (could be a static constant)

### C4 — Split App State into Contexts (2-3 days)

Reduce cascading re-renders by splitting the monolithic App state.

- Create `ViewContext` (view state, navigation)
- Create `FilterContext` (date range, categoryFilter, inboxFilter)
- Create `SyncContext` (syncStatus, syncing, syncProgress)
- Wrap each view component in `React.memo`
- Views only re-render when their relevant context changes

### C5 — Code Splitting (2 days)

Reduce the 474KB initial bundle by lazy-loading views.

- Use `React.lazy()` + `<Suspense>` for each view component
- Group views by usage frequency (inbox + shell always loaded; flow, dashboard, health lazy)
- Update esbuild config to produce per-view chunks instead of one `mf-views.js`
- Content-hash each chunk for long-term caching

## Verification

- [x] Inbox renders smoothly with 2000+ transactions (< 16ms frame time)
- [x] Editing one transaction doesn't re-render all rows
- [x] Switching views doesn't re-render background views
- [x] Initial bundle size < 150KB (down from 474KB)
- [x] Lighthouse Performance score > 80
