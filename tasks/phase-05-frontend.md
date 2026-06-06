# Phase 5: Design System Core

**Source:** design-audit.md §11.2 (H1, H8)
**Effort:** ~4-5 days
**Dependencies:** None

## Overview

The app has no shared component library — modals, buttons, inputs, toggles, and progress bars are copy-pasted across 8+ files with micro-divergences. This phase creates a canonical set of components in `static/src/components/`.

## Items

### H1 — Create Shared Component Library (3-4 days)

Create `static/src/components/` directory with:

**Modal**
- Unified open/close with exit animation (150ms before unmount)
- Desktop: centered overlay
- Mobile: bottom sheet via portal to #modal-root
- Backdrop click closes, Escape key closes, focus trap
- `aria-modal="true"`, `role="dialog"`, `aria-label` support

**BottomSheet**
- Mobile variant of Modal: slides up from bottom
- Drag handle for swipe-to-dismiss (extract from inbox-detail.jsx)
- Safe area aware

**Button**
- Props: `variant` (primary | ghost | subtle | danger), `size` (sm | md | lg), `loading`, `disabled`, `icon`, `children`
- Unified hover/active/disabled states
- Loading state: spinner replaces icon
- No inline style overrides — all via CSS classes

**Input**
- Props: `label`, `error`, `hint`, `prefix` (₹ symbol), `type`, `value`, `onChange`
- Error state: red border + error text below
- Label above input, hint below
- Focus ring via `:focus-visible`

**Toggle**
- Props: `checked`, `onChange`, `label`, `disabled`
- `role="switch"`, `aria-checked`
- Accessible via keyboard (Space to toggle)

**ProgressBar**
- Props: `value` (0-100), `size` (sm | md), `color` (accent | pos | neg), `animated`
- `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Uses `transform: scaleX()` for animation (as per DESIGN.md rules)

**Skeleton**
- Props: `width`, `height`, `variant` (text | circle | rect | card), `count` (repeat N times)
- Pulse animation via CSS class
- Replace all inline skeleton patterns across views

### H8 — Standardize Modal Exit Animations (0.5 day)

- Audit every modal in the codebase
- Replace all ad-hoc `closing` + `setTimeout` patterns with the shared Modal component
- Ensure every modal plays a 150ms exit animation before unmounting
- Remove duplicated modal JSX (desktop + mobile branches in inbox.jsx bulk wizard)

## Verification

- [ ] All 6 shared components exist and are used by at least 2 views
- [ ] Modal exit animations play consistently
- [ ] Toggle is keyboard-accessible
- [ ] ProgressBar has correct ARIA attributes
- [ ] Skeleton doesn't cause layout shift
