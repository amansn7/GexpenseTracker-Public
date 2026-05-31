# MoneyFlow Mobile Rendering Plan

## 1. Current State Assessment

### 1.1 App Architecture
- **Framework**: React 18 (window globals, no JSX transform bundler in dev)
- **Router**: State-based (`view` state in `app.jsx`), no react-router
- **Styling**: CSS custom properties + inline JS style objects (no CSS modules)
- **Build**: `node scripts/build-frontend.mjs` — Babel transpile per-file
- **Theme**: 4 themes (paper, cool, midnight, observatory) via `data-theme` attr
- **Viewport Hook**: `useViewport()` in `shell.jsx` — `isMobile < 720px`, `isTablet < 980px`

### 1.2 Views (14 + 3 aliases)
| View | Component | File | Mobile handling |
|------|-----------|------|-----------------|
| inbox | InboxView | inbox.jsx | Partial (rows, detail panel fullscreen) |
| search | SearchView | inbox.jsx | None (inline in inbox) |
| flow | FlowView | flow.jsx | Partial (sankey, breakdown) |
| dashboard | DashboardView | dashboard.jsx | Minimal (none) |
| health | HealthView | health.jsx | None |
| reports | ReportsView | reports.jsx | None |
| recurring | RecurringView | recurring.jsx | None |
| debt | DebtView | debt.jsx | None |
| goals | GoalsView | goals.jsx | None |
| budgets | BudgetsView | budgets.jsx | None |
| profile | ProfileView | account.jsx | Minimal (clamp padding) |
| settings | SettingsView | account.jsx | Minimal (clamp padding) |
| admin | AdminView | admin.jsx | None |
| today | → Dashboard | app.jsx | None |
| picture | → FlowView | app.jsx | None |
| review | → InboxView(filter=review) | app.jsx | Partial |

### 1.3 Navigation
- **Desktop**: Fixed sidebar (232px) + topbar + content area, CSS grid
- **Current Mobile**: Off-canvas sidebar (284px / 86vw), hamburger toggle in topbar
- **No bottom tab bar** — only hamburger menu on mobile

### 1.4 Current CSS Breakpoints
| Width | Trigger |
|-------|---------|
| <= 980px | `isTablet` in JS (layout becomes block) |
| <= 900px | CSS: sidebar off-canvas, stat-grid responsive |
| <= 720px | `isMobile` in JS, CSS: 2-col stat grid |
| <= 560px | Compact padding, smaller fonts, full-width buttons |
| <= 420px | Budget section band wraps |

### 1.5 Modals & Overlays
1. **CategoryPicker** — absolute positioned, centered modal (inbox-detail.jsx)
2. **BulkReclassModal** — full-screen wizard for batch recategorization (inbox.jsx)
3. **BulkManualModal** — manual category/amount/merchant assignment (inbox.jsx)
4. **KeyboardShortcuts** — centered modal with key bindings (inbox.jsx)
5. **KeyboardHint** — floating hint badge for review mode (inbox.jsx)
6. **ReviewComplete** — centered modal after review done (inbox.jsx)
7. **SeedDataModal** — import previous data prompt (app.jsx)
8. **SyncProgressOverlay** — sync progress panel (sync-progress.jsx)
9. **TxCard detail** — full-screen right panel on mobile (inbox-detail.jsx)
10. **DrillDown modal** — category drill in flow.jsx
11. **Setting modals** — category editor, AI service config, etc in account.jsx

### 1.6 Key Interactions
- **Inbox row click** → opens DetailPanel as side panel (full-screen on mobile)
- **Filter tabs** → inline filter chips in toolbar, scrollable
- **Date range** → dropdown preset + date inputs
- **Bulk select** → checkbox mode with action buttons
- **Sync** → topbar button with polling progress overlay
- **Search** → typeahead dropdown with keyboard shortcut Cmd+K
- **Inline edit** → amount, merchant, category click-to-edit
- **Reclassify** → preview modal then commit
- **Flag** → toggle star per transaction

---

## 2. Mobile Rendering Plan

### Phase 1: Navigation & Shell (Foundation)
**Target**: All screens gain a consistent mobile shell with bottom tab bar

#### 1.1 Bottom Tab Bar
- Replace off-canvas-only nav with bottom tab bar on `isMobile`
- **Primary tabs** (always visible): Inbox (badge), Flow, Dashboard, Settings (gear)
- **Secondary actions**: FAB or "more" tab for remaining views (Health, Reports, Recurring, Debt, Goals, Budgets, Admin)
- Tab bar height: 56px, safe-area-inset-bottom aware
- Badge for unread count on Inbox tab

