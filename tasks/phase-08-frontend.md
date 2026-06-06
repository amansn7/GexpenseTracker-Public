# Phase 8: UX & Interaction Polish

**Source:** design-audit.md §11.2 (H6, H7, H9), §11.3 (M1, M6, M7, M9, M11)
**Effort:** ~4-5 days
**Dependencies:** Phase 4 (state architecture), Phase 5 (shared components)

## Overview

User experience issues that don't block production but significantly impact daily use: no view caching, inconsistent error states, missing loading skeletons, no back button support, and duplicated utility functions.

## Items

### H6 — View Caching (1 day)

Stops views from re-fetching data on every switch.

**Option A: DOM caching (recommended)**
- Change view rendering from `{view === "inbox" && <InboxView />}` to `{hiddenViews[view] || visibleView}`
- Keep up to 3 recently-viewed components in DOM with `display: "none"` (CSS, not conditional render)
- On view switch: hide old, show cached if available, render new if not cached

**Option B: API response caching**
- Wrap `API.get()` with a timestamp-based cache (TTL: 30 seconds)
- On view switch: if cache is fresh, use it; if stale, fetch in background and swap

### H7 — Chart Loading Skeletons (0.5 day)

Replace spinner-based loading with skeleton outlines matching chart dimensions.

- **Dashboard line chart**: pulsing rect at chart area dimensions
- **Health bar chart**: 12 pulsing vertical rects at bar positions
- **Reports bar chart**: same pattern
- **Flow Sankey**: skeleton grid matching node layout

Use the shared `Skeleton` component from Phase 5.

### H9 — Standardize Error Handling (1 day)

Create a `useAsync` hook:

```js
function useAsync(asyncFn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  // handles: loading → mounted check → data/error
  // returns: { loading, data, error, retry }
}
```

Migrate all views:
- Replace ad-hoc `useState(loading)` + `useEffect(fetch)` + `.catch()` patterns
- Remove empty `.catch(() => {})` (health.jsx, dashboard.jsx)
- Remove `window.location.reload()` retry (reports.jsx — use `retry()` from hook instead)
- Standardize error UI: red banner with message + retry button + dismiss

### M1 — Browser Back Button Support (1 day)

- Install or write a simple `useHistory()` hook
- On `setView()`: push state to `history.pushState({ view }, "", "#" + view)`
- On `popstate` event: read the view and call `setView()`
- Handle hash-based URLs for direct linking: `/#/inbox`, `/#/flow`

### M6 — Consolidate Formatters (0.5 day)

Create `static/src/utils/format.js`:

```js
export const formatMoney = (amount, currency = "INR") => { ... }
export const formatPercent = (value) => `${(value * 100).toFixed(1)}%`
export const formatShortNumber = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n)
```

Replace all inline formatters:
- `fmt` in account.jsx
- `fmtK` / `fmtKShort` in flow.jsx
- `fmtMoneyB` in budgets.jsx
- `fmtMoney` in goals.jsx
- `fmtAmt` in reports.jsx

### M7 — Extract Passkey/TOTP Hooks (0.5 day)

Create `static/src/hooks/usePasskey.js` and `hooks/useTOTP.js`:

- Extract WebAuthn registration logic from onboarding.jsx and account.jsx
- Extract TOTP verification logic from onboarding.jsx and account.jsx
- Both views import from shared hooks

### M9 — Native Date Picker (0.5 day)

Replace the custom date range text inputs:
- For "from" and "to" inputs: use `<input type="date">` (shows OS-native calendar picker)
- Convert `YYYY-MM-DD` format to the app's date format internally
- Keep the preset buttons (All, 7d, 30d, 90d, 1y) as quick options

### M11 — Sankey Mobile Default (0.5 day)

- Change the mobile render path to default to the category list breakdown instead of the scaled-down SVG
- Only show the Sankey on mobile when the user explicitly taps a "View Sankey" toggle
- Keeps the SVG accessible but doesn't force users into a cramped interaction

## Verification

- [ ] Switching between inbox → flow → dashboard and back shows cached state (no loading flash)
- [ ] All chart areas show skeleton outlines during load
- [ ] Browser back button navigates between views
- [ ] Error states show retry button + message (never silent or hard-reload)
- [ ] All views use the same `formatMoney()` function
- [ ] Passkey setup works from both onboarding and settings
- [ ] Date picker shows OS-native calendar on mobile
- [ ] Sankey on mobile defaults to list view
