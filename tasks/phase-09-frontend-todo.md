# [Frontend] Phase 9 Todo: Nice-to-Have Enhancements

**Source:** `tasks/phase-09-frontend.md`
**Progress:** 0/10 items

---

## Frontend

### N1 — Shared Element Transitions

- [ ] Install `framer-motion`
- [ ] Animate transaction row → detail panel expansion
- [ ] Animate modal entrance from trigger position
- [ ] Use spring physics on all animations

### N2 — OS Theme Auto-Switch

- [ ] Add `prefers-color-scheme` dark mode listener
- [ ] Auto-switch paper ↔ midnight on OS change
- [ ] Add "System" option to theme switcher

### N3 — Mobile Gestures

- [ ] Add swipe-to-delete on transaction rows
- [ ] Add swipe-to-navigate (inbox → flow → dash)
- [ ] Add pull-to-refresh to all scrollable views

### N4 — Push Notifications

- [ ] Implement Web Push API subscription
- [ ] Sync completion notification
- [ ] Budget threshold alerts
- [ ] Notification click → relevant view

### N5 — Receipt Capture

- [ ] Add "Add Receipt" button to detail panel
- [ ] Camera capture via `getUserMedia`
- [ ] Upload and display inline

### N6 — Spending Insights

- [ ] LLM-powered month-over-month comparison
- [ ] Dashboard insight cards
- [ ] Weekly summary
- [ ] Savings suggestions

### N7 — PDF Export

- [ ] "Export as PDF" on reports page
- [ ] Include stats + chart + transaction table

### N8 — Haptic Feedback

- [ ] `navigator.vibrate()` on button press (Android)
- [ ] Respect `prefers-reduced-motion`

### N9 — CSS Container Queries

- [ ] Define container context on page layout
- [ ] Migrate dashboard stat cards from isMobile to container queries
- [ ] Migrate inbox toolbar

### N10 — Automated a11y Tests

- [ ] Install `@axe-core/react` (dev)
- [ ] Add a11y check to dev bootstrap
- [ ] Add `@axe-core/playwright` to e2e
- [ ] Add a11y CI step

## Verification

- [ ] Shared element transitions at 60fps
- [ ] Theme auto-switches with OS
- [ ] Swipe-to-delete works
- [ ] Push notifications fire
- [ ] Receipt capture displays correctly
- [ ] Spending insights are accurate
- [ ] PDF renders correctly
- [ ] Haptic feedback fires on Android
- [ ] Container queries replace isMobile in 2+ views
- [ ] CI fails on a11y violations
