# Public Release Readiness — Execution Plan

**Strategy:** 4 parallel GSD workstreams with subagents. Wave 1 dispatches all four. Each workstream is independent except WS-B must be sequenced: CSP template changes before CSP header changes (but same subagent handles it sequentially).

## Workstream Overview

| WS | Focus | Items | Est. Time | Parallel |
|----|-------|-------|-----------|----------|
| A | Test Infrastructure | hang fix, CI gates, audits | 2-3h | Yes |
| B | Security Hardening | SSRF, CSP, rate limits, secrets | 3-4h | Yes |
| C | Data Integrity & Ops | PG migrations, deletion, LLM cost, docker | 4-5h | Yes |
| D | Frontend & Legal | Playwright, a11y, OAuth, legal scoping | 3-4h | Yes |

---

## WS-A: Test Infrastructure

**Goal:** Full test suite passes, CI gates are hard, dependency vulns are known.

### A1 Fix hanging test_stream_backfill.py
- **Root cause:** 7 async tests with `db_session` fixture likely hit asyncio loop_scope mismatch when run together. Individual invocations pass.
- **Fix:** Add `asyncio_default_fixture_loop_scope = function` to `pytest.ini`. If that alone doesn't fix it, check conftest.py's `db_session` fixture scope.
- **Verify:** `pytest tests/test_stream_backfill.py -q` passes all 7 in < 30s.

### A2 Add pytest-asyncio config
- Add to `pytest.ini`: `asyncio_default_fixture_loop_scope = function`
- Suppresses the deprecation warning.

### A3 Dependency audits
- Run `pip-audit -r requirements.txt`. Triage findings.
- Run `npm audit --audit-level=high`. Triage findings.
- If vulns found, update pinned versions.

### A4 CI gate hardening
- `mypy`: Change from `continue-on-error: true` to blocking. If too noisy, scope to specific modules.
- `pip-audit`: Change from `continue-on-error: true` to blocking. If false positives, add ignore rules.

---

## WS-B: Security Hardening

**Goal:** No SSRF vector, CSP without `unsafe-inline`, rate limits cover all auth paths, secrets validated.

### B1 SSRF fix
- **File:** `app/api/settings.py` lines 427, 443-475 and `app/classifier/llm/providers.py`
- **Fix:** Add `validate_url(url: str) -> str` function that:
  1. Parses URL, rejects non-http/https schemes
  2. Resolves hostname, rejects private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1, etc.)
  3. Rejects empty hostnames
  4. Returns cleaned URL or raises 422
- **Apply** to validate_ai_service and any user-supplied base_url path.
- **Verify:** Test with internal IP (should 422), test with valid URL (should pass).

### B2 Rate limiting for Bearer/JWT clients
- **File:** `app/main.py` AuthMiddleware (lines ~173-182)
- **Fix:** For JWT Bearer requests, extract the `user_id` from the JWT payload (decode without verification since AuthMiddleware runs before auth) and use as rate limit key.
- **Verify:** Add test case for Bearer token hitting rate limit.

### B3 Sanitize validate_ai_service errors
- **File:** `app/api/settings.py` line ~474
- **Fix:** Return generic `{"ok": False, "error": "validation failed"}` instead of `str(exc)`.
- **Verify:** Error response doesn't leak internals.

### B4 Validate minimum secret lengths
- **File:** `app/config.py`
- **Fix:** Add Pydantic validators for `SECRET_KEY` (min 32), `JWT_SECRET` (min 32), `FERNET_KEY` (min 32).
- **Verify:** Config raises on short secrets outside of tests.

### B5 CSP FOUC fix + hardening
- **Files:** `app/main.py`, `templates/index.html`, `templates/login.html`
- **Fix:** 
  1. Add nonce generation in middleware (one per request)
  2. Add nonce to CSP header: `script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net https://unpkg.com;`
  3. Add `nonce="{nonce}"` to inline `<script>` tags in both templates
  4. Remove `'unsafe-inline'` from `script-src`
