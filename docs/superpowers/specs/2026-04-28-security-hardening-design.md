# Security Hardening — GExpense Tracker
**Date:** 2026-04-28  
**Scope:** All 11 confirmed vulnerabilities from pre-deployment security audit  
**Approach:** Thematic wave passes, each independently committable  

---

## Context

Security audit (2026-04-28) found 11 vulnerabilities before first Railway deployment. App has full internet exposure once public. All 11 must be fixed before any user onboards. Three block deployment entirely.

No new external dependencies required — all fixes extend existing patterns already in the codebase.

---

## Architecture Overview

Reuses existing infrastructure:
- `get_current_user` dep in `app/auth_deps.py` — exists, not wired to most endpoints
- `_encrypt_secret()` / Fernet in `app/models/user.py` — used for LLM API keys, extend to refresh tokens
- `_esc()` helper in `static/app.js:68` — written but unused on dashboard table
- SQLAlchemy ORM — one new table for OAuth state storage

Core fix pattern repeated across ~8 files:
```python
current_user: User = Depends(get_current_user)
# then scope every DB query:
.where(Model.user_id == current_user.id)
```

| Wave | Focus | Vulns closed |
|------|-------|--------------|
| 1 | Auth deps on all endpoints | 2, 3, 4, 5, 6 |
| 2 | User-scoped DB queries | 2, 3, 4 (data layer) |
| 3 | Hardening (XSS, cookie, encryption, startup guard) | 7, 8, 9, 11 |
| 4 | Middleware + OAuth state in DB | 1, 10 |
| 5 | Tests (401s + cross-user scoping + hardening) | all |

---

## Wave 1 — Auth Deps (Vulns 2, 3, 4, 5, 6)

Add `Depends(get_current_user)` to every unprotected handler.

| File | Specific change |
|------|----------------|
| `app/api/admin.py:16–98` | Auth dep + `user.role == "owner"` guard on all handlers |
| `app/api/emails.py:22–276` | Auth dep on all handlers |
| `app/api/review.py` | Auth dep on all handlers |
| `app/api/budgets.py` | Auth dep on all handlers |
| `app/api/debt.py` | Auth dep on all handlers |
| `app/api/recurring.py` | Auth dep on all handlers |
| `app/api/rules.py` | Auth dep on all handlers |
| `app/api/duplicates.py` | Auth dep on all handlers |
| `app/api/sync.py:57–148` | Auth dep on `PATCH /sync/settings`, `POST /sync/backfill-bodies`, `POST /alerts/clear` |
| `app/api/onboarding.py:38–49` | Remove `role` from request body; server assigns owner (first registered user = owner) |

---

## Wave 2 — Data Scoping (Vulns 2, 3, 4 — data layer)

Same files as wave 1. Every DB query scoped to authenticated user:

```python
# Before
result = await db.execute(select(Email))
# After
result = await db.execute(select(Email).where(Email.user_id == current_user.id))
```

Admin endpoint scopes to owner's `user_id` only — not all users' data.

---

## Wave 3 — Hardening (Vulns 7, 8, 9, 11)

| File | Change |
|------|--------|
| `app/api/auth.py:33` | `secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"` |
| `static/app.js:186–195` | Wrap all interpolated fields with `_esc()`. Validate `gmail_link` host is `mail.google.com` |
| `app/models/user.py:92–93` | Encrypt `refresh_token` with `_encrypt_secret()` before storing; decrypt on read via property |
| `app/config.py:32` | `raise RuntimeError("SECRET_KEY must be changed in production")` on startup if default detected outside test env |

Config guard:
```python
if settings.SECRET_KEY == "change-me-in-production" and not settings.TESTING:
    raise RuntimeError("SECRET_KEY must be set to a random value in production")
```

---

## Wave 4 — Infrastructure (Vulns 1, 10)

### Vuln 1 — AuthMiddleware blanket passthrough (`app/main.py:50`)
Remove the blanket `/api/` passthrough condition. Route-level `Depends(get_current_user)` becomes the sole enforcement mechanism — middleware does not silently skip auth for any path.

### Vuln 10 — OAuth state in DB (`app/api/auth.py:22`)

Replace in-process `_pending: dict = {}` with a DB-backed table:

```python
class OAuthState(Base):
    __tablename__ = "oauth_states"
    state: Mapped[str] = mapped_column(primary_key=True)
    created_at: Mapped[datetime]
    expires_at: Mapped[datetime]  # created_at + 10 minutes
```

- On state creation: insert row, delete all expired rows (inline cleanup, no background job)
- On state validation: query by state, check `expires_at > now()`, delete after use
- Multi-worker safe: DB is shared across workers, no in-process state

One Alembic migration generated for this table.

---

## Wave 5 — Tests

### File structure
```
tests/
  test_auth_required.py      # all formerly-open endpoints → 401 when unauthenticated
test_user_scoping.py       # 2-user fixture: list endpoints return empty for user A's data when queried by user B; single-resource endpoints (GET /emails/{id}) return 404
  test_xss_escaping.py       # inject <script> as merchant/sender, assert output escaped
  test_config_hardening.py   # monkeypatch SECRET_KEY default → assert RuntimeError
  test_oauth_state.py        # expired state → 400; consumed state → 400
```

### Auth test pattern
```python
@pytest.mark.parametrize("method,path", [
    ("GET",  "/api/emails"),
    ("POST", "/api/admin/fetch-preview"),
    ("GET",  "/api/budgets"),
    ("GET",  "/api/review"),
    ("GET",  "/api/recurring"),
    ("POST", "/api/sync/backfill-bodies"),
    ("PATCH", "/api/sync/settings"),
    ("POST", "/api/alerts/clear"),
    # ... all protected endpoints
])
async def test_unauthenticated_returns_401(client, method, path):
    r = await client.request(method, path)
    assert r.status_code == 401
```

### Scoping test pattern
```python
async def test_user_cannot_read_other_users_emails(client, user_a_token, user_b_email):
    r = await client.get("/api/emails", headers={"Authorization": f"Bearer {user_a_token}"})
    ids = [e["id"] for e in r.json()]
    assert user_b_email.id not in ids
```

### Coverage target
Every vuln has at least one test that would have caught it before the fix.

---

## Vulnerability Index

| # | Severity | File | Status |
|---|----------|------|--------|
| 1 | Fix this week | `app/main.py:50` | Wave 4 |
| 2 | **BLOCK** | `app/api/admin.py:16–98` | Wave 1+2 |
| 3 | **BLOCK** | `app/api/emails.py:22–276` | Wave 1+2 |
| 4 | Before first user | 6 router files | Wave 1+2 |
| 5 | Before first user | `app/api/sync.py:57–148` | Wave 1 |
| 6 | **BLOCK** | `app/api/onboarding.py:38–49` | Wave 1 |
| 7 | Fix same day | `app/api/auth.py:33` | Wave 3 |
| 8 | Fix this week | `app/models/user.py:92–93` | Wave 3 |
| 9 | Fix same day | `static/app.js:186–195` | Wave 3 |
| 10 | Fix this week | `app/api/auth.py:22` | Wave 4 |
| 11 | Fix this week | `app/config.py:32` | Wave 3 |
