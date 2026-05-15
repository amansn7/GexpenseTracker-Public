---
name: release-check
description: Use before shipping changes to MoneyFlow when you need a compact regression pass across backend, compiled frontend, and key user flows. Covers targeted test selection, frontend build verification, and manual smoke-check planning for inbox, dashboard, onboarding, settings, and sync.
---

# Release Check

Use this skill before commits, merges, or deploys that touch behavior.

## Workflow

1. Classify the change:
   - backend only
   - frontend only
   - full-stack
   - infra/config
2. Run the smallest credible verification set for the touched surface.
3. Prefer targeted tests first, then broader suite coverage if the blast radius is large.
4. If frontend source changed, verify the compiled output path still works:
   - source lives in `static/src/`
   - build output lives in `static/dist/`
   - build script is `node scripts/build-frontend.mjs`
5. Report:
   - what was verified
   - what was not verified
   - residual risk

## Minimum checks by surface

### Backend

- Run the nearest pytest files for touched modules.
- If auth, sync, or classifier behavior changed, mention the exact covered test files.

### Frontend

- Run the frontend build when `static/src/` changed.
- If visual behavior changed, note the user flows that should be browser-smoked:
  - inbox
  - dashboard
  - onboarding/account
  - settings/admin
  - recurring/budgets if touched

### Full-stack

- Run targeted pytest coverage.
- Run the frontend build.
- Call out at least one end-to-end user flow that still needs manual browser validation if you could not run it.

## Project-specific rules

- Do not claim the app is verified if only unit tests passed and the compiled frontend was not checked after JSX changes.
- Admin/settings, onboarding, and inbox bulk actions are high-surface UI areas; mention them explicitly when touched.
- If a known pre-existing failing test remains, separate that from regressions introduced by the current change.

## Useful commands

- `python3 -m pytest tests/<target>.py`
- `npm run build`

## Output expectations

- `Verified`
- `Not verified`
- `Residual risk`
