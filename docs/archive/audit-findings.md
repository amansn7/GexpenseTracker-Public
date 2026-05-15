# UI/UX Audit Prompt

## Context

This is an audit of the GexpenseTracker project (Expense Tracker web app). The audit scanned HTML templates and JSX components for visual inconsistencies, accessibility issues, and broken layouts.

## Files Audited

### HTML Templates
- `/Users/amansaini/GexpenseTracker/templates/base.html` (layout shell, sidebar, navigation)
- `/Users/amansaini/GexpenseTracker/templates/settings.html`
- `/Users/amansaini/GexpenseTracker/templates/transactions.html`
- `/Users/amansaini/GexpenseTracker/templates/dashboard.html`
- `/Users/amansaini/GexpenseTracker/templates/login.html`
- `/Users/amansaini/GexpenseTracker/templates/review.html`
- `/Users/amansaini/GexpenseTracker/templates/recurring.html`
- `/Users/amansaini/GexpenseTracker/templates/budgets.html`
- `/Users/amansaini/GexpenseTracker/templates/emails.html`

### JSX Components (React)
- `/Users/amansaini/GexpenseTracker/static/src/account.jsx` (Profile & Settings views)
- `/Users/amansaini/GexpenseTracker/static/src/dashboard.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/transactions.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/onboarding.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/shell.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/reports.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/recurring.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/inbox.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/health.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/flow.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/icons.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/debt.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/data.jsx`
- `/Users/amansaini/GexpenseTracker/static/src/admin.jsx`

### CSS
- `/Users/amansaini/GexpenseTracker/static/styles.css`

## Findings

### P0 — Critical Accessibility Issues

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | Toggle lacking `aria-label` / `aria-pressed` | `account.jsx:24` | **FIXED** — Added `aria-pressed` and `aria-label` |
| 2 | Missing `type="button"` on filter buttons | `settings.html:25-27` | **FIXED** — Added `type="button"` |
| 3 | No focus styles on interactive elements | `styles.css` | **FIXED** — Added `:focus-visible` rule |
| 4 | Filter buttons `onclick` without `type="button"` | `transactions.html:7-36` | **N/A** — Lines 7-36 are `<select>` + `<input type="date">`, no buttons exist |

### P1 — Visual Inconsistencies

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | Hardcoded hex colors mixed with CSS vars | `account.jsx` | Not fixed |
| 2 | Button styles differ between templates/views | Multiple | Not fixed |
| 3 | Hero font-size not responsive | `dashboard.jsx:7` | **Already handled** — `isMobile ? { fontSize: 44 } : {}` at line 120 |

### P2 — Layout Issues

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | No mobile responsive breakpoints in CSS | `styles.css` | **Already handled** — breakpoints at `@media (max-width: 900px)` and `560px` |
| 2 | Fixed sidebar (200px) breaks on narrow screens | `styles.css:57` | **Already handled** — 900px breakpoint adds hamburger toggle + `translateX` slide-out |

## Quick Wins Applied

### Fix 1: Toggle Accessibility (`account.jsx`)
**Before:**
```jsx
const Toggle = ({ on, onChange }) => (
  <button type="button" onClick={()=>onChange(!on)} ...>
    <span .../>
  </button>
);
```

**After:**
```jsx
const Toggle = ({ on, onChange, label }) => (
  <button type="button" aria-pressed={on} aria-label={label || (on ? "Disable" : "Enable")} onClick={()=>onChange(!on)} ...>
    <span .../>
  </button>
);
```

### Fix 2: Focus Styles (`styles.css`)
**Added:**
```css
*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

### Fix 3: Filter Buttons (`settings.html`)
**Before:**
```html
<button class="filter-btn" id="filter-all" onclick="setFilter('all')">All emails</button>
```

**After:**
```html
<button type="button" class="filter-btn" id="filter-all" onclick="setFilter('all')">All emails</button>
```

## Additional Recommendations (Not Implemented)

1. **Mobile responsive sidebar** — Add `@media (max-width: 640px)` to make sidebar collapse to hamburger menu
2. **Consolidate color tokens** — Replace hardcoded hex in `account.jsx` with CSS vars like `var(--pos)`, `var(--neg)`
3. **Hero font-size responsive** — Use `clamp()` for `heroAmount` to scale between mobile/desktop
4. **Add skip-to-content link** — For keyboard users to bypass sidebar
5. **Add `role="navigation"` to nav elements** — Improve screen reader support