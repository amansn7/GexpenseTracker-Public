# Phase 1: Ready for 1,000 Users

**Source:** `tasks/phase-01-ready-1000-users.md`

---

## P1.3 — Add Critical Missing Database Indexes (0.5 day)
- [ ] Add expression index: `CREATE INDEX ix_transactions_lower_category ON transactions (LOWER(category))`
- [ ] Add composite index: `CREATE INDEX ix_transactions_user_txn_date ON transactions (email_id, txn_date)`
- [ ] Add composite index: `CREATE INDEX ix_transactions_user_created ON transactions (email_id, created_at)`
- [ ] Add index: `CREATE INDEX ix_classification_log_email_id ON classification_log (email_id)`
- [ ] Add indexes: `CREATE INDEX ix_duplicate_pairs_primary ON duplicate_pairs (primary_tx_id)`
- [ ] Add index: `CREATE INDEX ix_goal_contributions_contributed_at ON goal_contributions (contributed_at)`
- [ ] Add index: `CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)`
- [ ] Turn dedup `func.abs(amount - X) <= tol` into range query for index usage
- [ ] Run `EXPLAIN ANALYZE` on all stats queries before/after, verify index usage

## P1.4 — Connection Pool Tuning (0.5 day)
- [ ] Increase `DB_POOL_SIZE` from 5 to 20 in `app/config.py`
- [ ] Increase `DB_MAX_OVERFLOW` from 10 to 30
- [ ] Add `pool_pre_ping=True` to engine kwargs in `app/database.py`
- [ ] Add connection pool metrics logging at WARN level near exhaustion
- [ ] Load test: 200 concurrent requests, verify no pool timeout errors

## P1.7 — Fix Progress Writer Queue (0.5 day)
- [ ] Increase `_progress_write_queue` maxsize from 100 to 1000
- [ ] Change flush interval from 2s to 1s for more frequent writes
- [ ] Add overflow alerting (log at ERROR when queue is near full)
- [ ] Add progress staleness detection: flag syncs with no progress update for >60s

## P1.8 — Migrate JWT from HS256 to RS256 (1 day)
- [ ] Generate RSA-2048 keypair (add script to generate)
- [ ] Update `app/jwt_utils.py`: add private/public key loading, change algorithm to RS256
- [ ] Add key rotation support (allow old public key during transition)
- [ ] Update `app/config.py`: add `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` env vars
- [ ] Add key validation at startup (reject weak/empty keys)
- [ ] Document key generation command in `.env.example`
- [ ] Token round-trip test + forgery test

## P1.5 — Redis-Backed Rollup Cache (1 day)
- [ ] Replace global `_cache: dict` in `app/services/stats_service.py` with Redis-backed cache
- [ ] Use `redis-py` with TTL (configurable, default 5 min)
- [ ] Fix cache invalidation from O(n) filter to O(1) Redis key deletion
- [ ] Cache key pattern: `rollup:{user_id}:{period_type}:{period_key}`
- [ ] Invalidate on: transaction write, dedup resolution, batch action, reclassify
- [ ] Add cache hit/miss metrics

## P1.1 — Redis-Backed Task Queue (2-3 days)
- [ ] Replace in-memory `TaskQueue` with Redis-only queue (remove fallback path)
- [ ] Increase worker count to 10+ with configurable pool size
- [ ] Add per-user sync debounce (prevent duplicate sync tasks for same user)
- [ ] Add task timeout via `asyncio.wait_for(handler, timeout=300)`
- [ ] Add dead letter queue for permanently failed tasks
- [ ] Add retry logic with exponential backoff for transient failures
- [ ] Fix `_running_users` to use Redis SET for distributed sync serialization
- [ ] Add task health metrics (queue depth, processing time, failure rate)
- [ ] Stress test: 1,000 sync tasks, verify all processed within 2h

## P1.2 — Redis-Backed Distributed Rate Limiter (2 days)
- [ ] Replace in-memory token bucket with Redis-based sliding window counter
- [ ] Fix `_extract_jwt_user_id` to decode with `verify_signature=True`
- [ ] Add cleanup job for stale Redis rate limit keys
- [ ] Ensure rate limit state survives restart and scales across workers
- [ ] Add rate limit metrics (hits, misses, violations)

## P1.6 — Async `recompute_month` (2-3 days)
- [ ] Move `recompute_month` from request handler to background task queue
- [ ] On transaction write: enqueue recompute task, return immediately to user
- [ ] Serve stale rollup data while recompute is in-flight (TTL-based staleness)
- [ ] Consolidate 8 separate aggregation queries into combined queries
- [ ] Merge `_compute_summary`'s 6 queries and `_compute_confidence`'s 5 queries
- [ ] Add recompute dedup: if 3 writes happen within 5s, only recompute once
- [ ] Add recompute metrics (duration, queued count, failure rate)

---

## Verify
- [ ] `pytest` passes (no regressions)
- [ ] `ruff` lint passes
- [ ] Frontend build succeeds (`npm run build`)
- [ ] Alembic migrations run cleanly (upgrade + downgrade)
- [ ] Integration test against Postgres + Redis
