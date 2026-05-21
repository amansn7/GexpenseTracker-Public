# Code Review Fix Implementation Plan

## Overview
Address 20 findings from the code review report, organized by priority (P0-P3). Each fix will be implemented, tested, and committed independently.

## Execution Strategy
- **P0 (Critical)**: Fix immediately — security and performance blockers
- **P1 (High)**: Fix this sprint — correctness and safety issues
- **P2 (Medium)**: Next sprint — maintainability and scalability
- **P3 (Low)**: Backlog — polish and best practices

Each item will:
1. Be implemented by a dedicated agent
2. Have tests written/updated
3. Pass existing tests before commit
4. Be committed atomically

---

## P0 — Critical (3 items)

### P0-1: Fix Docker Compose hardcoded credentials
**File**: `docker-compose.yml`
**Change**: Replace hardcoded `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` with env var references. Add `.env.example` with safe defaults.
**Test**: Verify docker-compose.yml parses correctly, env vars are referenced properly.
**Risk**: Low — purely configuration change.

### P0-2: Add DB indexes on query-hot columns
**Files**: `app/models/transaction.py`, `app/models/email.py`
**Change**: Add `index=True` to:
- `Transaction.email_id` (joined in almost every query)
- `Transaction.txn_date` (filtered in stats queries)
- `Transaction.label` (filtered in stats queries)
- `Transaction.status` (filtered in review queries)
- `Email.sender_domain` (used in dedup and review queries)
**Migration**: Create Alembic migration `0032_add_query_indexes.py`
**Test**: Verify migration runs, indexes exist after upgrade.
**Risk**: Low — additive change, no data migration needed.

### P0-3: Fix stats endpoints to use SQL aggregation
**File**: `app/api/stats.py`
**Change**: Replace Python-side `sum()` and `len()` with SQLAlchemy `func.sum()`, `func.count()` for:
- Total expenses
- Total income
- CC payments
- Investments
- Category breakdowns
**Test**: Verify stats API returns identical values, check query plan shows aggregation in SQL.
**Risk**: Medium — must verify numerical parity with existing behavior.

---

## P1 — High (5 items)

### P1-4: Move raw ALTER TABLE to Alembic migrations
**Files**: `app/main.py`, `alembic/versions/0033_move_startup_ddl_to_alembic.py`
**Change**: 
- Create Alembic migration for the `ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS user_id` statement
- Remove raw SQL from `app/main.py` lifespan
**Test**: Verify migration runs on fresh and existing databases, app starts without errors.
**Risk**: Medium — must ensure idempotency for existing deployments.

### P1-5: Add rate limiting to sensitive endpoints
**Files**: `app/main.py`, `app/rate_limiter.py`
**Change**: Add rate limiting decorators to:
- `POST /api/sync/backfill-bodies`
- `POST /api/admin/reset-my-data`
- `PATCH /api/account/schedule-deletion`
**Test**: Verify rate limit triggers after threshold, normal requests pass.
**Risk**: Low — additive middleware.

### P1-6: Fix blocking time.sleep() in async Gmail client
**File**: `app/gmail/client.py`
**Change**: Convert `_retry_with_backoff` from sync `time.sleep()` to async `await asyncio.sleep()`. Ensure all callers use `await`.
**Test**: Verify retry behavior works, event loop is not blocked during retries.
**Risk**: Medium — must verify all call paths are updated.

### P1-7: Enforce 2FA check during authentication
**Files**: `app/auth_deps.py`, `app/api/auth.py`
**Change**: After password verification, check `user.totp_enabled` and require valid TOTP code. Add TOTP header/query param to login endpoint.
**Test**: Verify login fails without TOTP when enabled, succeeds with valid TOTP.
**Risk**: High — could lock out users if not implemented carefully. Need graceful migration path.

### P1-8: Paginate transaction export
**File**: `app/api/transactions.py`
**Change**: Replace full-table load with date-range filtered query. Add pagination parameters. Stream CSV output if possible.
**Test**: Verify export returns correct data for date ranges, handles large datasets without memory issues.
**Risk**: Low — additive parameters, backward compatible.

---

## P2 — Medium (4 items)

### P2-9: Deduplicate score_pair methods in dedup service
**File**: `app/dedup/service.py`
**Change**: Extract shared scoring logic into `_compute_score()` function. Inject rule lookup as a callable parameter. Remove duplication between `_score_pair()` and `_score_pair_with_rules()`.
**Test**: Verify dedup results are identical before and after refactoring.
**Risk**: Medium — refactoring risk, must verify behavioral parity.