- **Verify:** Pages load without CSP errors, themes apply correctly.

### B6 Fix deprecated datetime.utcnow()
- Find all usages across app and tests, replace with `datetime.now(datetime.UTC)` or timezone-aware alternatives.

---

## WS-C: Data Integrity & Ops

**Goal:** PG migrations proven, account deletion covers all tables, bulk actions correct, LLM cost capped, docker works.

### C1 PostgreSQL migration smoke
- Write a script or doc that:
  1. Stands up PG via docker-compose
  2. Runs `alembic upgrade head`
  3. Seeds test data
  4. Runs dedup preflight
  5. Runs `alembic downgrade -1` and back up
- Document the procedure in README.

### C2 Account deletion coverage
- **File:** `app/api/settings.py` `_delete_user_data()`
- **Fix:** Add explicit DELETE for cascade-only tables: `goals`, `goal_contributions`, `merchant_aliases`, `merchant_entity_aliases`, `device_tokens`, `refresh_token_blacklist`.
- **Verify:** Updated test confirms all tables cleared.

### C3 Bulk action pagination
- **File:** `app/api/transactions.py` bulk action paths
- **Fix:** Replace `offset` with keyset pagination (WHERE id > last_id) for mutating bulk actions. Pre-select all matching IDs first, then batch-delete/update by ID list.
- **Verify:** Test with 500+ rows, verify no rows skipped.

### C4 LLM cost controls
- **Files:** New `LLMSpendTracker` model, `app/classifier/llm/client.py`, `app/config.py`
- **Scope down for private beta:** Add global daily budget check (env var, default $10/day). Track spend in-memory (per-user tracking via DB can come later). If budget exceeded, skip LLM calls, fall back to rules.
- **Verify:** Test with exhausted budget → LLM skipped.

### C5 Docker image smoke
- Build docker image, run it with SQLite, verify `/health` returns 200.
- Update entrypoint to handle SQLite in dev mode.

### C6 Fix AsyncMock coroutine warnings
- Fix the `RuntimeWarning: coroutine 'AsyncMockMixin._execute_mock_call' was never awaited` in `test_sync_progress_persist.py`.

---

## WS-D: Frontend & Legal

**Goal:** Basic Playwright coverage, a11y baseline, OAuth app status known, legal docs scoped.

### D1 Expand Playwright smoke tests
- Add tests for: onboarding wizard, inbox view, dashboard loads, settings page, 2FA flow.
- Use the existing Playwright config pattern.

### D2 Accessibility audit
- Manual check: keyboard nav (Tab through inbox), focus rings, color contrast in all 3 themes, form labels, aria-live for sync status.
- Write findings as checklist; fix easy wins in templates.

### D3 Google OAuth verification research
- Check current OAuth consent screen state. Document what's needed for Gmail restricted scope (`gmail.readonly`).
- Google Cloud project settings: verify redirect URIs, app domain, privacy policy URL requirement.

### D4 Privacy policy / terms scoping
- Draft requirements for privacy policy (data collected: email metadata, transactions, Gmail OAuth tokens).
- Terms of service: single-user liability, no SLA, open-source Apache 2.0.

### D5 Data retention and export review
- Verify export covers all user data. Add missing endpoints if needed.
- Document data retention policy for Gmail tokens, sync data, etc.

---

## Wave Execution

### Wave 1 (dispatch all 4)
```
WS-A ─── A1 → A2 → A3 → A4
WS-B ─── B1 → B2 → B3 → B4 → B5 → B6
WS-C ─── C1 → C2 → C3 → C4 → C5 → C6
WS-D ─── D1 → D2 → D3 → D4 → D5
```

### Verification Gate (after all workstreams complete)
1. `pytest -q` — all 587 pass, no hangs
2. `ruff check app tests` — 0 errors
3. `npm run build` — 17 files built
4. `alembic upgrade head && alembic downgrade -1 && alembic upgrade head` — PG
5. Manual browser smoke on localhost
