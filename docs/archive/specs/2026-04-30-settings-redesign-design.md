# Settings Page Redesign — Design Spec

**Date:** 2026-04-30  
**Status:** Approved

---

## Overview

Full redesign of `SettingsView` in `static/src/account.jsx`. Current: single long-scroll with 9 sections, stubs, and hardcoded data. Target: sidebar nav (desktop) / horizontal pill nav (mobile), 4 logical sections, real data only, functional 2FA + password change.

---

## Layout

### Desktop
- 180px fixed left sidebar with "SETTINGS" label and 4 nav items
- Active item: left border accent (`#1a1814`), filled icon, heavier weight
- Divider line separates Inbox/AI/Preferences from Account (visually signals "security zone")
- Content area: right of sidebar, scrolls independently
- Section heading: Fraunces serif 18px + italic subtitle

### Mobile (`isMobile` from `useViewport()`)
- Sidebar hidden; horizontal pill strip at top instead (scrollable, `overflow-x: auto`, `scrollbar-width: none`)
- Active pill: dark fill (`#1a1814` bg, `#fbf9f3` text)
- Content below strip, full width, reduced horizontal padding

### Nav items (4 total)
```
📥 Inbox       — email source config
✦  AI          — parsing toggles + API services
⚙  Preferences — notifications, categories, financial health
🔒 Account     — 2FA, password, export, danger zone
```

---

## Section: Inbox

**Card 1 — Gmail connection**

Data sourced from `connectedAccounts.find(a => a.provider === "gmail")`.

- Gmail icon + "Gmail" label + status badge (`● Connected` / `● Not connected`)
- When connected: `Last synced Xm ago · next in Ym · every Zh` (from `syncMeta()`) + email address (monospace, from `gmailAccount.email`)
- Buttons: **Re-sync** (calls existing onRescan), **Reconnect** (redirect to `/api/auth/gmail`)
- When not connected: single **Connect Gmail** button

**Card 2 — Messages to scan**

Segmented pill control: `All` / `Unread` / `Read`. Calls existing `updateEmailFilter()`. Current value from `syncStatus.email_filter`.

No sync interval slider (interval is backend-controlled, shown read-only in card 1 meta line).

---

## Section: AI

**Card 1 — Parsing**

Four rows, each with toggle or slider:

| Setting | Control | Key |
|---|---|---|
| Auto-categorize | Toggle | `auto_categorize` |
| Show AI confidence | Toggle | `show_confidence` |
| Low-confidence alerts | Toggle | `low_confidence_alerts` |
| Use rule engine pre-filter | Toggle | `use_rule_engine` |
| Confidence threshold | Slider 0–100 | `confidence_threshold` |

All via existing `updateSetting(key, value)` → `PATCH /api/account/settings`.

**Card 2 — Your API services**

List of existing services from `aiServices`. Each row:
- Provider avatar (2-letter initials), name, **Active** badge (if default), **On/Off** badge (if enabled)
- Monospace meta: `model_id · base_url (truncated) · key sk-…last4`
- Edit / Delete buttons (existing handlers)

Below the list:
- **+ Add service** button (opens inline form, same as existing but triggered by button not always-visible form)
- Monthly budget select (existing `budgetValue` state, `PATCH /api/account/settings` with `monthly_ai_budget`)

Inline add/edit form appears below the list (not a modal). Same fields as current: provider preset select, display name, model ID, base URL, API key, enabled toggle. Add a **Validate** button that calls `POST /api/account/ai-services/validate` (already implemented in `settings.py`).

---

## Section: Preferences

**Card 1 — Notifications**

| Setting | Control | Key |
|---|---|---|
| Daily digest | Toggle | `daily_digest` |
| Digest hour | Time input (0–23) | `digest_hour` |
| Sound effects | Toggle | `sound_effects` |

`digest_hour` is already in `SettingsPatch` model — wire the input (currently shows hardcoded "9:00 IST"). All via `updateSetting()`.

**Card 2 — Categories**

Read-only list of current categories from `account.categories`. Each row: category name + color chip. **Manage categories** button opens existing `EditCategoriesModal` (already in account.jsx).

**Card 3 — Financial health**