#### 1.2 Topbar Adaptations
- Fixed topbar height: 48px on mobile (current mobile topbar already reduced to 62px via `minHeight: 62` at `shell.jsx:425` — further reduce to 48px)
- Collapse subtitle into single-line
- Search becomes icon-only → expands inline or opens search modal on tap
- Sync indicator: simple dot + time (no full label)
- Category filter: slide-down drawer (not inline dropdown)

#### 1.3 Sidebar → Slide-out Drawer
- Hamburger menu now shows full sidebar with all sections (Views, Filters, Categories, Appearance, Account) — unchanged behavior
- Bottom tab bar replaces the "always visible" primary nav
- Drawer accessible from any view via hamburger or profile avatar tap

#### 1.4 Safe Area Handling
- `env(safe-area-inset-bottom)` on tab bar
- `env(safe-area-inset-top)` on topbar
- Content areas respect these insets

#### 1.5 Gesture Support
- Swipe right from left edge → open sidebar drawer
- Swipe left on detail panel → close it
- Pull down on transaction list → refresh (sync trigger)

---

### Phase 2: Inbox View (Primary Screen)
**Target**: Fast, comfortable transaction browsing and editing on mobile

#### 2.1 Transaction List
- Single-column rows, compact layout
- **Desktop row**: [checkbox] [dot] [logo] [merchant | subject] [category] [confidence] [time] [amount]
- **Mobile row**: 4-column grid `[24px] [30px] [1fr] [auto]` — checkbox, logo, merchant+subject+chip, amount
- Amount occupies its own column (right-aligned). Subject/category chip/time sit below merchant in the third column.
- Infinite scroll (already implemented) with 100px threshold
- Row height: ~60-72px (vs ~40px desktop)
- Tap to select & open detail panel; long-press to enter multi-select mode

#### 2.2 Filter Tabs (Toolbar)
- Horizontal scrollable pill tabs (already partially done)
- Active tab highlighted, remaining filters scrollable
- Date preset as compact dropdown (not select element)
- Transaction count shown only when relevant

#### 2.3 Detail Panel (Full-Screen)
- Already uses `position: fixed, inset: 0` on `isMobile` — good foundation
- **Improvements**:
  - Slide-in animation from right (`slide-in-right` class already exists)
  - Swipe-to-dismiss gesture
  - Sticky footer with action buttons (always visible)
  - Amount: large font, tap to edit inline
  - Field labels stacked above values (not side-by-side)
  - Email excerpt: expandable with "Fetch full body" tap target
  - Notes textarea: full width, auto-grow
  - Close button: X in top-right, arrow-back for iOS feel optional

#### 2.4 Category Picker Modal
- Currently: absolute positioned, centered on desktop
- **Mobile**: Bottom sheet (slide up from bottom), 70% of viewport height
- Search/filter categories at top
- Grouped list scrollable
- Current selection highlighted
- Tap outside or drag down to dismiss

#### 2.5 Bulk Operations
- Multi-select mode already exists (checkbox-based, triggered via toolbar chip)
- **Current**: Fixed-position bottom bar (`inbox.jsx:1884-1895`) with Mark Read/Unread, Flag/Unflag, Delete, Detect Duplicates — already has `isMobile` positioning (bottom: 12px, width: calc(100vw - 24px), horizontal scroll)
- **Improvements**:
  - Add "Recategorize" button that opens BulkReclass or BulkManual
  - Move bar above the proposed tab bar (currently bottom: 12px will overlap tab bar)
  - Long-press entry into multi-select mode (currently checkbox-only)
- Dismiss: tap "Clear" or press Escape

#### 2.6 Review Tab (Pending Emails)
- **Desktop**: Split-pane grid (email list + detail panel)
- **Mobile**: Single-column list with expandable rows
  - Tap row → inline expands to show full details + Keep/Discard buttons
  - Swipe left on row → reveal Keep/Discard quick actions
  - Bulk select with top action bar (same pattern as bulk ops)
  - Group headers (by domain) collapsible
  - Session stats bar at top (compact)

