# User Auth & Onboarding — Design Spec
*MoneyFlow · 2026-04-25*

## Overview

Add real authentication and per-user data isolation to MoneyFlow. A single Google OAuth flow handles both identity and Gmail access. Sessions are cookie-based. Data is scoped per user. A seed-user migration preserves existing data safely.

---

## 1. Auth Flow

### Login
1. Unauthenticated user hits any route → redirect to `/login`
2. `/login` renders a minimal page: app name + "Sign in with Google" button
3. Button → `GET /api/auth/google` → redirects to Google consent screen
4. Google scopes requested (combined, single consent):
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/gmail.readonly`
5. Google redirects to `GET /api/auth/callback?code=...`
6. Backend:
   - Exchanges code for tokens (access + refresh)
   - Fetches user info from Google (email, name, picture)
   - Checks allowlist (see §4)
   - Creates or updates `User` + `UserProfile` rows
   - Creates a `Session` row (32-byte random token, expires 30 days)
   - `Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/`
   - Redirects to `/`

### Per-Request Auth
- `get_current_user` FastAPI dependency: reads `session` cookie → queries `sessions` table → returns `User`
- No valid session → `401 Unauthorized` → frontend redirects to `/login`
- Session expiry checked server-side; expired sessions deleted on access

### Logout
- `POST /api/auth/logout`
- Deletes session row from DB
- Clears cookie (`Set-Cookie: session=; Max-Age=0`)
- Returns `{"ok": true}`
- Frontend redirects to `/login`

---

## 2. Session Table

New table `sessions`:

```sql
CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      BYTEA NOT NULL UNIQUE,   -- 32 random bytes, indexed
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL       -- created_at + 30 days
);
CREATE INDEX idx_sessions_token ON sessions(token);
```

No in-memory session store — all state in DB, works across restarts.

---

## 3. Data Isolation

### Migration (Alembic)

New migration `0014_user_scoped_emails`:

1. Create `service_user` row: `email=service@localhost`, `role=service`
2. Add `emails.user_id` column (nullable FK → `users.id`)
3. Backfill: `UPDATE emails SET user_id = <service_user_id>`
4. Set NOT NULL constraint
5. Create `sessions` table

### API Scoping

All endpoints that touch `Email` / `Transaction` filter by `current_user.id`:

```python
.where(Email.user_id == current_user.id)
```

Transactions are accessed via `email_id` join — `Email.user_id` filter isolates them transitively. No `user_id` needed on `transactions` table.

### Gmail Sync Scoping

Sync job reads Gmail tokens from `connected_accounts` for the authenticated user. Every `Email` row created during sync gets `user_id = current_user.id`.

---

## 4. Allowlist

### Storage

Stored in owner's `UserSettings.settings` JSON:

```json
{ "allowed_emails": ["owner@gmail.com", "partner@gmail.com"] }
```

### Logic

```
No users in DB yet:
  → First login → create User(role="owner")
  → Auto-add their email to allowed_emails

Users exist:
  → Login attempt → check allowed_emails list (owner's settings)
  → Not found → return 403 with { "error": "access_denied" }
  → Found → proceed (create User row if first time for that email)
```

Owner's email is always implicitly allowed — cannot be removed via settings UI (frontend prevents it; backend validates).

---

## 5. First-Login Data Import

After first real user login, backend checks if seed user emails exist:

```python
seed_count = await db.scalar(
  select(func.count()).where(Email.user_id == seed_user.id)
)
```

If `seed_count > 0`, `GET /api/auth/me` response includes `"has_seed_data": true`.

Frontend: if `has_seed_data`, show one-time modal:

```
"We found existing transaction data from a previous setup.
 Import it into your account?"
[Import my data]  [Start fresh]
```

- **Import**: `POST /api/auth/claim-seed-data` → `UPDATE emails SET user_id = <real_id> WHERE user_id = <seed_id>`
- **Skip**: dismisses modal, seed data stays orphaned (can be claimed later from Settings)

---

## 6. Frontend Changes

### `/login` Page
- Served by FastAPI at `GET /login` (new Jinja template `login.html`)
- Minimal design: MoneyFlow wordmark, tagline, Google sign-in button
- No React — plain HTML to avoid chicken-and-egg JS loading
- Button links to `/api/auth/google`

### App Bootstrap
- `App` component: replace `needsOnboarding` check with `GET /api/auth/me`
  - `200` → user object → render app
  - `401` → `window.location = "/login"`
- Remove `OnboardingView` (replaced by Google OAuth flow)

### Sidebar
- Replace hardcoded "Ananya K." / "ananya@acme.in" with real user data from `account` state
- Show profile photo (Google picture URL) as avatar
- Logout button at bottom of sidebar

### Settings Page
- New "Access" section (visible to owner only):
  - List of allowed emails
  - Add email input + button
  - Remove button per email (owner's own email grayed out / disabled)

---

## 7. New API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/google` | Redirect to Google OAuth consent |
| GET | `/api/auth/callback` | OAuth callback, creates session, sets cookie |
| POST | `/api/auth/logout` | Deletes session, clears cookie |
| GET | `/api/auth/me` | Returns current user (or 401) |
| POST | `/api/auth/claim-seed-data` | Transfers seed emails to current user |

Existing `GET /api/auth/gmail` (Gmail-only OAuth) is replaced by the combined flow above.

---

## 8. Modified Endpoints

All existing API endpoints gain `current_user: User = Depends(get_current_user)` and filter by `user_id`. Key ones:

- `GET /api/transactions` → `.where(Email.user_id == current_user.id)`
- `GET /api/search` → same filter
- `POST /api/sync/trigger` → syncs Gmail for `current_user` only
- `GET /api/account/me` → returns `current_user`'s profile
- `PATCH /api/account/settings` → updates `current_user`'s settings

---

## 9. Security Notes

- Cookie: `HttpOnly; Secure; SameSite=Strict` — no JS access, no CSRF
- Token: 32 bytes via `secrets.token_bytes(32)` — 256-bit entropy
- Session expiry: 30 days, server-enforced
- Google tokens (access + refresh) stored in `connected_accounts`, not in session cookie
- 403 on allowlist rejection (not 404 — honest about existence, but no data leaked)
- Owner email deletion from allowlist blocked at both API and UI level

---

## 10. Out of Scope

- Multi-account (multiple Gmail inboxes per user)
- Email/password auth
- "Remember me" / short-session toggle
- Admin panel for managing users
- Invite flow (allowlist is manual email entry)
