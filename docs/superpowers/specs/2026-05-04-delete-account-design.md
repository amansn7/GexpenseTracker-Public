# Delete Account — Design Spec
_2026-05-04_

## Overview

Wire the existing "Delete…" stub button in the Settings Danger Zone to a real account deletion flow. Deletion is permanent and cascades all user data via existing DB foreign key constraints.

## Backend

**Endpoint:** `DELETE /api/account`
- Route in `app/api/settings.py` (alongside existing account routes)
- Auth: existing `current_user` dependency (session required)
- Steps:
  1. Load user from session
  2. `await db.delete(user)` + `await db.commit()`
  3. DB cascade handles: profile, settings, connected_accounts, categories, ai_services, sessions, emails, transactions, budgets, recurring, debt
  4. Clear session cookie on response via `_clear_session_cookie(response)` (import from auth.py)
- Response: `{"deleted": true}` with 200
- No new migration needed — cascade rules already in place

## Frontend

**Location:** `static/src/account.jsx` — `SettingsView` component, Danger Zone section (line ~976)

**State added to SettingsView:**
```js
const [showDeleteModal, setShowDeleteModal] = useState(false);
const [confirmEmail, setConfirmEmail] = useState("");
const [deleting, setDeleting] = useState(false);
const [deleteError, setDeleteError] = useState(null);
```

**Modal behavior:**
- Opens on "Delete…" button click
- Displays: "Type your email to confirm: `{account.email}`"
- Email input — delete button disabled until `confirmEmail.toLowerCase() === account.email.toLowerCase()`
- On confirm:
  1. Set `deleting = true`
  2. Call `DELETE /api/account`
  3. On success: `window.location.href = "/"` (onboarding gate re-evaluates, shows login)
  4. On error: show inline error inside modal, reset `deleting`
- Cancel closes modal, resets `confirmEmail` and `deleteError`

**Modal style:** red border (`var(--neg-soft)`), matches existing Danger Zone section style. Overlay backdrop. No new CSS — uses existing `accountStyles`.

## Error Handling

- API error → inline message inside modal (`deleteError` state), modal stays open
- Network failure → same inline error path
- Unauthenticated (401) → redirect to `/` anyway (user is effectively logged out)

## Testing

- Unit test: `DELETE /api/account` with valid session → 200, user row gone, cookie cleared
- Unit test: `DELETE /api/account` with no session → 401
- Manual: confirm all related data (emails, categories, etc.) deleted via cascade