#### 2.7 Duplicates Tab
- **Desktop**: Full-duplicate card with both TxCard side-by-side
- **Mobile**: Stacked layout (Primary card on top, Duplicate below)
  - "Keep this" buttons clearly tappable
  - Swipe to confirm/dismiss gesture
  - Compact confidence bar
  - Bulk checkbox + bottom action bar

---

### Phase 3: Dashboard View
**Target**: At-a-glance financial summary optimized for small screens

#### 3.1 Hero Section
- Stack vertically (not side-by-side grid)
- Large net amount with smaller delta badge
- Burn bar (income vs expense) full width
- Date range selector compact below

#### 3.2 KPI Cards Grid
- **Desktop**: 3-column grid
- **Mobile**: 2-column grid (or horizontal scrollable row)
- Each card: label + big number + mini sparkline or delta
- Tap card → expands with context line

#### 3.3 Section-based Layout
- Collapsible sections: Income, Expenses, Categories, Top Merchants, Budgets, Health
- Each section has dark header band + card body
- On mobile: reduced horizontal padding (16px vs 32px)
- Category grid: 2-across (vs auto-fill minmax(152px) on desktop)

#### 3.4 Mini Charts
- Spend trend line: full-width, responsive
- Weekly burn: 4 columns max, smaller bars
- Category donut: compact, legend below

---

### Phase 4: Flow View (Money Flow)
**Target**: Interactive Sankey diagram and breakdown on small screen

#### 4.1 KPI Row
- **Desktop**: 4-column grid (Income, Expenses, CC Payments, Net)
- **Mobile**: Horizontal scrollable row, snap-scroll
- Each KPI card compact (~140px wide)

#### 4.2 Sankey Diagram
- Already has mobile-specific rendering:
  - Smaller node width (10px vs 20px)
  - Lower curvature (0.2 vs 0.5)
  - Rotated labels (30° angle)
  - Transparent stroke for touch (24px wide)
  - touchstart/touchend events for tooltip
- **Improvements**:
  - Make SVG container max 300px height
  - Reduce node font size to 9px
  - Ensure tooltip stays within viewport bounds (already clamped)
  - Add pinch-to-zoom option (optional)

#### 4.3 Breakdown Section
- Stacked rows with compact layout
- Category name truncated to 10-12 chars on mobile (already done)
- Bar chart hidden on very small screens (< 400px)
- Transaction count as compact badge
- Section headers with reduced padding
- Bottom summary lines visible without scroll

#### 4.4 Weekly Burn Chart
- **Desktop**: 4 columns with decent padding (0 20px)
- **Mobile**: Reduced padding (0 6px), smaller font
- Bars at max 120px width on desktop → fill available space on mobile

#### 4.5 Category Drill Modal
- Full-screen on mobile (already in flow.jsx with close button)
- Transaction rows inside: compact merchant + amount
- Back button at top, close on swipe-down

---

### Phase 5: Secondary Views
**Target**: Consistent mobile layout for all remaining views

#### 5.1 Health View
- Cards stack vertically
- Score badge at top (large, centered)
- Expandable sections (already done with CSS grid animation)
- Compact metric rows

#### 5.2 Reports View
- Month selector: horizontal scrollable pill tabs
- Each report card: full-width, stacked
- Tables → horizontal scroll or key-value list layout
- Download/export: full-width button

#### 5.3 Recurring View
- List items: full-width cards
- Each card: merchant + amount + frequency + next date
- Swipe to edit/delete
- Add button: FAB or bottom sticky CTA
- Find from transactions: full-width button

#### 5.4 Debt View
- Debt cards: stack vertically, full-width
- Progress bar inside card
- Payoff timeline: compact
- Add/Edit: slide-up form

#### 5.5 Goals View
- Goal cards: stack vertically, full-width
- Each card: name + target amount + progress bar + contribution button
- Add goal: bottom CTA
- Contribution form: inline expandable or modal

#### 5.6 Budgets View
- Budget cards: stack vertically, full-width
- Each card: category name + spent/limit + progress bar
- Over-budget: red highlight (already in CSS)
- Links section: horizontal scrollable or stacked chips
- Add budget: full-width button
- LLM suggestions: expandable section
- Same pattern for LLM health, adaptive plan, goal optimize

---

### Phase 6: Profile & Settings
**Target**: Clean, navigable settings on mobile

#### 6.1 Profile View
- Already uses `clamp()` padding — good foundation
- Avatar + name at top, centered
- Info rows: stacked (label above value)
- Edit triggers: tap to edit inline or navigate to section

