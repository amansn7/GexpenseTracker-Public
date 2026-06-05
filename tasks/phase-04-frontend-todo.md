# [Frontend] Phase 4 Todo: Performance & State Architecture

**Source:** `tasks/phase-04-frontend.md`
**Progress:** 10/10 items ✅

---

## Frontend

### C1 — List Virtualization

- [x] Install `react-window` or `virtuoso` package
- [x] Replace `txs.map()` in inbox grouped rendering with virtualized list
- [x] Integrate infinite scroll trigger with virtualized scroll container
- [x] Test with 500, 2000, 5000 transactions for frame timing

### C2 — Fix React.memo on Row

- [x] Fix `updateTx` to not create new references for unchanged items
- [x] Verify Row `React.memo` comparison works (prev.tx === next.tx)

### C3 — Memoize Render Computations

- [x] Wrap `counts` in `useMemo`
- [x] Wrap `curCat`, `effectiveDateRange` in `useMemo`
- [x] Make `titles` object a static constant

### C4 — Split App State into Contexts

- [x] Create `ViewContext` (view state, navigation)
- [x] Create `FilterContext` (date range, categoryFilter, inboxFilter)
- [x] Create `SyncContext` (syncStatus, syncing, syncProgress)
- [x] Wrap view components in `React.memo`

### C5 — Code Splitting

- [x] Configure esbuild to produce per-view chunks
- [x] Use `React.lazy()` + `<Suspense>` for low-usage views
- [x] Content-hash each chunk
- [x] Update `templates/index.html` script loading

## Verification

- [x] Inbox renders smoothly with 2000+ transactions
- [x] Editing one transaction doesn't re-render all rows
- [x] Initial bundle < 150KB
- [x] Lighthouse Performance > 80
