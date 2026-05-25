# Plan: Public Release Readiness Remediation

Date: 2026-05-25
Based on: `tasks/public-release-readiness-checklist.md`

## Research Findings (Subagent Results)

### Corrections to Original Checklist

Several checklist claims were incorrect or stale:

| Checklist Claim | Actual Finding | Severity |
|---|---|---|
| SQLite migration fails with `MissingGreenlet` in `env.py` | **False** — `alembic upgrade head` on SQLite passes cleanly. Only `0033` downgrade fails (3x `DROP COLUMN IF EXISTS`). | Checklist wrong → lower priority |
| `reset-my-data` references stale `classification_log.transaction_id` and `transactions.user_id` | **False** — actual SQL uses `email_id IN (SELECT id FROM emails WHERE user_id = :uid)` — correct. | Checklist wrong → not a blocker |
| Account deletion misses 6 tables (goals, merchant_aliases, etc.) | **False** — all 6 missing tables have `ondelete="CASCADE"` on FK to `users.id`. The final `DELETE FROM users` implicitly handles them. | Checklist wrong → lower priority |

### Confirmed P0 Issues

| # | Issue | Finding |
|---|---|---|
| 1 | Dirty tree: 43 files (31 modified, 12 untracked) | Needs commit/review/discard before release |
| 2 | `reset-my-data` user_settings UPDATE misses 7 columns | Only resets 7 of 14 mutable columns. Misses: `sound_effects`, `two_factor_enabled`, `confidence_threshold`, `digest_hour`, `allowed_emails`, `starting_balance`, `starting_balance_date` |
| 3 | Migration 0040 preflight needed | `dedup_before_migration.py` exists (151 lines, production-ready). Must run before PG upgrade. |
| 4 | `reset-my-data` test coverage critically weak | Only verifies 6 of ~27 tables. User isolation only checked on 3 tables. |
| 5 | SQLite migration 0033 downgrade broken | 3x `DROP COLUMN IF EXISTS` — PostgreSQL-specific |
| 6 | Dead frontend assets: 3MB babel.min.js, 970kb React dev builds, orphaned bundle.js | No frontend source being served through browser Babel, but dead weight in repo |
| 7 | No frontend tests | Playwright installed but unused. Zero automated frontend test coverage. |

## Workstreams

### WS-A: Dirty Tree Resolution (P0)
Priority commit/split/discard of all dirty files.

Files to verify per category:
- `app/api/` — transactions.py (+112), admin.py, auth.py, settings.py, sync.py
- `app/main.py`, `app/rate_limiter.py`, `app/scheduler.py`
- `app/models/` — correction.py, email.py, filter_rule.py
- `alembic/versions/` — 16 migrations (lint-only changes)
- `tests/` — test_admin.py (+95), test_delete_account.py (+149), test_rate_limiting_expansion.py
- `money-movie/` (untracked) — decide: keep or gitignore
- `test-results/` (untracked) — add to `.gitignore`

**Action:** Review meaningful changes, commit as logical units, add `test-results/` to `.gitignore`.

---

### WS-B: Fix reset-my-data user_settings Columns (P0)

**Problem:** `app/api/admin.py` lines 303-316 only reset 7 of 14 mutable columns.

**Fix:** Add the 7 missing columns to the UPDATE:
- `sound_effects = FALSE`
- `two_factor_enabled = FALSE`
- `confidence_threshold = 70`
- `digest_hour = 9`
- `allowed_emails = NULL`
- `starting_balance = NULL`
- `starting_balance_date = NULL`

**Add test:** Update `tests/test_admin.py` to assert specific column values after reset, not just row existence.

---

### WS-C: Expand reset-my-data Test Coverage (P0)

Current test only covers: Email, Budget, ConnectedAccount, Session, UserProfile, UserSettings (existence only).

**Missing table coverage (21 tables):** sync_state, sync_progress, transaction_corrections, classification_log, duplicate_pairs, filter_rules, sender_rules, goals, goal_contributions, merchant_aliases, merchant_entity_aliases, device_tokens, refresh_token_blacklist, llm_spend_tracker, audit_logs, debts, recurring_expenses, user_merchant_overrides, user_ai_services, user_categories, Transaction

