# Public Release Readiness Checklist

Date: 2026-05-25

Status: Not ready for public release.

Reason: the app has a solid product foundation and the current unit/lint/build gates now pass in the dirty working tree, but it is still not releaseable. The tree contains a very large uncommitted diff, migrations have not been proven on PostgreSQL, SQLite migration/docs are broken, destructive account/admin deletion paths need correction, and public-browser/security/ops validation is still missing.

## Verification Run

- [x] Frontend build: `npm run build` passed, 16 files built into `static/dist/`.
- [x] Backend test suite: `.venv/bin/python -m pytest` passed, 583 passed, 1 skipped, 46 warnings.
- [x] Backend lint: `.venv/bin/python -m ruff check app tests` passed.
- [x] Backend format check: `.venv/bin/python -m ruff format --check app tests` passed, 161 files already formatted.
- [x] Alembic graph check: `.venv/bin/alembic heads` reports a single head, `0040`.
- [ ] Python dependency audit: not run, `pip_audit` is not installed in the venv.
- [ ] npm security audit: attempted, blocked by network/DNS to `registry.npmjs.org`.
- [ ] Browser smoke validation: not run.
- [ ] PostgreSQL migration smoke: not run locally.
- [ ] Docker/Railway image smoke: not run locally.
- [ ] SQLite migration smoke: failed. `sqlite+aiosqlite` fails in `alembic/env.py` with `MissingGreenlet`; synchronous SQLite then fails in migration `0015_auth_sessions.py` because raw SQL calls PostgreSQL `now()`.

## P0 Release Blockers

- [ ] Get the repository into a known release state.
  Current dirty scope is very large: 138 tracked files changed plus untracked `money-movie/`, `tasks/public-release-readiness-checklist.md`, `tasks/taste-frontend-review.md`, and `test-results/`. Treat all passing verification as applying only to this uncommitted tree. Before release, split, review, commit, or intentionally discard every change.

- [ ] Prove PostgreSQL migrations from empty DB to head and from the current production snapshot to head.
  Alembic has a single head, but no PostgreSQL upgrade was run. Migration `0040` adds `uq_transactions_email_id`; production must run `app/scripts/dedup_before_migration.py --execute` or otherwise prove there are no duplicate `transactions.email_id` values before upgrade.

- [ ] Fix or disable `/api/admin/reset-my-data` before public release.
  The wipe SQL references columns that do not exist in the current models: `classification_log.transaction_id` and `transactions.user_id`. This owner-only endpoint can fail mid-reset and is not covered by the current `tests/test_admin.py` smoke.

- [ ] Fix account deletion/data-erasure coverage.
  `_delete_user_data()` does not explicitly delete all user-linked tables, including `filter_rules`, `merchant_aliases`, `goals`, `goal_contributions`, `device_tokens`, `refresh_token_blacklist`, `sync_state`, `sync_progress`, `transaction_corrections`, `llm_spend_tracker`, and `audit_logs`. Some have FKs, some do not, and some FKs lack `ondelete="CASCADE"`. Public release needs a tested deletion contract.

- [ ] Resolve SQLite support or correct the docs.
  README says local SQLite works with `DATABASE_URL=sqlite+aiosqlite:///./data/expense.db` and `alembic upgrade head`, but that path fails. Either make Alembic SQLite-compatible or remove SQLite from public setup docs.

- [ ] Add tests for the newly identified release-critical paths.
  Minimum new tests: admin reset does not reference stale columns; account deletion removes or anonymizes every user-owned table; migration preflight detects duplicate `transactions.email_id`; SQLite support is either tested or explicitly unsupported.

## P1 Security And Privacy

- [ ] Recheck public CSP posture.
  `app/main.py` still allows `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'`. The runtime now uses compiled `static/dist` assets, so move toward nonces or externalized scripts/styles before public release.

- [ ] Confirm `FERNET_KEY`, `SECRET_KEY`, `JWT_SECRET`, Google OAuth credentials, and LLM keys are mandatory in production configuration and absent from logs.
  `SECRET_KEY` and `FERNET_KEY` are checked at startup, but `JWT_SECRET` is only enforced when JWT helpers are called.

- [ ] Update `.env.example`.
  It still shows weak `POSTGRES_PASSWORD=expense`, default `SECRET_KEY=change-me-in-production`, and does not document `FERNET_KEY`, `JWT_SECRET`, `COOKIE_SECURE`, or production `CORS_ORIGINS` clearly enough for public operators.

- [ ] Expand rate limiting and abuse controls for public usage.
  Confirm limits cover auth, 2FA, sync/backfill, bulk actions, AI-service settings, export, admin/dev endpoints, and destructive account operations. In-memory limits are acceptable only for a single-instance beta.

- [ ] Browser-test 2FA end to end.
  Unit tests exist and core enforcement is present, but public release needs a real browser flow: enable 2FA, log out, log in, verify prompt, invalid code, valid code, logout clears state, session rotation preserves or invalidates 2FA as intended.

- [ ] Clear 2FA state on logout and deletion flows.
  Logout currently clears the `session` cookie, but does not explicitly delete `totp_verified`. The cookie is session-bound, so it should fail on a new session, but stale auth cookies should still be cleared for predictable browser behavior.

