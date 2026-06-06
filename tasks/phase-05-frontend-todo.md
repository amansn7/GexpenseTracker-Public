# [Frontend] Phase 5 Todo: Design System Core

**Source:** `tasks/phase-05-frontend.md`
**Progress:** 10/10 items ✅

---

## Frontend

### H1 — Create Shared Component Library

- [x] Create `static/src/components/` directory
- [x] Build shared `Modal` component (desktop overlay + mobile bottom sheet + exit animation)
- [x] Build shared `BottomSheet` component with swipe-to-dismiss
- [x] Build shared `Button` component (variant, size, loading, icon props)
- [x] Build shared `Input` component (label, error, hint, prefix props)
- [x] Build shared `Toggle` component (`role="switch"`, `aria-checked`)
- [x] Build shared `ProgressBar` component (`role="progressbar"`, ARIA attrs)
- [x] Build shared `Skeleton` component (variant, width, height, count props)
- [x] Migrate at least 2 views to use shared components

### H8 — Standardize Modal Exit Animations

- [x] Audit all modals across codebase
- [x] Replace ad-hoc `closing` + `setTimeout` patterns with shared Modal
- [x] Remove duplicated desktop/mobile JSX branches in inbox bulk wizard
- [x] Verify every modal plays 150ms exit animation

## Verification

- [x] All 7 shared components exist and used in >= 2 views
- [x] Modal exit animations consistent (0 ad-hoc patterns remaining)
- [x] Toggle keyboard-accessible (`role="switch"`, `aria-checked`)
- [x] ProgressBar has correct ARIA (`role="progressbar"`, `aria-valuenow/min/max`)
- [x] No layout shift from Skeleton
