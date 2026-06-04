# Phase 1: Ready for 1,000 Users

**Effort:** ~10-12 days
**Target:** Reliable operation at 1,000 registered users, 100 concurrent
**Source:** `tasks/architecture-review.md` §13

---

## P1.1 — Redis-Backed Task Queue (2-3 days)
**Risk:** Architecture Review #1 — Sync scheduler falls behind at 500 users

- [ ] Replace in-memory `TaskQueue` with Redis-only queue (remove fallback path)
- [ ] Increase worker count to 10+ with configurable pool size
- [ ] Add per-user sync debounce (prevent duplicate sync tasks for same user)
- [ ] Add task timeout via `asyncio.wait_for(handler, timeout=300)`
- [ ] Add dead letter queue for permanently failed tasks
- [ ] Add retry logic with exponential backoff for transient failures
- [ ] Add task TTL-based cleanup with Redis SCAN (replace no-op `cleanup_idempotency`)
- [ ] Fix `_running_users` to use Redis SET for distributed sync serialization
- [ ] Add task health metrics (queue depth, processing time, failure rate)

**Verification:**
- [ ] Stress test: enqueue 1,000 sync tasks, verify all processed within 2h
- [ ] Restart test: verify in-flight tasks survive app restart (Redis persistence)
- [ ] Race test: fire 10 concurrent sync requests for same user, verify only 1 runs

---

## P1.2 — Redis-Backed Distributed Rate Limiter (2 days)
**Risk:** Architecture Review #2 — In-memory rate limiter per-process, bypassable

- [ ] Replace in-memory token bucket with Redis-based sliding window counter
- [ ] Use Redis sorted sets or INCR with expiry for atomic rate tracking
- [ ] Remove unverified JWT claim extraction — verify JWT signature first
- [ ] Fix `_extract_jwt_user_id` to decode with `verify_signature=True`
- [ ] Add cleanup job for stale Redis rate limit keys
- [ ] Ensure rate limit state survives restart and scales across workers
- [ ] Add rate limit metrics (hits, misses, violations)

**Verification:**
- [ ] Rate limit test: exceed limit with multiple worker processes, verify enforcement
- [ ] Restart test: verify rate limit state persists across restart
- [ ] JWT bypass test: forged JWT with arbitrary `sub` should not bypass limits

---

## P1.3 — Add Critical Missing Database Indexes (0.5 day)
**Risk:** Architecture Review #3 — Full table scans on every stats query

- [ ] Add expression index: `CREATE INDEX ix_transactions_lower_category ON transactions (LOWER(category))`
  - Affects 15+ stats query paths in `app/api/stats.py`
- [ ] Add composite index: `CREATE INDEX ix_transactions_user_txn_date ON transactions (email_id, txn_date)`
  - Covers all date-range + user queries via Email join
- [ ] Add composite index: `CREATE INDEX ix_transactions_user_created ON transactions (email_id, created_at)`
  - Covers all list/sort queries
- [ ] Add index: `CREATE INDEX ix_classification_log_email_id ON classification_log (email_id)`
  - Covers DELETE per-email and JOIN lookups
- [ ] Add indexes: `CREATE INDEX ix_duplicate_pairs_primary ON duplicate_pairs (primary_tx_id)`
  - Covers resolution OR-queries
- [ ] Add index: `CREATE INDEX ix_goal_contributions_contributed_at ON goal_contributions (contributed_at)`
- [ ] Add index: `CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at)`
- [ ] Turn dedup `func.abs(amount - X) <= tol` into range query: `amount >= X-tol AND amount <= X+tol`
  - Allows index usage on `amount` column

**Verification:**
- [ ] Run `EXPLAIN ANALYZE` on all stats queries before/after, verify index usage
- [ ] Measure stats API endpoint latency before/after (target: >5x improvement on 10K transaction users)

---

## P1.4 — Connection Pool Tuning (0.5 day)
**Risk:** Architecture Review #4 — 15 max connections insufficient

- [ ] Increase `DB_POOL_SIZE` from 5 to 20
- [ ] Increase `DB_MAX_OVERFLOW` from 10 to 30
- [ ] Add `pool_pre_ping=True` to engine kwargs (`app/database.py`)
- [ ] Add connection pool metrics logging at WARN level near exhaustion
- [ ] Consider separate pool sizes for sync workers vs API workers

**Verification:**
- [ ] Load test: 200 concurrent requests, verify no pool timeout errors
- [ ] Stale connection test: kill DB connections, verify pool recovers via pre-ping

---

## P1.5 — Redis-Backed Rollup Cache (1 day)
**Risk:** Architecture Review #5 — Per-process cache lost on restart, O(n) invalidation

