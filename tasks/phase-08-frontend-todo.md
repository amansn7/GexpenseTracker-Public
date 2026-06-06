# [Frontend] Phase 8 Todo: UX & Interaction Polish

**Source:** `tasks/phase-08-frontend.md`
**Progress:** 0/13 items

---

## Frontend

### H6 — View Caching

- [ ] Implement DOM caching for last 3 views (display: none instead of unmount)
- [ ] Or implement API response caching with 30s TTL

### H7 — Chart Loading Skeletons

- [ ] Add skeleton to dashboard line chart
- [ ] Add skeleton to health bar chart
- [ ] Add skeleton to reports bar chart
- [ ] Add skeleton to flow Sankey area

### H9 — Standardize Error Handling

- [ ] Create `useAsync` hook (loading, data, error, retry)
- [ ] Migrate health.jsx to useAsync (remove silent catch)
- [ ] Migrate dashboard.jsx to useAsync
- [ ] Migrate reports.jsx (remove `window.location.reload()`)
- [ ] Migrate remaining views to useAsync

### M1 — Browser Back Button Support

- [ ] Create `useHistory()` hook
- [ ] Push state on view change
- [ ] Popstate listener restores view

### M6 — Consolidate Formatters

- [ ] Create `static/src/utils/format.js`
- [ ] Replace `fmt` in account.jsx
- [ ] Replace `fmtK`/`fmtKShort` in flow.jsx
- [ ] Replace `fmtMoneyB` in budgets.jsx
- [ ] Replace `fmtMoney` in goals.jsx
- [ ] Replace `fmtAmt` in reports.jsx

### M7 — Extract Passkey/TOTP Hooks

- [ ] Create `hooks/usePasskey.js`
- [ ] Create `hooks/useTOTP.js`
- [ ] Migrate onboarding.jsx and account.jsx to use shared hooks

### M9 — Native Date Picker

- [ ] Replace text inputs with `<input type="date">`
- [ ] Wire up OS-native date change handler

### M11 — Sankey Mobile Default

- [ ] Default mobile to category list view
- [ ] Add "View Sankey" toggle button

## Verification

- [ ] View switches show no loading flash (instant cache)
- [ ] Chart areas have skeleton outlines
- [ ] Browser back button navigates views
- [ ] No silent error catches or hard-reload retries
- [ ] All views use single `formatMoney()`
- [ ] Passkey works from both onboarding and settings
- [ ] Date picker shows OS-native calendar on mobile
- [ ] Sankey defaults to list on mobile
