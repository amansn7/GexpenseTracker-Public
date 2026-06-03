# Invite System — Implementation Spec

## Overview

Replace the raw email allowlist with a formal invitation workflow. Each user gets
their own isolated data. New OAuth users see the 5-step onboarding wizard with
pre-filled Google data, a FreeLLMAPI trial banner, and a link to self-host
FreeLLMAPI.

---

## Data Model

### New `invitations` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `email` | VARCHAR(255) | Indexed |
| `invited_by` | FK → users.id | CASCADE on delete |
| `status` | VARCHAR(20) | `pending` → `accepted` \| `revoked` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## Backend

### `app/models/user.py` — add Invitation model (~15 lines)

```python
class Invitation(Base):
    __tablename__ = "invitations"
    id: Mapped[str] = _uuid_col()
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    invited_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False, server_default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
```

### `app/api/auth.py` — three changes

**1. `_get_or_create_user()`** — replace allowlist with invitations:

```
109-114  Before:  check allowed_emails JSON blob
         After:   check invitations table WHERE email=? AND status=pending
                  → 403 if none found
                  → set invite.status="accepted" on match

120      Before:  onboarding_complete=True
         After:   onboarding_complete=False
```

**2. `GET /api/auth/invitations`** — list invites + members (owner only)

Returns:
```json
{
  "invitations": [
    { "id": "...", "email": "a@b.com", "status": "pending", "created_at": "..." }
  ],
  "members": [
    { "id": "...", "email": "c@d.com", "name": "..." }
  ]
}
```

**3. `POST /api/auth/invitations`** — create invite (owner only)

Body: `{ "email": "friend@email.com" }`

Validation: valid email, not already pending → create invitation row.

**4. `DELETE /api/auth/invitations/{id}`** — revoke invite (owner only)

Sets status = `revoked`. Only works on pending invites.

### `app/models/__init__.py` — add 1 export line

---

## Frontend — Onboarding Wizard

### `app.jsx` entry point

Pass `/api/auth/me` data to `OnboardingWizard` so it can pre-fill fields:

```jsx
Root = () => React.createElement(OnboardingWizard, { accountData: data });
```

### Step 1 — Profile (pre-filled from Google)

| Field | Source |
|---|---|
| `full_name` | `accountData.name` |
| `email` | `accountData.email` (disabled input) |
| `display_name` | empty |
| `default_currency` | INR (default) |
| `timezone` | Asia/Kolkata (default) |

Form submits to `POST /api/account/onboarding`. If user already exists (409)
show "already set up" banner → skip to step 3.

### Step 2 — Connect Gmail (smart skip for OAuth users)

Check `accountData.connected_accounts` for a Gmail provider with
`status: "connected"`.

If connected → show green success banner + a simple "Continue →" button.
No redirect needed — Gmail is already set up by the OAuth callback.

If not connected → show existing Google OAuth button (non-OAuth path).

### Step 3 — AI Setup (trial banner + BYOK + FreeLLMAPI link)

Three visual sections stacked vertically:

**Section 1 — Trial banner** (shown if `accountData.trial_ends_at` is set)

```
┌──────────────────────────────────────────────┐
│  🎁 Free trial active — 6 days remaining     │
│  AI parsing is included free for 7 days.     │
│  No credit card needed.                      │
│                                              │
│  [ Use free trial → ]                        │
└──────────────────────────────────────────────┘
```

The "Use free trial" button calls `advance(4)` — skips BYOK entirely.

**Section 2 — BYOK form** (existing, unchanged)

```
── or bring your own API key ──

Display name:  [_______________]
Model ID:      [_______________]
Base URL:      [_______________]
API key:       [_______________]

[ Validate & Continue ]
```

Validation calls `POST /api/account/ai-services/validate` then saves.

**Section 3 — FreeLLMAPI self-host link**

```
── or self-host FreeLLMAPI ──

Run your own free LLM proxy locally.
Aggregate free tiers from 11+ providers
behind one OpenAI-compatible endpoint.

→ github.com/tashfeenahmed/freellmapi
```

Plain external link, opens in new tab.

### Step 4 — Live Preview (unchanged)

Triggers sync, polls progress, shows first 20 transactions. Continue →
Step 5.

### Step 5 — Done (unchanged)

Shows summary (transaction count, AI provider name). "Open MoneyFlow"
calls `PATCH /api/account/onboarding/complete` and reloads.

---

## Frontend — Invite Section (Settings)

### `account.jsx` — replace `AccessSection` with `InviteSection`

Layout:

```
Invite People
─────────────

[ friend@email.com ] [ Invite ]

────────────────────────────────────
friend@email.com     Pending  Revoke
colleague@email.com  Pending  Revoke
────────────────────────────────────
amansn7@gmail.com    Active   (you)
partner@email.com    Active
────────────────────────────────────
```

- Email input validates for `@`, trims whitespace, lowercases
- "Invite" button calls `POST /api/auth/invitations` → refreshes list
- Revoke button calls `DELETE /api/auth/invitations/{id}` → refreshes list
- Status badges: Pending (yellow), Active (green), Revoked (grey)
- Shows "(you)" next to the current user's email

---

## Migration

`alembic/versions/0039_add_invitations.py`:

```python
op.create_table(
    "invitations",
    sa.Column("id", sa.String(36), primary_key=True),
    sa.Column("email", sa.String(255), nullable=False, index=True),
    sa.Column("invited_by", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
)
```

No data migration needed — `allowed_emails` stays in `user_settings`
(abandoned, not dropped).

---

## What does NOT change

| Aspect | Stays same |
|---|---|
| Data isolation | Each user has their own transactions, budgets, goals — no shared data |
| Gmail sync | Each user connects their own Gmail |
| API query pattern | All 148 routes still use `current_user.id` |
| Existing users | Their `onboarding_complete` stays `true` — no re-onboarding |
| `allowed_emails` column | Still in the DB, just not used for access control anymore |

---

## File-by-file summary

| File | Add | Modify | Remove |
|---|---|---|---|
| `app/models/user.py` | `Invitation` class | — | — |
| `app/models/__init__.py` | export `Invitation` | — | — |
| `alembic/versions/0039_*.py` | migration | — | — |
| `app/api/auth.py` | 3 invite endpoints | `_get_or_create_user()` | — |
| `static/src/onboarding.jsx` | Step 1 pre-fill, Step 2 gmail-done, Step 3 trial+banner+github link | — | — |
| `static/src/account.jsx` | `InviteSection` | — | `AccessSection` |
| `static/src/app.jsx` | pass accountData to OnboardingWizard | — | — |
