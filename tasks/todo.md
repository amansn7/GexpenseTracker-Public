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
