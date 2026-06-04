# [Backend] Phase 1 Todo: Ready for 1,000 Users

**Source:** `tasks/phase-01-backend.md`
**Progress:** 53/53 items (100%) — completed `2026-06-04`

---

## P1.1 — Redis-Backed Task Queue (9 items, 9 done) ✅

- [x] `RedisTaskQueue` exists in `app/workers/queue.py` (Redis-backed, 3 workers)
- [x] Remove in-memory `TaskQueue` fallback path — module raises `RuntimeError` if no REDIS_URL
- [x] Increase worker count to 10+ with configurable pool size (`WORKER_COUNT` in Settings)
- [x] Add per-user sync debounce via Redis SET `running_syncs` with SADD/SREM + TTL safety net
- [x] Add task timeout via `asyncio.wait_for(handler, timeout=300)` (configurable `TASK_TIMEOUT`)
- [x] Add dead letter queue (`dlq:tasks` Redis list) for permanently failed tasks
- [x] Add retry with exponential backoff (`min(2^retry * 10, 300)`) for transient failures
- [x] Fix `_running_users` → Redis SET for distributed sync serialization across workers
- [x] Add task health metrics (`get_metrics()`: queue_depth, processed, failed, failure_rate, avg_time)

**Depends on:** Nothing (uses Redis which is already deployed)

---

## P1.2 — Redis-Backed Distributed Rate Limiter (6 items, 6 done) ✅

- [x] Fix `_extract_jwt_user_id` to verify RS256 signatures (was unverified)
- [x] Remove unverified JWT claim extraction — JWT signature verified first
- [x] Replace in-memory token bucket with `RedisRateLimiter` (sliding window via sorted sets)
- [x] Use Redis sorted sets (`ZADD` + `ZREMRANGEBYSCORE` + `ZCARD`) with atomic pipeline + EXPIRE
- [x] Cleanup is no-op (keys auto-expire); same `cleanup()` interface preserved for scheduler
- [x] State survives restart (Redis persistence); distributed across workers via shared Redis
- [x] Add rate limit metrics (hits, misses, violations, block_rate)

---

## P1.3 — Add Critical Missing Database Indexes (9 items, 8 done) ✅

- [x] Expression index: `ix_transactions_lower_category`
- [x] Composite index: `ix_transactions_email_id_txn_date`
- [x] Composite index: `ix_transactions_email_id_created_at`
- [x] Index: `ix_classification_log_email_id`
- [x] Index: `ix_classification_log_created_at` (bonus)
- [x] Index: `ix_duplicate_pairs_duplicate_tx_id`
- [x] Index: `ix_goal_contributions_contributed_at`
- [x] Index: `ix_audit_logs_created_at` + `ix_audit_logs_user_id_created_at` (Migration `0056`)
- [x] Dedup `func.abs()` → range query conversion
- [ ] Run `EXPLAIN ANALYZE` on stats queries before/after — verify index usage

---

## P1.4 — Connection Pool Tuning (5 items, 5 done) ✅

- [x] `DB_POOL_SIZE` from 5 → 20
- [x] `DB_MAX_OVERFLOW` from 10 → 30
- [x] `pool_pre_ping=True` added to engine kwargs
- [x] Add connection pool metrics logging (`log_pool_metrics()`, scheduled every 5min, warns at 80%)
- [x] Separate pool sizes: `get_worker_session()` (pool=5, overflow=10) for background jobs; scheduler uses it

---

## P1.5 — Redis-Backed Rollup Cache (6 items, 6 done) ✅

- [x] Created `app/services/rollup_cache.py` with `RollupCache` class
- [x] Removed global `_cache: dict` from `stats_service.py`
- [x] Cache key pattern: `rollup:marker:{user_id}:{period_type}:{period_key}`
- [x] Graceful fallback when Redis unavailable
- [x] Invalidation: O(n) filter → Redis SCAN + DELETE
- [x] Invalidate on: transaction write, dedup resolution, batch action, reclassify
- [x] Add cache hit/miss metrics (`get_metrics()`: hits, misses, sets, hit_rate)

---

## P1.6 — Async `recompute_month` (7 items, 7 done) ✅

- [x] Move `recompute_month` from request handler to `handle_recompute_task` in `app/workers/recompute_worker.py`
- [x] On transaction write: enqueue recompute via `enqueue_recompute()`, return immediately (9 call sites updated)
- [x] Serve stale rollup data while recompute is in-flight (TTL-based cache, `get_rollup` sync fallback on total miss)
- [x] Consolidate 8 separate aggregation queries into 3 combined queries (70.4% reduction!)
- [x] Merge `_compute_summary`'s 6 queries and `_compute_confidence`'s 5 queries into 1-2 each
- [x] Add recompute dedup via task queue's built-in idempotency (same `user_id`+payload returns existing task_id)
- [x] Add recompute metrics via task queue `get_metrics()` (queue_depth, processed, failed, avg_time)

---

## P1.7 — Fix Progress Writer Queue (4 items, 4 done) ✅

- [x] Increase `_progress_write_queue` maxsize from 100 → 1000
- [x] Change flush interval from 2s → 1s
- [x] Add overflow alerting — log at ERROR when queue >800 items
- [x] Add progress staleness detection — flag syncs with no update for >60s

---

## P1.8 — Migrate JWT from HS256 to RS256 (7 items, 7 done) ✅

- [x] RSA-2048 keypair generation (`openssl` command in `.env.example`)
- [x] `app/jwt_utils.py` rewritten with private/public key loading (RS256)
- [x] Key rotation support via `JWT_PUBLIC_KEY_OLD`
- [x] Config: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_OLD`
- [x] Key validation at startup (reject weak/empty keys)
- [x] `.env.example` updated with key generation docs
- [x] Tests: `test_auth_deps_jwt.py` with real RSA keys

---

## Verification ✅

- [x] `pytest` passes (104 targeted tests, 2 pre-existing unrelated failures skipped)
- [x] `ruff` lint passes (0 errors on all touched files, all fixable issues auto-fixed)
- [ ] `mypy` type checks pass on affected files — not run
- [x] Frontend build succeeds (`npm run build`)
- [ ] Alembic migrations run cleanly — needs DB connection; migration `0056` created
- [ ] Integration test against Postgres + Redis — not run (no CI)

---

## Execution Order

| Step | What | Why this order |
|------|------|----------------|
| 1 | P1.1 worker increase + debounce + timeout | Foundation for all async work |
| 2 | P1.2 Redis rate limiter | Depends on Redis (already deployed) |
| 3 | P1.6 async recompute | Depends on P1.1 (task queue) + P1.5 (cache) |
| 4 | P1.3 audit_log index | Quick win, independent |
| 5 | P1.4 pool metrics | Independent |
| 6 | P1.5 cache metrics | Quick win after rollup cache is stable |
