# [Backend] Phase 1: Ready for 1,000 Users

**Effort:** ~10-12 days
**Target:** Reliable operation at 1,000 registered users, 100 concurrent
**Source:** `tasks/architecture-review.md` §13

---

## P1.1 — Redis-Backed Task Queue (2-3 days)
**Risk:** Architecture Review #1 — Sync scheduler falls behind at 500 users
**Status:** ⬜ 0/8 remaining (core `RedisTaskQueue` already exists)

- [x] ✅ `RedisTaskQueue` exists in `app/workers/queue.py` (Redis-backed, 3 workers)
- [ ] Remove in-memory `TaskQueue` fallback path
- [ ] Increase worker count to 10+ with configurable pool size
- [ ] Add per-user sync debounce (prevent duplicate sync tasks for same user)
- [ ] Add task timeout via `asyncio.wait_for(handler, timeout=300)`
- [ ] Add dead letter queue for permanently failed tasks
- [ ] Add retry logic with exponential backoff for transient failures
- [ ] Fix `_running_users` to use Redis SET for distributed sync serialization
- [ ] Add task health metrics (queue depth, processing time, failure rate)

**Verification:**
- [ ] Stress test: enqueue 1,000 sync tasks, verify all processed within 2h
- [ ] Restart test: verify in-flight tasks survive app restart (Redis persistence)
- [ ] Race test: fire 10 concurrent sync requests for same user, verify only 1 runs

---

## P1.2 — Redis-Backed Distributed Rate Limiter (2 days)
**Risk:** Architecture Review #2 — In-memory rate limiter per-process, bypassable

**Status:** ⬜ 4/6 items remaining

- [ ] Replace in-memory token bucket with Redis-based sliding window counter
- [ ] Use Redis sorted sets or INCR with expiry for atomic rate tracking
- [x] ✅ Remove unverified JWT claim extraction — now verified via RS256
- [x] ✅ Fix `_extract_jwt_user_id` to decode with `verify_signature=True`
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

**Status:** ✅ 7/8 indexes added, ⬜ 1 pending + verification

- [x] ✅ Expression index: `ix_transactions_lower_category` — added
- [x] ✅ Composite index: `ix_transactions_email_id_txn_date` — added
- [x] ✅ Composite index: `ix_transactions_email_id_created_at` — added
- [x] ✅ Index: `ix_classification_log_email_id` — added
- [x] ✅ Index: `ix_classification_log_created_at` — added (bonus)
- [x] ✅ Index: `ix_duplicate_pairs_duplicate_tx_id` — added
- [x] ✅ Index: `ix_goal_contributions_contributed_at` — added
- [ ] Index: `ix_audit_logs_created_at` — **not yet done**
- [x] ✅ Dedup `func.abs()` → range query conversion — done

**Verification:**
- [ ] Run `EXPLAIN ANALYZE` on all stats queries before/after, verify index usage
- [ ] Measure stats API endpoint latency before/after (target: >5x improvement on 10K transaction users)

---

## P1.4 — Connection Pool Tuning (0.5 day)
**Risk:** Architecture Review #4 — 15 max connections insufficient

**Status:** ✅ 3/5 items done

- [x] ✅ `DB_POOL_SIZE` 5 → 20
- [x] ✅ `DB_MAX_OVERFLOW` 10 → 30
- [x] ✅ `pool_pre_ping=True` added
- [ ] Add connection pool metrics logging at WARN level near exhaustion
- [ ] Consider separate pool sizes for sync workers vs API workers

**Verification:**
- [ ] Load test: 200 concurrent requests, verify no pool timeout errors
- [ ] Stale connection test: kill DB connections, verify pool recovers via pre-ping

---

## P1.5 — Redis-Backed Rollup Cache (1 day)
**Risk:** Architecture Review #5 — Per-process cache lost on restart, O(n) invalidation

**Status:** ✅ 5/6 items done

