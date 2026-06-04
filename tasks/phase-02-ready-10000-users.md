# Phase 2: Ready for 10,000 Users

**Effort:** ~18-23 days
**Target:** Reliable operation at 10,000 registered users, 1,000 concurrent, 5× traffic spikes
**Source:** `tasks/architecture-review.md` §13

---

## P2.1 — Distributed Scheduling System (5-7 days)
**Risk:** Architecture Review — Scheduler fundamentally inadequate at scale

- [ ] Replace APScheduler-based sync scheduling with Celery/ARQ distributed scheduler
- [ ] Worker auto-scaling based on queue depth (more workers when backlogged)
- [ ] Adaptive sync intervals: users with frequent transactions sync more often
- [ ] Stagger sync start times to avoid thundering herd on Gmail API
- [ ] Add task prioritization (user-triggered sync > scheduled sync > fetch-range)
- [ ] Move dedup job to distributed scheduler as well
- [ ] Add scheduler health monitoring (missed ticks, backlog depth, worker count)
- [ ] Remove the redundant `asyncio.Semaphore(MAX_CONCURRENT_SYNCS)` — scheduler tasks already serialized by queue

**Verification:**
- [ ] Load test: 10,000 sync tasks, verify all processed within 2h window
- [ ] Backlog test: simulate failed workers, verify remaining workers redistribute
- [ ] Thundering herd test: verify Gmail API rate limits not exceeded at scheduler start

---

## P2.2 — Adaptive Dedup Job (2 days)
**Risk:** Dedup job runs sequentially over ALL users, never completes at 10K

- [ ] Track `last_dedup_scan_at` per user in SyncState or new column
- [ ] Only scan users with new transactions since last scan
- [ ] Add rate limiting: at most N dedup scans per minute globally
- [ ] Prioritize users with most unconfirmed duplicate pairs
- [ ] Move `scan_all_for_duplicates` to distributed scheduler
- [ ] Add dedup metrics (scan duration per user, pairs found, auto-resolved count)

**Verification:**
- [ ] Regression: verify at 100 users, all existing dedup behavior preserved
- [ ] Scale test: verify at 10K users, no user waits >1h for dedup scan
- [ ] Idempotency: verify duplicate pairs not created across overlapping scans

---

## P2.3 — Per-User LLM Budget (2 days)
**Risk:** $10/day shared budget means 10K users get ~$0.001/day each = rules-only

- [ ] Add `daily_llm_budget_cents` field to UserAIService or UserSettings
- [ ] Implement per-user daily spending cap in `LLMSpendTracker`
- [ ] Add configurable tiers: free ($0.01/day), pro ($0.10/day), unlimited
- [ ] Update `check_llm_budget` to check both global and per-user limits
- [ ] Add budget-exceeded notification in the UI (banner on inbox page)
- [ ] Add upgrade prompt linking to pricing when budget exceeded
- [ ] Track LLM spend at per-request granularity (not just per-batch)
- [ ] Fix in-memory `_spend` counter race condition (`client.py:55`)

**Verification:**
- [ ] Budget enforcement: verify user stops getting LLM classification after cap
- [ ] Tier switching: verify changing tier takes effect within 1 min
- [ ] Race condition: fire 10 concurrent classify calls, verify final spend is exact

---

## P2.4 — DB Table Partitioning (3-5 days)
**Risk:** Transactions/emails/classification_log grow unbounded; index scans degrade

- [ ] Partition `transactions` table by month (range partitioning on `txn_date`)
- [ ] Partition `emails` table by month (range partitioning on `received_at`)
- [ ] Partition `classification_log` by month (range partitioning on `created_at`)
- [ ] Add partition management job: auto-create next month's partitions
- [ ] Add partition pruning: ensure queries filter by date range (index-aware)
- [ ] Add data retention policy: auto-drop partitions older than configurable window
- [ ] Update Alembic migration to handle partition creation
- [ ] Test migration from non-partitioned to partitioned tables

**Verification:**
- [ ] Query planning: `EXPLAIN` shows partition pruning for date-filtered queries
- [ ] Migration: verify zero data loss during partition migration
- [ ] Performance: measure sequential scan reduction on historical data queries

---

## P2.5 — Fix Pre-Extraction Amount Override (0.5 day) 🔴 CRITICAL DATA CORRECTION
**Risk:** Classifier silently overrides correct LLM amount with wrong regex match

- [ ] In `app/classifier/classifier.py:554-557`: only use pre-extraction amount if:
  - LLM returned `amount` is `None`, OR
  - `confidence < AUTO_CONFIRM_THRESHOLD`, OR
  - LLM amount is NaN/0/negative
- [ ] Add validation: cross-check pre-extraction amount against LLM amount
  - If difference > 20% and both are non-null, set status to `needs_review`
- [ ] Store both LLM amount and pre-extraction amount in ClassificationLog for audit
- [ ] Fix `_rules_fallback_result` to use `rule_engine_adapter.extract()` for currency support
- [ ] Add currency conversion in the rules fallback path (`classifier.py:679-727`)
- [ ] Fix `_AMOUNT_RE` discrepancy between classifier.py and transaction_extractor.py

**Verification:**
- [ ] Regression: verify existing test suite still passes (amount extraction tests)
- [ ] Manual review: 100 random emails, compare old vs new amount extraction
- [ ] Currency test: INR-denominated email with $ in footer text — verify amount is INR

---

## P2.6 — Add Missing `recompute_month` Calls (0.5 day) 🔴 CRITICAL DATA CORRECTION
**Risk:** Multiple operations leave dashboard stale with no rollup recompute

