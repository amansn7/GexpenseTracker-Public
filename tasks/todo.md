# Public Release Remediation Plan

Date: 2026-05-25
Status: Plan proposed — waiting for user review

## Naming Convention

Each task uses a wave prefix (W1, W2, W3) indicating parallelization group. Tasks within the same wave are independent and can run as parallel subagents.

---

## W1: Commit Inventory — Clean the Tree

**Goal:** Get the 142-file dirty tree into structured, reviewable commits before any P0 fix.

- [ ] W1.1 Run `git diff --stat` and group changed files into logical categories
  Categories observed: security (12), test (58), classifier/LLM (15), sync/gmail (8), auth/JWT (6), frontend (8), admin (2), migration (4), config (3), misc (7)
- [ ] W1.2 Create a plan for commit grouping
- [ ] W1.3 Commit each group as an atomic unit with proper messages
- [ ] W1.4 Confirm `git status` is clean with only intentional untracked files
- [ ] W1.5 Run full test suite on clean tree: `pytest`
- [ ] W1.6 Run lint + format check: `ruff check app tests && ruff format --check app tests`
- [ ] W1.7 Run frontend build: `npm run build`

---

## W2: Fix Admin Reset-My-Data

**Goal:** Fix the 4 broken SQL queries + 14 missing tables in `app/api/admin.py:265-280`.

### Broken queries to fix:
- `classification_log.transaction_id` → `classification_log.email_id` with subquery through `emails`
- `transactions.user_id` → `email_id IN (SELECT id FROM emails WHERE user_id = :uid)`
- `duplicate_pairs.user_id` → join through `transactions → emails`
- `sync_state` (no WHERE) → add `WHERE user_id = :uid`

### Missing tables to add:
- `sender_rules`, `filter_rules`, `goals`, `goal_contributions`, `merchant_aliases`, `merchant_entity_aliases`, `device_tokens`, `refresh_token_blacklist`, `sync_progress`, `transaction_corrections`, `llm_spend_tracker`, `audit_logs` (decide)

**Files:** `app/api/admin.py`
**Verification:** `pytest tests/test_admin.py` — add test first

---

## W3: Fix Account Deletion Data Coverage

**Goal:** Ensure `_delete_user_data()` in `app/api/settings.py:652` covers ALL user tables.

### Missing tables to add (no CASCADE, so explicitly delete):
1. `filter_rules` — has FK but no `ondelete="CASCADE"`
2. `sync_state` — has FK but no `ondelete="CASCADE"`
3. `transaction_corrections` — has FK but no `ondelete="CASCADE"`
4. `sync_progress` — no FK (plain column), delete by user_id
5. `llm_spend_tracker` — no FK (plain column), delete by user_id
6. `audit_logs` — no FK (plain column), decide retention policy

### Optionally add CASCADE to models:
- `FilterRule` → add `ondelete="CASCADE"` to FK
- `SyncState` → add `ondelete="CASCADE"` to FK
- `TransactionCorrection` → add `ondelete="CASCADE"` to FK
- `SyncProgress` → add FK + CASCADE to user_id
- `LLMSpendTracker` → add FK + CASCADE to user_id
- `AuditLog` → add FK + CASCADE to user_id (or decide retention)

**Files:** `app/api/settings.py`, plus model files for optional CASCADE
**Migrations:** New migration if CASCADE added
**Verification:** `pytest tests/test_delete_account.py` — expand test first

---

## W4: Fix SQLite Migration Path

**Goal:** Either make `alembic upgrade head` work with SQLite, or remove SQLite from docs.

### Option A: Fix SQLite compatibility (preferred since test suite uses SQLite)
1. `alembic/env.py:8` — Strip `+aiosqlite` from URL for sync engine
2. `0015_auth_sessions.py:47` — Replace raw `now()` with `sa.text("CURRENT_TIMESTAMP")`
3. `0027_add_session_rotation.py:19` — Replace `TIMESTAMP WITH TIME ZONE` with `sa.Text()` or dialect guard
4. 9 migrations with constraint DDL outside batch mode — wrap in `with op.batch_alter_table`
5. `0025, 0026, 0027, 0033` — Replace `ADD COLUMN IF NOT EXISTS` with plain `ADD COLUMN` (or add dialect guard)
6. `0024, 0038` — Replace `sa.text("true")` → `sa.text("1")` for SQLite bool, or use dialect-aware default