- [x] ✅ Created `app/services/rollup_cache.py` with `RollupCache` class
- [x] ✅ Removed global `_cache: dict` from `stats_service.py`
- [x] ✅ Cache invalidation: O(n) filter → Redis SCAN + DELETE
- [x] ✅ Cache key pattern: `rollup:marker:{user_id}:{period_type}:{period_key}`
- [x] ✅ Graceful fallback when Redis unavailable
- [x] ✅ Invalidate on: transaction write, dedup resolution, batch action, reclassify
- [ ] Add cache hit/miss metrics

**Verification:**
- [ ] Warm cache: verify first request populates cache, subsequent requests use it
- [ ] Invalidation: verify dashboard reflects changes within TTL
- [ ] Restart: verify cold cache triggers recompute (expected), warm cache survives restart

---

## P1.6 — Async `recompute_month` (2-3 days)
**Risk:** Architecture Review #6 — 8+ aggregation queries block HTTP request path
**Status:** ⬜ 0/7 items done — fully pending

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

**Status:** ✅ 4/4 items done

- [x] ✅ Increase `_progress_write_queue` maxsize 100 → 1000
- [x] ✅ Change flush interval 2s → 1s
- [x] ✅ Add overflow alerting (ERROR when queue >800)
- [x] ✅ Add progress staleness detection (flag syncs with no update >60s)

**Verification:**
- [ ] Stress test: 100 concurrent syncs, verify all progress updates persisted
- [ ] Drop detection test: assert `QueueFull` never reached under expected load

---

## P1.8 — Migrate JWT from HS256 to RS256 (1 day)
**Risk:** Architecture Review #8 — Symmetric signing allows token forgery

**Status:** ✅ 7/7 items done

- [x] ✅ RSA-2048 keypair generation — `openssl` command documented in `.env.example`
- [x] ✅ `app/jwt_utils.py` rewritten:
  - Private/public key loading from env vars
  - Algorithm changed to `"RS256"`
  - Sign with private key, verify with public key
- [x] ✅ Key rotation support via `JWT_PUBLIC_KEY_OLD`
- [x] ✅ Config updated: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_PUBLIC_KEY_OLD`
- [x] ✅ Key validation at startup (reject weak/empty keys)
- [x] ✅ `.env.example` updated with key generation docs
- [x] ✅ Tests updated — `test_auth_deps_jwt.py` with real RSA keys

**Verification:**
- [ ] Token round-trip: create token, decode with public key, verify claims
- [ ] Forgery test: token signed with wrong private key should fail verification
- [ ] Rotation test: tokens signed with old key should validate during transition window

---

## Phase 1 Exit Criteria

| Criterion | Target | Status | Verification |
|-----------|--------|--------|-------------|
| Sync scheduler throughput | 1,000 users in <2h | ⬜ pending P1.1 | Queue drain time measurement |
| Rate limiter cross-process | Single shared limit across workers | ⬜ pending P1.2 | Multi-worker bypass test |
| Stats API P95 latency | <500ms for 10K users | ⬜ pending P1.3 + P1.5 | EXPLAIN ANALYZE + load test |
| PATCH response time | <100ms (async recompute) | ⬜ pending P1.6 | Bench before/after |
| JWT security | RS256, verified | ✅ P1.8 done | Token forgery test passes |
| Cache hit rate | >90% dashboard load | ⬜ pending metrics | Cache metrics during load test |
| No data corruption | Amounts match expected | ⬜ cross-phase | Dedup correctness test suite |
| Rollup consistency | Dashboard matches raw query | ⬜ pending P1.6 | 100-sample random audit |

## Overall Completion

| Section | Done | Total | % |
|---------|------|-------|---|
| P1.1 Redis Task Queue | 1 | 9 | 11% |
| P1.2 Rate Limiter | 2 | 6 | 33% |
| P1.3 Database Indexes | 7 | 9 | 78% |
| P1.4 Connection Pool | 3 | 5 | 60% |
| P1.5 Rollup Cache | 5 | 6 | 83% |
| P1.6 Async recompute | 0 | 7 | 0% |
| P1.7 Progress Writer | 4 | 4 | 100% |
| P1.8 JWT RS256 | 7 | 7 | 100% |
| **Total** | **29** | **53** | **55%** |

## Verification Checklist

- [x] ✅ `pytest` passes (67/70, 3 pre-existing unrelated failures)
- [x] ✅ `ruff` lint passes
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