- [ ] Replace global `_cache: dict` in `app/services/stats_service.py` with Redis-backed cache
- [ ] Use `aiocache` or `redis-py` with TTL (configurable, default 5 min)
- [ ] Fix cache invalidation from O(n) filter to O(1) Redis key deletion
- [ ] Store cache key pattern: `rollup:{user_id}:{period_type}:{period_key}`
- [ ] Invalidate on: transaction write, dedup resolution, batch action, reclassify
- [ ] Add cache hit/miss metrics

**Verification:**
- [ ] Warm cache: verify first request populates cache, subsequent requests use it
- [ ] Invalidation: verify dashboard reflects changes within TTL
- [ ] Restart: verify cold cache triggers recompute (expected), warm cache survives restart

---

## P1.6 — Async `recompute_month` (2-3 days)
**Risk:** Architecture Review #6 — 8+ aggregation queries block HTTP request path

- [ ] Move `recompute_month` from request handler to background task queue
- [ ] On transaction write: enqueue recompute task, return immediately to user
- [ ] Serve stale rollup data while recompute is in-flight (TTL-based staleness)
- [ ] Consolidate 8 separate aggregation queries into fewer combined queries:
  - `SUM(CASE WHEN ... THEN amount ELSE 0 END)` patterns
  - `COUNT(*) FILTER (WHERE ...)` patterns
- [ ] Merge `_compute_summary`'s 6 queries and `_compute_confidence`'s 5 queries similarly
- [ ] Add recompute dedup: if 3 writes happen within 5s, only recompute once
- [ ] Add recompute metrics (duration, queued count, failure rate)

**Verification:**
- [ ] Latency test: PATCH response time should drop from seconds to <50ms
- [ ] Consistency test: verify rollup eventually consistent within TTL window
- [ ] Concurrent write test: 10 simultaneous PATCH calls, verify correct final rollup

---

## P1.7 — Fix Progress Writer Queue (0.5 day)
**Risk:** Architecture Review #7 — 100-slot queue silently drops updates

- [ ] Increase `_progress_write_queue` maxsize from 100 to 1000
- [ ] Change flush interval from 2s to 1s for more frequent writes
- [ ] Or: replace in-memory queue with Redis Streams for reliable progress tracking
- [ ] Add overflow alerting (log at ERROR level when queue is near full)
- [ ] Add progress staleness detection: flag syncs with no progress update for >60s

**Verification:**
- [ ] Stress test: 100 concurrent syncs, verify all progress updates persisted
- [ ] Drop detection test: assert `QueueFull` never reached under expected load

---

## P1.8 — Migrate JWT from HS256 to RS256 (1 day)
**Risk:** Architecture Review #8 — Symmetric signing allows token forgery

- [ ] Generate RSA-2048 keypair (private + public)
- [ ] Update `app/jwt_utils.py`:
  - Add `_PRIVATE_KEY` and `_PUBLIC_KEY` loading from env vars or files
  - Change `_ALGORITHM` from `"HS256"` to `"RS256"`
  - Sign with private key, verify with public key
- [ ] Add key rotation support: allow old public key during transition
- [ ] Update config: add `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` env vars
- [ ] Add key validation at startup (reject weak/empty keys)
- [ ] Document key generation command in `.env.example`

**Verification:**
- [ ] Token round-trip: create token, decode with public key, verify claims
- [ ] Forgery test: token signed with wrong private key should fail verification
- [ ] Rotation test: tokens signed with old key should validate during transition window

---

## Phase 1 Exit Criteria

| Criterion | Target | Verification |
|-----------|--------|-------------|
| Sync scheduler throughput | 1,000 users in <2h | Queue drain time measurement |
| Rate limiter cross-process | Single shared limit across workers | Multi-worker bypass test |
| Stats API P95 latency | <500ms for 10K transaction users | EXPLAIN ANALYZE + load test |
| PATCH response time | <100ms (async recompute) | Bench endpoint before/after |
| JWT security | RS256, verified signature | Token forgery test |
| Cache hit rate | >90% on dashboard load | Cache metrics during load test |
| No data corruption | Duplicate amounts match expected | Dedup correctness test suite |
| Rollup consistency | Dashboard matches raw query | 100-sample random audit |

## Verification Checklist

- [ ] `pytest` passes (no regressions)
- [ ] `ruff` lint passes
- [ ] `mypy` type checks pass on affected files
- [ ] Frontend build succeeds (`npm run build`)
- [ ] Alembic migrations run cleanly (upgrade + downgrade)
- [ ] Integration test against Postgres + Redis in CI
- [ ] Coverage maintained at 60%+ (new code should target 80%+)

## Rollback Plan

- Database indexes: downgrade migration
- Code changes: revert commit + deploy
- Redis infrastructure: keep in-memory fallback temporarily (remove at end of phase)
- JWT RS256: deploy with dual key support; old HS256 tokens accepted during transition