- [ ] Add `recompute_month` call after duplicate resolution deletes a transaction:
  - `app/dedup/service.py:1203-1205` — after `await db.delete(discard_tx)`
- [ ] Add `recompute_month` call after batch action in review:
  - `app/api/review.py:350` — after `await db.commit()` in batch_action
- [ ] Add `recompute_month` call after manual reclassification creates transaction:
  - `app/api/transactions.py:732-822` — in reclassify endpoint
- [ ] Add rollup cache invalidation in `resolve_duplicate`:
  - `app/dedup/service.py` — after successful resolution
- [ ] Add integration test: verify rollup updates after each operation

**Verification:**
- [ ] Dedup resolution test: resolve duplicate, verify rollup amount changes immediately
- [ ] Batch action test: approve 50 transactions, verify dashboard updates
- [ ] Reclassification test: reclassify ignore→expense, verify rollup includes new amount

---

## P2.7 — Cursor-Based Pagination (1 day)
**Risk:** OFFSET pagination is O(N) at scale; degrades at 5K+ rows

- [ ] Add `cursor` parameter (base64-encoded `id|txn_date` pair) to `/api/transactions`
- [ ] Keep `offset`/`limit` for backward compatibility (deprecate with warning)
- [ ] Add `next_cursor` field in response for client-side pagination
- [ ] Ensure ORDER BY + cursor index pushdown (`WHERE (txn_date, id) > (cursor.txn_date, cursor.id)`)
- [ ] Update frontend pagination component to use cursor (when available)

**Verification:**
- [ ] Performance: measure P99 latency at page 1 vs page 100 (target: identical)
- [ ] Correctness: verify no skipped or duplicated rows with concurrent writes

---

## P2.8 — DB-Level UNIQUE Constraint on DuplicatePair (0.5 day)
**Risk:** Cross-process races create duplicate DuplicatePair rows

- [ ] Add DB-level UNIQUE constraint: `(primary_tx_id, duplicate_tx_id)`
- [ ] Add symmetric check: also check `(duplicate_tx_id, primary_tx_id)` to prevent mirrored pairs
- [ ] Handle `IntegrityError` gracefully in `detect_and_record_duplicates`
- [ ] Handle `IntegrityError` in `batch_detect_duplicates`
- [ ] Add preflight migration to clean up any existing duplicate pairs

**Verification:**
- [ ] Race test: fire 10 concurrent dedup calls for overlapping transactions
- [ ] Verify zero duplicate DuplicatePair rows after race test

---

## P2.9 — Scope DomainPairRule to User (2 days)
**Risk:** Cross-user dedup pollution — one user's corrections affect all

- [ ] Add `user_id` column to `domain_pair_rules` table (nullable FK)
- [ ] Migrate existing rows: set `user_id = NULL` for built-in global rules
- [ ] Update queries in `app/dedup/service.py` to filter by `user_id`:
  - `detect_and_record_duplicates` line 560
  - `batch_detect_duplicates` line 930
  - `resolve_duplicate` line 1155
- [ ] Add built-in rules that apply to all users (seed via migration or startup)
- [ ] Add per-user override: user can confirm/dismiss with their own counter
- [ ] Add migration to reset domain_pair_rules for affected users (optional migration path)

**Verification:**
- [ ] Isolation test: User A confirms a rule, User B should NOT see it
- [ ] Global fallback: verify built-in rules still apply to all users when no user-specific rule exists
- [ ] Migration test: verify existing data preserved and correctly assigned

---

## P2.10 — Auto-Audit Middleware (1 day)
**Risk:** Audit logging is opt-in; most state-changing operations not logged

- [ ] Add FastAPI middleware to automatically log all state-changing operations:
  - POST, PUT, PATCH, DELETE to `/api/*`
- [ ] Capture: user_id, action (HTTP method + path), resource_type, resource_id, timestamp, IP
- [ ] Add sensitive operation exclusions (password resets, token refreshes)
- [ ] Keep explicit `log_audit()` calls for operations needing custom details
- [ ] Add audit log TTL: auto-purge entries older than 90 days
- [ ] Add audit log query endpoint for admin (owner-only)
- [ ] Add retention policy to `_delete_expired_accounts` job

**Verification:**
- [ ] Coverage test: every state-changing endpoint should produce audit log entry
- [ ] Exclusion test: verify password-reset-like operations are not logged
- [ ] Retention test: verify old entries are purged by cleanup job

---

## Phase 2 Exit Criteria

| Criterion | Target | Verification |
|-----------|--------|-------------|
| Sync throughput | 10,000 users in <2h | Queue metrics during peak load |
| Dedup coverage | All users scanned within 1h | Per-user scan timestamps |
| Stats API P95 latency | <200ms | Load test with 10K transaction users |
| LLM budget per-user | Configurable, enforced | Budget test per tier |
| Dashboard consistency | Zero staleness >30s after mutation | Random audit of 100 transactions |
| Data corruption rate | Zero known paths | Regression test suite for all fixed items |
| Audit coverage | 100% of state-changing endpoints | Automated endpoint scan |

## Verification Checklist

- [ ] Full regression test suite passes
- [ ] Migration tests pass (upgrade + downgrade all phases)
- [ ] Integration tests against Postgres + Redis in CI
- [ ] Load test at 1,000 concurrent virtual users
- [ ] Data consistency audit (random sample of 1,000 transactions)
- [ ] Security audit: re-run JWT, rate limiter, CSRF tests
- [ ] Rollback test: verify Phase 2 items reversible to Phase 1 state