- [ ] Verify account deletion, data export, and data retention behavior against the public privacy promise.

## P1 Data Integrity And Scale

- [ ] Run Alembic from empty DB to head on PostgreSQL.
  Include the merge path, AI-key re-encryption migration, TOTP encryption migration, `0040` unique constraints, and a preflight with duplicated transaction email IDs.

- [ ] Run a production-sized seed smoke.
  Validate inbox, dashboard, flow, reports, export, and search with at least 50k transactions for one user and multiple users.

- [ ] Finish streaming export.
  Export now enforces a 10k warning/cap path, but still loads all matching rows into memory before returning CSV. Replace with `StreamingResponse` and cursor/batch pagination.

- [ ] Review bulk action pagination correctness.
  The select-all path uses `offset` while mutating rows. For delete or actions that change query membership, offset pagination can skip rows. Prefer keyset pagination or preselected IDs in batches.

- [ ] Review body backfill pagination correctness.
  `/api/sync/backfill-bodies` uses offset pagination while updating rows so they no longer match the query. This can skip every other batch of missing bodies. Use keyset pagination or repeatedly fetch the first batch until none remain.

- [ ] Verify sync durability across restart.
  Progress is persisted and stale progress recovery exists, but the task queue remains in-memory. Public release should either document single-instance limits or use a DB-backed/Redis-backed queue.

- [ ] Validate Gmail sync with expired history IDs, revoked tokens, rate limits, partial batch failures, and duplicate Gmail IDs.

- [ ] Verify LLM spend controls with real provider metadata.
  A global estimated daily budget exists, but public release needs per-user limits, visible usage, predictable fallback when exceeded, and provider-cost estimates that reflect real billing.

- [ ] Decide whether global learned duplicate rules are acceptable.
  `DomainPairRule` is global rather than user-scoped. That may be intentional learning across users, but public release needs an explicit privacy/product decision.

## P1 Frontend And UX

- [ ] Run browser smoke tests on desktop and mobile widths.
  Required flows: login/onboarding, Gmail connection, inbox filtering, bulk actions, duplicate review, transaction edit/reclassify, dashboard, Money Flow, reports, recurring, debt, settings/account, admin, 2FA, sync progress.

- [ ] Run accessibility checks.
  Verify keyboard navigation, visible focus, skip link, landmarks, dialog focus management, form labels, aria-live sync updates, color contrast in Paper/Cool/Midnight themes, and 44px touch targets.

- [ ] Confirm no frontend source is being served through in-browser Babel.
  `templates/index.html` loads production React and `static/dist` bundles, which is good. Keep `static/vendor/babel.min.js` out of the production page and eventually remove it if unused.

- [ ] Add at least one automated frontend smoke path.
  The app has backend tests and a build, but no Playwright/Vitest coverage for core user flows.

- [ ] Browser-verify cache busting.
  `templates/index.html` references versioned bundles. Ensure every changed `static/dist/*.js` has a matching `v=` bump before deployment.

- [ ] Remove or isolate production inline script requirements.
  The main and login templates both use inline scripts for theme bootstrapping/visuals. If CSP moves away from `unsafe-inline`, these need nonce support or external bundles.

## P2 Operations

- [ ] Make CI fully blocking for the release gate.
  Current CI has tests, ruff, frontend build, migrations, and coverage, but `mypy` and `pip-audit` are allowed to fail. Decide which security/audit failures block public release.

- [ ] Run `pip-audit` and `npm audit` and triage all high/critical issues.
  Current local status: `pip_audit` is not installed, and `npm audit --audit-level=high` could not reach the registry because network access is unavailable in this session.

- [ ] Add operational observability.
  At minimum: structured request logs, correlation IDs, error-rate visibility, sync failure counts, LLM spend metrics, Gmail API failure/rate-limit metrics, and alerting for failed migrations/startup failures.

- [ ] Confirm deploy rollback procedure.
  Include DB migration rollback/backout guidance, Railway rollback steps, and how to pause scheduler/sync workers.

- [ ] Confirm public legal/product basics.
  Privacy policy, terms, support/contact path, Google OAuth verification/app publishing state, and Gmail restricted-scope requirements. The app requests `https://www.googleapis.com/auth/gmail.readonly`.

## Positive Signals

- [x] `FERNET_KEY` is now required at startup outside tests.
- [x] AI API key encryption uses `FERNET_KEY` instead of `SECRET_KEY`.
- [x] 2FA enforcement exists for cookie-based sessions, with a `/api/auth/verify-2fa` endpoint.
- [x] Production indexes exist in Alembic migrations.
- [x] Gmail client uses an explicit httplib2 timeout instead of a global socket timeout.
- [x] Sync progress uses a bounded writer queue.
- [x] Task idempotency pruning and scheduler cleanup exist.
- [x] Dockerfile has an app healthcheck.
- [x] CI workflow exists.
- [x] Current dirty-tree backend tests pass.
- [x] Current dirty-tree backend lint and format checks pass.
- [x] Alembic has one head, `0040`.

## Release Gate

Public release should wait until all P0 items are complete and verified. A limited private beta is reasonable only after the full test suite, lint, frontend build, migrations, and browser smoke pass, with known limitations documented for single-instance queueing and Gmail/LLM operational risk.