Two inputs:
- Starting balance (number input, `starting_balance` key)
- Starting balance date (date input, `starting_balance_date` key, must not be future)

Both via `updateSetting()`. No currency selector (not in SettingsPatch).

---

## Section: Account

**Card 1 — Two-factor authentication**

State machine: `totp_status` ∈ `{ idle, setup, verifying, enabled }`.

- **Idle (2FA off):** Row shows "TOTP authenticator" label + **Off** badge + **Enable…** button
- **Setup (after Enable… click):** Inline 3-step panel:
  1. QR code image (`<img>` from `POST /api/account/2fa/setup` response `qr_url`)
  2. Manual key (monospace, grouped 4-chars, from response `secret`)
  3. 6-digit input + **Verify & enable** button → `POST /api/account/2fa/verify`
  Cancel button collapses back to idle.
- **Enabled:** Row shows **On** badge + **Disable** button → `DELETE /api/account/2fa`

**Card 2 — Password**

Single row: "Change password" + **Change…** button. Click expands inline form:
- Current password input
- New password input  
- Confirm new password input
- **Save** → `POST /api/account/change-password`
- Cancel collapses

**Card 3 — Data**

| Row | Action | Endpoint |
|---|---|---|
| Export transactions | **Export CSV** button | `GET /api/transactions/export` (new) |
| Allowed sign-ins | **Manage…** button | opens existing `EditAccessModal` |

**Card 4 — Danger zone** (red border `#f1d9d2`)

| Row | Action |
|---|---|
| Disconnect Gmail | **Revoke** → `DELETE /api/account/connected-accounts/gmail` (new) |
| Delete account | **Delete…** → existing confirm modal |

---

## New Backend Endpoints

### `POST /api/account/2fa/setup`
Returns `{ secret: str, qr_url: str }`. Generates TOTP secret, stores temporarily in session or user row (`totp_secret_pending`). Does not enable 2FA yet.

### `POST /api/account/2fa/verify`
Body: `{ code: str }`. Verifies 6-digit TOTP code against `totp_secret_pending`. On success: copies secret to `totp_secret`, sets `totp_enabled = True`, clears pending. Returns `{ ok: bool }`.

### `DELETE /api/account/2fa`
Body: `{ password: str }`. Verifies current password before disabling. Clears `totp_secret`, sets `totp_enabled = False`.

### `POST /api/account/change-password`
Body: `{ current_password: str, new_password: str }`. Verifies bcrypt hash of current, updates hash. Returns `{ ok: bool }` or 400 with error.

### `DELETE /api/account/connected-accounts/gmail`
Revokes OAuth token, deletes `ConnectedAccount` row. Returns `{ ok: bool }`.

### `GET /api/transactions/export`
Streams CSV of all user transactions. Headers: `Content-Disposition: attachment; filename=transactions.csv`.

---

## Data model changes

`SettingsPatch` has `two_factor_enabled: bool` — this is the old stub field. It is NOT used in the new flow; leave it in the model to avoid a migration but stop reading/writing it from the frontend. The new TOTP state lives in dedicated columns.

Add to `User` model:
- `totp_secret: str | None` (nullable, encrypted at rest)
- `totp_secret_pending: str | None` (nullable, temp during setup)
- `totp_enabled: bool` (default False)

Add Alembic migration for these columns.

---

## What's removed / fixed

- All hardcoded strings: `"42 days ago"`, `"9:00 IST"`, static placeholder values → replaced with real data or omitted
- Stale "Connection Testing Not Wired" comment in SettingsView
- 9-section flat scroll → 4-section sidebar nav
- Always-visible AI service form → triggered by "+ Add service" button
- Security section with non-functional stub buttons → real 2FA + password flows

---

## Implementation scope

**Frontend (`static/src/account.jsx`):** ~70% rewrite of `SettingsView`. No new files — keep all in `account.jsx`. Existing state, helpers (`updateSetting`, `syncMeta`, `updateEmailFilter`, AI service CRUD handlers), and modals are reused.

**Backend (`app/api/settings.py` + `app/api/account.py`):** 6 new endpoints, 3 new User columns + migration.

**Not in scope:** Push notifications, Slack/webhook integrations, billing, multi-user workspaces.