### P2-10: Decompose large API files
**Files**: `app/api/transactions.py`, `app/api/settings.py`, `app/api/stats.py`
**Change**: Split each large file into sub-modules:
- `app/api/transactions/` → `crud.py`, `export.py`, `bulk.py`, `routes.py`
- `app/api/settings/` → `profile.py`, `preferences.py`, `routes.py`
- `app/api/stats/` → `aggregations.py`, `trends.py`, `routes.py`
**Test**: Verify all endpoints still work, imports resolve correctly.
**Risk**: Medium — many import changes, must verify no regressions.

### P2-13: Persist sync progress to DB
**Files**: `app/sync/progress.py`, `app/models/sync_progress.py`
**Change**: Replace in-memory `_sync_progress` dict with DB-backed `SyncProgress` model. Add read/write methods that use the session.
**Test**: Verify progress survives restart, concurrent access is safe.
**Risk**: Medium — changes sync behavior, must verify no race conditions.

### P2-14: Reduce classify_email parameter count
**File**: `app/classifier/classifier.py`
**Change**: Create `ClassificationContext` dataclass with all 14 parameters. Update `classify_email` signature to accept context object.
**Test**: Verify classification results are identical, all callers updated.
**Risk**: Medium — affects many call sites, must update all callers.

---

## P3 — Low (3 items)

### P3-16: Remove unsafe-inline from CSP
**File**: `app/main.py`
**Change**: Replace `'unsafe-inline'` with nonce-based CSP. Generate nonce per request, inject into script tags.
**Test**: Verify frontend loads correctly, CSP headers contain nonce.
**Risk**: Medium — requires frontend script tag updates.

### P3-17: Configure DB connection pool
**File**: `app/database.py`, `app/config.py`
**Change**: Add `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `DB_POOL_TIMEOUT` to config. Pass to `create_engine()`.
**Test**: Verify pool settings are applied, app handles connection exhaustion gracefully.
**Risk**: Low — additive configuration.

### P3-18: Standardize role checks
**Files**: `app/api/admin.py`, `app/api/auth.py`, and others
**Change**: Replace all string `"owner"` checks with `UserRole.owner` enum. Add helper function `is_owner(user)`.
**Test**: Verify admin endpoints still work, role checks are consistent.
**Risk**: Low — purely refactoring.

---

## Plan Review Notes (after code inspection)

### Corrections from actual code:
1. **P0-1**: Also need to fix `DATABASE_URL` in app service (line 29) which has hardcoded `expense:expense`
2. **P0-2**: `Email.user_id` already has `index=True`. `SyncState.user_id` also has `index=True`. Only need indexes on: `Transaction.email_id`, `Transaction.txn_date`, `Transaction.label`, `Transaction.status`, `Email.sender_domain`
3. **P0-3**: `stats_health` already uses `func.sum()` correctly. The issue is in `stats_summary` (lines 92-145) and `_monthly_data` (lines 269-290). Income aggregation uses Python-side `_effective_month()` which can't be moved to SQL easily — only expense/cc/investment totals should use `func.sum()`.
4. **P1-6**: `time.sleep()` appears at lines 39, 51 (in `_retry_with_backoff`), 410, 463, 469 (in fetch loops). All need conversion to async.
5. **P2-13**: `SyncProgress` model already exists at `app/models/sync_progress.py`. Need to wire it into `app/sync/progress.py`.
6. **P2-10**: Decomposing large files is high-risk. Will scope to splitting `stats.py` only (most impactful for P0-3 fix).

### Execution order refined:
```
Wave 1 (P0): P0-1 → P0-2 → P0-3
Wave 2 (P1): P1-4 → P1-6 → P1-5 → P1-8
Wave 3 (P2): P2-9 → P2-13 → P2-14
Wave 4 (P3): P3-17 → P3-18
Skipped: P1-7 (2FA - high risk, needs user discussion), P2-10 (too broad), P3-16 (requires frontend changes)
```

## Execution Order

```
Wave 1 (P0): P0-1 → P0-2 → P0-3
Wave 2 (P1): P1-4 → P1-6 → P1-5 → P1-8 → P1-7
Wave 3 (P2): P2-9 → P2-14 → P2-13 → P2-10
Wave 4 (P3): P3-17 → P3-18 → P3-16
```

## Testing Strategy
- Run `pytest` after each change
- Verify no regressions in existing tests
- Add new tests for each fix
- Manual smoke test for critical paths (login, sync, stats)

## Rollback Plan
Each change is committed atomically. If any change breaks tests:
1. Revert the specific commit
2. Investigate and fix
3. Re-commit
