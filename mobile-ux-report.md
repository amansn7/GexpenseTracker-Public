# Mobile UX Audit Report — MoneyFlow (Gexpense Tracker)

Generated: June 7, 2026

## Pages & Views

### 1. Inbox (primary view)
- **Status**: Needs adaptation
- **Issues**:
  - Table layout with `min-width: 680px` causes horizontal scroll on mobile
  - Multi-column transaction rows are cramped below 400px width
  - Checkbox hover targets (`chk-placeholder`) not touch-friendly
  - Detail panel slides in from right (uses `slideInRight`) — good on mobile
- **Recommendation**: Stack transaction rows vertically on mobile (label/amount/date per row)

### 2. Dashboard (stat cards)
- **Status**: Partially adapted
- **Existing fixes**: `.stat-grid` has `grid-template-columns: 1fr 1fr` at ≤720px
- **Issues**:
  - Some stat cards show 2-column at 720px, but 3-column at wider sizes
  - Chart components need touch-friendly tooltips
- **Recommendation**: Single column at ≤480px

### 3. Flow (Sankey diagram)
- **Status**: Needs adaptation
- **Issues**:
  - SVG-based Sankey diagram is complex for small screens
  - Mobile already renders a list fallback (isMobile early return in flow.jsx)
- **Recommendation**: List fallback is sufficient; improve touch targets on list items

### 4. Health
- **Status**: Partially adapted
- **Existing fixes**: Responsive cards with `.health-card { margin }` at ≤560px
- **Recommendation**: Test expandable sections on touch devices

### 5. Reports
- **Status**: Needs adaptation
- **Issues**:
  - SVG bar charts with hover labels not touch-friendly
  - Period tabs (`.period-tab`) are small touch targets
- **Recommendation**: Add touch event handlers for chart tooltips

### 6. Recurring
- **Status**: Needs adaptation
- **Issues**:
  - Table/list view may overflow on small screens
- **Recommendation**: Ensure responsive layout

### 7. Debt
- **Status**: Needs adaptation
- **Issues**:
  - Progress bars and data layouts
- **Recommendation**: Stack vertically on mobile

### 8. Goals
- **Status**: New (recently added)
- **Issues**:
  - Similar to Debt view, needs mobile testing
- **Recommendation**: Apply same responsive patterns

### 9. Budgets
- **Status**: New (recently added)
- **Existing fixes**: `.budget-row` already uses card-based layout (good for mobile)
- **Recommendation**: Ensure budget bars are touch-friendly

### 10. Profile / Settings
- **Status**: Likely mobile-compatible
- **Issues**:
  - Form elements need proper touch sizing
- **Recommendation**: Test all form controls

### 11. Search
- **Status**: Needs adaptation
- **Issues**:
  - Search results displayed as rows with hover states
  - Keyboard shortcut (Cmd+K) not available on mobile
- **Recommendation**: Add mobile search trigger button in top bar

### 12. Today
- **Status**: Same as Dashboard

### 13. Picture
- **Status**: Same as Flow (Sankey)

### 14. Review
- **Status**: Same as Inbox

### 15. Onboarding
- **Status**: Needs evaluation
- **Recommendation**: Test all step transitions on mobile

## Global Mobile Issues

### Safe Areas
- **Status**: GOOD — `env(safe-area-inset-*)` already defined in `:root` (styles.css:2-9)
- **Coverage**:
  - `body` uses `min-height: 100dvh` ✓
  - `.layout` uses `min-height: 100dvh` ✓
  - `.sidebar` uses `height: 100dvh` ✓
  - `#sync-panel` does NOT use safe areas — needs padding-bottom
  - Mobile nav toggle (≤980px) does NOT use safe area padding

### Touch Targets
- **Status**: PARTIAL — `@media (pointer: coarse)` media query (styles.css:683-695)
- **Missing**:
  - Inline clickable elements in inbox rows (labels, actions)
  - Period tabs are 5px padding — below 44px minimum
  - Nav items in sidebar are 8px padding — below 44px
  - Glass header links are 11px font — too small

### Navigation
- **Status**: GOOD — mobile sidebar drawer exists (≤980px)
- **Issues**:
  - Backdrop tap to close works
  - No swipe-to-close gesture
  - No bottom tab bar alternative for native feel

### Overflow & Scrolling
- **Status**: PARTIAL
- **Tables**: `min-width: 680px` on all tables (styles.css:812) — forces horizontal scroll
- **Sync panel**: Fixed position at bottom-right — overlaps with mobile safe area

## Responsive Breakpoints

| Breakpoint | Exists | Purpose |
|---|---|---|
| ≤980px | Yes | Mobile layout switch (sidebar drawer) |
| ≤900px | Yes | Tighter padding |
| ≤720px | Yes | Stat grid 2-column |
| ≤560px | Yes | Full-width buttons, tighter padding |
| ≤420px | Yes | Budget section band wrap |

## Enhancement Opportunities

1. **Bottom tab bar** — native mobile navigation pattern instead of sidebar
2. **Pull-to-refresh** — for inbox and transaction lists
3. **Swipe actions** — swipe to classify/delete on inbox items
4. **Haptic feedback** — on button taps and interactions
5. **Native date picker** — replace custom date picker with native `<input type="date">`
6. **Face ID / biometric unlock** — app lock with platform biometrics
7. **Widget support** — iOS home screen widgets showing balances