**Missing assertions:** User isolation (verify unaffected user's data untouched) across ALL tables, not just 3.

---

### WS-D: Fix SQLite Migration 0033 Downgrade (P0, quick fix)

**Fix** `alembic/versions/0033_move_startup_ddl_to_alembic.py` downgrade — replace `DROP COLUMN IF EXISTS` with inspector-based approach:

```python
def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    cols = [c["name"] for c in inspector.get_columns("transactions")]
    if "payment_mode" in cols:
        op.drop_column("transactions", "payment_mode")
    # same for filter_rules.user_id, sync_state.user_id
```

Test: `DATABASE_URL=sqlite+aiosqlite:///./test.db alembic upgrade head && alembic downgrade -1`

---

### WS-E: Dead Frontend Asset Cleanup (P1)

Remove unloaded vendor files:
- `static/vendor/babel.min.js` (3MB)
- `static/vendor/react.development.js` (70kb)
- `static/vendor/react-dom.development.js` (900kb)
- `static/dist/bundle.js` (14kb, orphaned)
- `static/dist/bundle.js.map` (38kb, orphaned)

Keep:
- `react.production.min.js` ✓
- `react-dom.production.min.js` ✓
- `three.min.js` ✓

---

### WS-F: PostgreSQL Migration Preflight Script (P1)

- Document the upgrade procedure:
  1. `python -m app.scripts.dedup_before_migration --dry-run`
  2. `python -m app.scripts.dedup_before_migration --execute`
  3. `alembic upgrade head`
- Add this to `README.md`
- Verify the dedup script handles all duplicate scenarios

---

### WS-G: CSP Hardening — Extract Login Script (P1)

- Extract `templates/login.html:65-160` (96-line inline Three.js/audio script) to `static/src/login-effects.js`
- Add to esbuild build pipeline: `scripts/build-frontend.mjs`
- Update `templates/login.html` to load external bundle
- Update CSP to remove `'unsafe-inline'` and verify the app still works

**Note:** The tiny theme-inline scripts in `index.html:3` and `login.html:3` (FOUC prevention) will remain as they cannot be externalized without flash. Keep `'unsafe-inline'` for now; revisit with nonce approach later.

---

### WS-H: Frontend Build Automation (P1)

- Add content-hashing to esbuild build script (e.g., hash output filename or embed hash in `?v=` params)
- Add pre-build cleanup of orphaned dist files
- Consider adding `npm run build` as a CI gate

---

### WS-I: Rate Limiting Expansion (P1)

Add rate limit coverage for uncovered endpoints:
- `"/api/merchant_aliases/"`: (20, 60)
- `"/api/account/"`: (20, 60)
- `"/api/auth/"`: (10, 60)
- `"/api/sync/"`: (10, 60)
- `/health`: (30, 60)

---

### WS-J: JWT_SECRET / SECRET_KEY Validation (P1)

Add validators in `app/config.py`:
- `JWT_SECRET`: minimum 32 characters
- `SECRET_KEY`: minimum 32 characters (in addition to existing default-string check)

---

### WS-K: Account Deletion Inconsistency Cleanup (P2)

Add explicit DELETE for CASCADE-only tables to `_delete_user_data` for robustness:
- goals, goal_contributions, merchant_aliases, merchant_entity_aliases, device_tokens, refresh_token_blacklist

Note: These are currently handled by CASCADE. This is a defensive fix so that if CASCADE is ever removed, deletion still works.

---

### WS-L: README + .env.example Updates (P1)

- `.env.example`: Add `# REQUIRED` / `# OPTIONAL` labels, minimum length hints for secrets
- `README.md`: Document dedup preflight, SQLite dev grade vs PG production

---

### WS-M: Frontend Test Infrastructure (P2)

- Configure Playwright (already installed as dependency)
- Add smoke test: login page loads
- Add to `package.json` scripts

---

## Execution Order

**Wave 1 (parallel, 5 subagents):**
- WS-A: Dirty tree resolution
- WS-B: Fix user_settings reset columns
- WS-D: Fix SQLite migration 0033 downgrade
- WS-E: Dead frontend asset cleanup
- WS-G: CSP hardening — extract login script

**Wave 2 (parallel, 4 subagents):**
- WS-C: Expand reset-my-data test coverage
- WS-I: Rate limiting expansion
- WS-J: JWT/SECRET_KEY validators
- WS-K: Account deletion cleanup

**Wave 3 (parallel, 3 subagents):**
- WS-F: Migration docs + README
- WS-H: Frontend build automation
- WS-L: .env.example updates

**Wave 4 (sequential):**
- WS-M: Frontend test infra (verify Wave 3 build automation first)

**Final verification gate:**
- Run full test suite: `pytest`
- Run lint: `ruff check`
- Run build: `npm run build`
- Run migration up+down on SQLite
- Manual smoke: local dev server