#### 6.2 Settings View
- Multi-section layout with collapsible section headers
- Each row: label + toggle/input on right
- Long rows: label stacked above control
- AI Services: card list with status badges
- Categories: horizontal scrollable color swatches or 3-across grid
- Filter rules: stacked cards
- Danger zone: full-width red buttons
- 2FA section: compact inline status

#### 6.3 Admin View (Developer)
- Test forms stack vertically
- Input fields full-width
- Buttons full-width
- Logs/results: scrollable pre block, smaller font
- Status sections: compact columns

#### 6.4 Onboarding View
- Already uses `clamp()` padding
- Form fields: full-width, stacked
- Buttons: full-width
- Welcome message: centered, compact

---

### Phase 7: Modals & Overlays
**Target**: All modals work well on mobile viewport

#### 7.1 Modal Positioning Strategy
| Modal | Desktop | Mobile |
|-------|---------|--------|
| CategoryPicker | Absolute centered (320px) | Bottom sheet (70% vh) |
| BulkReclass | Centered modal (480px) | Full-screen with close |
| BulkManual | Centered modal (380px) | Bottom sheet |
| KeyboardShortcuts | Centered (360px) | Bottom sheet |
| ReviewComplete | Centered (380px) | Bottom sheet |
| SeedDataModal | Centered (440px) | Full-screen with backdrop |
| DrillDown | Right panel / modal | Full-screen push |
| Category editor | Centered | Bottom sheet |

#### 7.2 Bottom Sheet Pattern
- Slide up from bottom
- Handle bar at top (visual drag indicator)
- Semi-transparent backdrop
- Dismiss: tap backdrop or drag down
- Content scrollable within
- Sticky action buttons at bottom

#### 7.3 Keyboard-Aware Modals
- Input-focused modals adjust for virtual keyboard
- `visualViewport` API for accurate height
- Avoid `position: fixed` + keyboard issues

---

### Phase 8: CSS & Responsive System
**Target**: Coherent responsive system across all views

#### 8.1 Breakpoint Alignment
Fix mismatch: JS `useViewport` and CSS must agree.

**Note**: The sidebar's off-canvas behavior is already driven by JS inline styles (`shell.jsx:108-109`), not the CSS `.sidebar` class. So the 900-980px gap mainly affects CSS-class-based elements like `.stat-grid`, `.container`, `.glass-header`.

| Variable | JS Breakpoint | CSS Match | Purpose |
|----------|--------------|-----------|---------|
| `isMobile` | < 720px | @media (max-width: 720px) | Compact mobile layout, single column |
| `isTablet` | < 980px | @media (max-width: 980px) | Bottom tab nav, layout collapse |

#### 8.2 Shared Mobile Style Constants
```js
const mobileStyles = {
  wrap: { padding: "16px 14px 72px", overflowY: "auto", height: "calc(100dvh - 48px - 56px)" },
  // 48px topbar + 56px tab bar = 104px offset
  card: { padding: "14px 16px" },
  container: { paddingLeft: 14, paddingRight: 14 },
  fullWidth: { width: "100%" },
  bottomPadding: { paddingBottom: 72 },
};
```

#### 8.3 Content Height Calculations
All views use `height: calc(100dvh - 72px)` for desktop (topbar height).
Mobile needs: `calc(100dvh - 48px - 56px)` = topbar (48px) + tab bar (56px) = `calc(100dvh - 104px)`

**⚠️ View-specific offsets:**
- **Inbox** currently uses `calc(100dvh - 115px)` on mobile (`inbox.jsx:714`) — this accounts for the current 62px topbar + ~53px of toolbar + sticky day-label headers. When migrating to the new 48px topbar + 56px tab bar, the inbox's toolbar will need similar compensation. Actual offset may be `calc(100dvh - 48px - 56px - 41px)` depending on toolbar height.

#### 8.4 Touch Targets
- Minimum touch target: 44x44px (WCAG 2.2)
- Buttons, chips, icons should meet this
- Inline edit triggers: minimum 32x32px
- Tab bar items: minimum 48x48px

#### 8.5 Safe Area CSS Variables
```css
:root {
  --sat: env(safe-area-inset-top, 0px);
  --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px);
  --sal: env(safe-area-inset-left, 0px);
}
```

