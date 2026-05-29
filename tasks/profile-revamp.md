# Profile Page Revamp

## Current State Report

### What Works (LIVE)
| Section | Status |
|---|---|
| Profile form (full_name, display_name, phone, location, timezone, currency) | LIVE — saves via `PATCH /api/account/profile` |
| Financial settings (starting_balance, starting_balance_date) | LIVE — anchors health/runway calculations |
| Member-since display | LIVE — from `user.created_at` |
| Role badge | LIVE — from `user.role` |
| Name / email / location subtitle | LIVE — real data |

### What's Broken or Static (TO FIX)
| Section | Status | Problem |
|---|---|---|
| Stats row — "Emails parsed" | BROKEN | Uses `transactions.length` (paginated inbox state, not all-time). Sub-label "April 2026" is **hardcoded string**. |
| Stats row — "Income tracked" | BROKEN | `transactions.filter(t=>t.amount>0)` over filtered inbox. Hardcoded sub-label "2 sources". Income uses raw amount sign — inconsistent with MoneyFlow which uses `t.label === "income"`. Hardcoded `₹`. |
| Stats row — "Expenses tracked" | BROKEN | Same: inbox-scoped, hardcoded `₹`, inconsistent with MoneyFlow. |
| Avatar image | MISSING | `avatar_url` exists in DB and API response. UI renders initials-only circle, never an `<img>`. |
| "Change photo" button | MISSING | Renders but has no `onClick`. Dead. |
| Plan & billing section | STATIC | Hardcoded "Moneyflow Pro · ₹499/month". "Manage plan" button has no handler. |
| Save error feedback | MISSING | `save()` swallows errors silently in `finally` block. User gets no feedback on failure. |
| Currency symbol | HARDCODED | Stats row always shows `₹`, ignores `profile.default_currency`. |

---

## Data Consistency Stance

Profile stats must use the same backend data path as MoneyFlow — no client-side inbox filtering.

| Profile KPI | Endpoint | Params | Notes |
|---|---|---|---|
| Current balance | `GET /api/stats/health?months=6` | — | Shows `current_balance` |
| Savings rate | same | — | `savings_rate` — 6-month window, labeled clearly |
| Runway | same | — | `runway_months` |
| This month income | `GET /api/stats/summary?period=1m` | — | `total_income` — matches MoneyFlow "1m" |
| This month expenses | same | — | `total_expenses` — matches MoneyFlow "1m" |
| Top spending category | `GET /api/stats/category-breakdown?period=1m` | — | `categories[0].name + amount` |
| Classifier accuracy | `GET /api/stats/confidence` | — | `auto_confirmed/total` as %, `correction_rate` |

Date window decision: **3 KPIs are health-window (6-month balance/savings/runway), 2 KPIs are "this month" (income/expense), labeled clearly.** MoneyFlow will match when set to 1m filter.

---

## Out of Scope This Pass
- Backend: add `user.created_at` + `connected_accounts[]` to `/api/account/me` (currently used via `user.created_at` which IS returned — audit was wrong; `connected_accounts` remains deferred)
- File-upload avatar endpoint (wire "Change photo" only if upload endpoint exists, else hide button)
- Full timezone picker (keep existing 4-option select)

---

## Implementation Checklist

### Phase 1 — Backend (auth.py)
- [ ] Verify `user.created_at` is in `/api/account/me` response (audit suggests it might be missing)
- [ ] Add `connected_accounts: [{provider, account_email, status, last_synced_at}]` to me response

### Phase 2 — ProfileView rewrite (account.jsx)
- [ ] Add 3 parallel fetches on mount: `health?months=6`, `summary?period=1m`, `category-breakdown?period=1m`, `confidence`
- [ ] Replace broken stats row with 4-column KPI grid:
  - Current balance (from health)
  - Savings rate 6mo (from health)  
  - Runway in months (from health)
  - This month: income vs expense delta (from summary)
- [ ] Add second row (2 cols):
  - Top category this month (from category-breakdown)
  - Classifier accuracy (from confidence)
- [ ] Fix avatar: `<img src={profile.avatar_url}>` with initials fallback
- [ ] Hide "Change photo" button (no upload endpoint exists)
- [ ] Remove "April 2026", "2 sources" hardcoded strings
- [ ] Fix currency: use `profile.default_currency || "INR"` with `fmtK` formatter
- [ ] Plan & billing: show trial info if `user.trial_ends_at` present, else remove section
- [ ] Add `setError` state + error banner to profile save
- [ ] Keep profile form and financial settings exactly as-is (working)
- [ ] Add loading skeleton while stats fetch resolves

### Phase 3 — Build + Verify
- [ ] `npm run build` — clean
- [ ] Manual verify: profile KPIs match MoneyFlow 1m numbers for income/expenses