### Option B: Document PostgreSQL-only
- Remove SQLite from README lines 96, 114, 136-145
- Remove SQLite from `.env.example` comment

**Files:** `alembic/env.py`, alembic migration files, `README.md`, `.env.example`
**Verification:** `DATABASE_URL=sqlite+aiosqlite:///./test.db alembic upgrade head`

---

## W5: Security Hardening (P1)

### W5.1 CSP — remove 'unsafe-inline'
- Extract inline `<script>` from `templates/index.html` (theme restore) → external JS bundle
- Extract inline `<style>` from `templates/index.html` → `styles.css`
- Extract Three.js login background from `templates/login.html` → `static/dist/login-bg.js`
- Replace `'unsafe-inline'` with proper nonce-based CSP

### W5.2 Configuration hardening
- Add `JWT_SECRET` enforcement at startup in `main.py`
- Add `FERNET_KEY`, `JWT_SECRET`, `COOKIE_SECURE`, `CORS_ORIGINS` to `.env.example`
- Remove weak `POSTGRES_PASSWORD=expense` from `.env.example` (use a placeholder)
- Add HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- Replace deprecated `X-XSS-Protection` with modern equivalent

### W5.3 Rate limiting expansion
- Add rate limits to uncovered endpoints: settings, stats, insights, merchants, budgets, goals, debt, duplicates, emails, recurring, filter, rules, reconciliation, cleanup, admin (non-reset), onboarding, sync (non-trigger)
- Add stale bucket cleanup GC timer
- Consider per-user vs per-IP for keying

### W5.4 2FA state cleanup
- Clear `totp_verified` cookie explicitly on logout
- Verify 2FA state is invalidated on session rotation

---

## W6: Add Critical Tests (P0)

### W6.1 Test `reset-my-data` endpoint
- Create fixture with user + data across all affected tables
- Call `POST /api/admin/reset-my-data`
- Assert all user tables are empty
- Assert user row still exists
- Assert other users' data is untouched
- Assert onboarding is reset

### W6.2 Expand `test_delete_account.py`
- Create fixture with data across ALL user tables
- Call delete account endpoint
- Assert every user-scoped table is empty
- Assert user row deleted
- Assert other users' data untouched

### W6.3 Add migration test
- Write test that runs `alembic upgrade head` from empty DB
- Write test that runs `alembic downgrade -1` and back up

### W6.4 Add SQLite migration smoke test
- `DATABASE_URL=sqlite+aiosqlite:///./test_migration.db alembic upgrade head`
- If Option A chosen, this should pass clean

---

## W7: Data Integrity (P1)

### W7.1 Streaming export
- Replace current in-memory CSV generation with `StreamingResponse`
- Use cursor/batch pagination instead of loading all rows

### W7.2 Bulk action pagination
- Replace offset pagination with keyset pagination for bulk delete/review actions
- Or pre-select IDs in batches before mutating

### W7.3 Body backfill pagination
- Same issue as W7.2 — replace offset with repeated first-batch fetch

---

## W8: PostgreSQL Migration Smoke (P1)

- [ ] Run `alembic upgrade head` on PostgreSQL from empty DB
- [ ] Run production migration preflight: duplicate `transactions.email_id` detection
- [ ] Run seed smoke with 50k+ transactions
- [ ] Validate inbox, dashboard, flow, reports, export, search

---

## W9: Frontend & UX (P1)

- [ ] Browser smoke tests on desktop + mobile
- [ ] Accessibility audit (keyboard nav, focus, aria, color contrast, 44px targets)
- [ ] Verify no in-browser Babel being served
- [ ] Add Playwright/Vitest smoke test for core user flow
- [ ] Verify cache busting (versioned bundles match deployment)
- [ ] Remove or nonce-protect inline scripts

---

## W10: Operations (P2)

- [ ] Make CI fully blocking (fix mypy, pip-audit allowed-failures)
- [ ] Run `pip-audit` and `npm audit`, triage findings
- [ ] Add structured logging + correlation IDs
- [ ] Document rollback procedure (migrations, Railway, scheduler pause)
- [ ] Confirm legal/privacy basics (privacy policy, terms, OAuth verification)
