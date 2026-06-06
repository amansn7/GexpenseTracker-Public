# Phase 9: Nice-to-Have Enhancements

**Source:** design-audit.md §11.4 (N1-N10)
**Effort:** ~12-18 days (can be parallelized)
**Dependencies:** All prior phases

## Overview

Premium-feel enhancements that differentiate the product: shared element transitions, OS theme integration, mobile gestures, push notifications, receipt capture, spending insights, PDF export, haptic feedback, CSS container queries, and a11y test automation.

## Items

### N1 — Shared Element Transitions (2-3 days)

Use Framer Motion `layoutId` for smooth transitions between list items and detail views.

- Install: `npm install framer-motion`
- Animate transaction row → detail panel expansion (morph card into full panel)
- Animate modal entrance from triggering button position
- All transitions use spring physics: `type: "spring", stiffness: 100, damping: 20`
- No layout property animations — only `transform` and `opacity`

### N2 — OS Theme Auto-Switch (0.5 day)

- Add `matchMedia("(prefers-color-scheme: dark)")` listener
- On change: if user hasn't manually set a theme, auto-switch between paper ↔ midnight
- Store preference as "auto" in localStorage instead of a fixed theme
- Add "System" option to the theme switcher UI

### N3 — Mobile Gestures (1-2 days)

- **Swipe-to-delete**: on transaction rows, swipe left to reveal delete action
- **Swipe-to-navigate**: on inbox, swipe left → flow, swipe right → dashboard
- **Pull-to-refresh**: add to all scrollable views (currently only inbox)
- Use `react-use-gesture` or native touch events with proper cleanup

### N4 — Push Notifications (2-3 days)

- Implement Web Push API subscription on login/onboarding
- Subscribe to sync completion events
- Subscribe to budget threshold alerts
- Add notification permission request in onboarding wizard
- Handle notification clicks to navigate to relevant view

### N5 — Receipt Capture (2-3 days)

- Add "Add Receipt" button to transaction detail panel
- Use `navigator.mediaDevices.getUserMedia` for camera capture
- Upload to server via multipart POST
- Display attached receipt images inline in detail panel

### N6 — Spending Insights (3-4 days)

- LLM-powered analysis: compare current month spending to previous months
- Show "You spent X% more on food this month" cards in dashboard
- Weekly digest-style summary
- "You could save ₹Y by reducing Z" suggestions
- Hook into existing LLM API infrastructure

### N7 — PDF Export (2 days)

- Add "Export as PDF" button to reports page
- Generate PDF on server (or client-side with `html2canvas` + `jsPDF`)
- Include: summary stats, monthly bar chart, transaction table
- Download with filename `MoneyFlow-Report-YYYY-MM.pdf`

### N8 — Haptic Feedback (0.5 day)

- Add `navigator.vibrate(10)` on button press (Android)
- Add `navigator.vibrate([10, 50, 10])` on destructive actions
- Respect `prefers-reduced-motion` — skip vibration if motion reduced
- iOS: use CSS `:active` scale transforms as visual alternative (Taptic API requires native)

### N9 — CSS Container Queries (2 days)

- Replace `isMobile` JavaScript checks with CSS `container` queries
- Define a `page-layout` containment context
- Components adapt to available width instead of viewport width
- Gradual migration: start with dashboard stat cards, then inbox toolbar

### N10 — Automated a11y Tests (0.5 day)

- Install `@axe-core/react` (dev dependency)
- Add to dev bootstrap: `if (process.env.NODE_ENV !== 'production') { ... }`
- Run in e2e tests: `npx playwright test` includes `@axe-core/playwright`
- Add CI step: `npm run test:a11y`

## Verification

- [ ] Shared element transitions play smoothly (60fps)
- [ ] Theme auto-switches with OS setting
- [ ] Swipe-to-delete works on transaction rows
- [ ] Push notifications appear for sync completion
- [ ] Receipt capture saves and displays correctly
- [ ] Spending insights show accurate comparisons
- [ ] PDF export renders correctly
- [ ] Haptic feedback fires on button press (Android)
- [ ] Container queries replace all isMobile checks in at least 2 views
- [ ] CI fails if a11y violations are introduced