#### 8.6 Theme Adaptations
- Dark themes work well on mobile OLED — no changes needed
- Ensure sufficient contrast in `paper` theme on mobile (brightness may be higher outdoors)
- Consider `prefers-color-scheme` auto-switch (future)

---

### Phase 9: Interactions & UX
**Target**: Mobile-native feel with gestures, transitions, haptic feedback

#### 9.1 Gesture Support
| Gesture | Action | Component |
|---------|--------|-----------|
| Swipe left on row | Reveal actions (Keep/Discard) | Review list |
| Swipe right on edge | Open sidebar | All views |
| Swipe down on panel | Close detail/modal | DetailPanel, modals |
| Pull-to-refresh | Trigger sync | Inbox list |
| Long press | Enter multi-select | Inbox list |
| Tap status bar | Scroll to top | Inbox list |

#### 9.2 Transition Animations
- Panel slides: `slideInRight` / `slideOutRight` (already exist)
- Bottom sheet: translateY from 100% to 0, easing `cubic-bezier(0.16, 1, 0.3, 1)`
- Tab switch: content cross-fade (already has `view-enter` class)
- Row enter: stagger animation (already has `anim-row-spring`)

#### 9.3 Loading States
- Skeleton rows on initial load (already implemented)
- Pull-to-refresh spinner at top
- Sync progress: compact bar below topbar (vs floating panel)
- Infinite scroll: spinner at bottom of list

#### 9.4 Error States
- Error banner: compact, below topbar
- Retry button: inline, full-width
- Offline indicator: subtle bar at top

#### 9.5 Empty States
- Centered icon + message (already implemented)
- Action button: full-width, below message
- Consistent design across all views

---

### Phase 10: Performance Considerations
**Target**: Smooth 60fps on mid-range mobile devices

#### 10.1 Rendering
- React.memo on list rows (already implemented for Row, TxCard, etc.)
- Virtualization not needed (page size = 50, infinite scroll)
- CSS `will-change: transform` on animated elements
- Avoid forced layouts during animations
- Use `transform` / `opacity` for animations (GPU composited)
- Debounced network saves: 400ms debounce implemented via `saveQueueRef` in `inbox.jsx:662-682` (setTimeout-based queue per transaction ID)

#### 10.2 Network
- Debounced saves (already implemented, 400ms)
- Search debounce (already implemented, 280ms)
- Optimistic updates (already implemented)
- Lazy load email body (already implemented)

#### 10.3 Bundle Size
- Single-file bundle per component (no code splitting currently)
- For mobile: consider lazy loading secondary views (health, reports, debt, goals, admin)
- Currently all scripts loaded eagerly in index.html — no impact on mobile since all needed on first paint

---

## 3. Implementation Order

### Wave 1: Foundation (files: shell.jsx, app.jsx, styles.css)
- Add bottom tab bar component
- Adjust topbar height for mobile (48px)
- Add safe-area CSS variables
- Fix 980px/900px breakpoint mismatch
- Add `mobileStyles` shared constants

### Wave 2: Inbox (files: inbox.jsx, inbox-detail.jsx, inbox-panels.jsx, inbox-styles.jsx, inbox-common.jsx)
- Mobile transaction list refinements
- DetailPanel gesture + swipe-to-dismiss
- CategoryPicker → bottom sheet
- Review tab mobile layout (single-column + swipe)
- Duplicates mobile layout (stacked cards)
- Bulk operations bottom action bar

### Wave 3: Dashboard + Flow (files: dashboard.jsx, flow.jsx)
- Dashboard: stack hero, 2-col KPIs, collapsible sections
- Flow: KPI scroll row, sankey height reduction, compact breakdown
- Weekly burn: mobile spacing

### Wave 4: Secondary Views (files: health.jsx, reports.jsx, recurring.jsx, debt.jsx, goals.jsx, budgets.jsx)
- Consistent card stacking
- Full-width controls
- Compact labels and values
- Touch-friendly action targets

### Wave 5: Settings & Admin (files: account.jsx, admin.jsx)
- Setting rows stack on mobile
- Full-width inputs and buttons
- Compact AI service cards
- Category grid mobile layout

### Wave 6: Modals (files: inbox.jsx, flow.jsx, app.jsx)
- Convert appropriate modals to bottom sheets
- Keyboard-aware positioning
- Consistent dismiss patterns

### Wave 7: Gestures & Polish (cross-cutting)
- Swipe gesture support
- Pull-to-refresh
- Touch target audit
- Animation refinements
- Safe area testing
