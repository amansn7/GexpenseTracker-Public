# [Backend] Phase 2 Todo: Ready for 10,000 Users

**Source:** `tasks/phase-02-backend.md`
**Progress:** ✅ All items complete (All 10 sections)
**Depends on:** Phase 1 completion (P1.1, P1.2, P1.5, P1.6)

---

## P2.1 — Distributed Scheduling System (5-7 days)

- [x] Replace APScheduler-based sync scheduling with Celery/ARQ distributed scheduler
- [x] Worker auto-scaling based on queue depth (more workers when backlogged)
- [x] Adaptive sync intervals: users with frequent transactions sync more often
- [x] Stagger sync start times to avoid thundering herd on Gmail API
- [x] Add task prioritization (user-triggered sync > scheduled sync > fetch-range)
- [x] Move dedup job to distributed scheduler
- [x] Add scheduler health monitoring (missed ticks, backlog depth, worker count)
- [x] Remove redundant `asyncio.Semaphore(MAX_CONCURRENT_SYNCS)` — serialized by queue

**Verification:**
- [x] Load test: 10,000 sync tasks processed within 2h
- [x] Backlog test: failed workers → remaining workers redistribute
- [x] Thundering herd test: Gmail API rate limits not exceeded at scheduler start

---

## P2.2 — Adaptive Dedup Job (2 days)

- [x] Track `last_dedup_scan_at` per user in SyncState or new column
- [x] Only scan users with new transactions since last scan
- [x] Add rate limiting: N dedup scans per minute globally
- [x] Prioritize users with most unconfirmed duplicate pairs
- [x] Move `scan_all_for_duplicates` to distributed scheduler
- [x] Add dedup metrics (scan duration per user, pairs found, auto-resolved count)

**Verification:**
- [x] Regression: 100 users, existing dedup behavior preserved
- [x] Scale: 10K users, no user waits >1h for dedup scan
- [x] Idempotency: no duplicate pairs across overlapping scans

---

## P2.3 — Per-User LLM Budget (2 days)

- [x] Add `daily_llm_budget_cents` field to UserAIService or UserSettings
- [x] Implement per-user daily spending cap in `LLMSpendTracker`
- [x] Add configurable tiers: free ($0.01/day), pro ($0.10/day), unlimited
- [x] Update `check_llm_budget` to check both global and per-user limits
- [x] Add budget-exceeded notification UI (banner on inbox page)
- [x] Add upgrade prompt linking to pricing when budget exceeded
- [x] Track LLM spend at per-request granularity (not just per-batch)
- [x] Fix in-memory `_spend` counter race condition (`client.py:55`)

**Verification:**
- [x] Budget enforcement: user stops getting LLM classification after cap
- [x] Tier switching: tier change takes effect within 1 min
- [x] Race condition: 10 concurrent classify calls, final spend is exact

---

## P2.4 — DB Table Partitioning (3-5 days)

- [x] Partition `transactions` by month (range on `txn_date`)
- [x] Partition `emails` by month (range on `received_at`)
- [x] Partition `classification_log` by month (range on `created_at`)
- [x] Add partition management job: auto-create next month's partitions
- [x] Add partition pruning: ensure queries filter by date range
- [x] Add data retention policy: auto-drop partitions older than window
- [x] Update Alembic migration for partition creation
- [x] Test migration from non-partitioned to partitioned tables

**Verification:**
- [x] `EXPLAIN` shows partition pruning for date-filtered queries
- [x] Zero data loss during partition migration
- [x] Sequential scan reduction on historical data queries

---

## P2.5 — Fix Pre-Extraction Amount Override 🔴 CRITICAL DATA CORRECTION (0.5 day)

- [x] Only use pre-extraction amount if LLM amount is None, confidence < threshold, or NaN/0/negative (`classifier.py:554-557`)
- [x] Add cross-check validation: difference >20% → set `needs_review`
- [x] Store both LLM amount and pre-extraction amount in `ClassificationLog`
- [x] Fix `_rules_fallback_result` to use `rule_engine_adapter.extract()` for currency
- [x] Add currency conversion in rules fallback path (`classifier.py:679-727`)
- [x] Fix `_AMOUNT_RE` discrepancy between `classifier.py` and `transaction_extractor.py`

**Verification:**
- [x] Regression: existing amount extraction tests pass
- [x] Manual: 100 random emails, compare old vs new amounts
- [x] Currency test: INR email with $ in footer → amount is INR

---

## P2.6 — Add Missing `recompute_month` Calls 🔴 CRITICAL DATA CORRECTION (0.5 day)

- [x] Add `recompute_month` after duplicate resolution deletes transaction (`dedup/service.py:1203-1205`)
- [x] Add `recompute_month` after batch action in review (`api/review.py:350`)
- [x] Add `recompute_month` after manual reclassification creates transaction (`api/transactions.py:732-822`)
- [x] Add rollup cache invalidation in `resolve_duplicate` (`dedup/service.py`)
- [x] Add integration test: verify rollup updates after each operation

**Verification:**
- [x] Dedup resolution: rollup amount changes immediately
- [x] Batch action: approve 50 transactions, dashboard updates
- [x] Reclassification: ignore→expense, rollup includes new amount

---

## P2.7 — Cursor-Based Pagination (1 day)

- [x] Add `cursor` parameter (base64 `id|txn_date`) to `/api/transactions`
- [x] Keep `offset`/`limit` for backward compatibility (deprecate with warning)
- [x] Add `next_cursor` field in response
- [x] Ensure cursor index pushdown: `WHERE (txn_date, id) > (cursor.txn_date, cursor.id)`
- [x] Update frontend pagination component to use cursor

**Verification:**
- [x] P99 latency identical at page 1 vs page 100
- [x] No skipped/duplicated rows with concurrent writes

---

## P2.8 — DB-Level UNIQUE Constraint on DuplicatePair (0.5 day)

- [x] Add UNIQUE constraint: `(primary_tx_id, duplicate_tx_id)`
- [x] Add symmetric check: prevent mirrored `(duplicate_tx_id, primary_tx_id)` pairs
- [x] Handle `IntegrityError` gracefully in `detect_and_record_duplicates`
- [x] Handle `IntegrityError` in `batch_detect_duplicates`
- [x] Preflight migration: clean up existing duplicate pairs

**Verification:**
- [x] Race test: 10 concurrent dedup calls → zero duplicate rows

---

## P2.9 — Scope DomainPairRule to User (2 days)

- [x] Add `user_id` column to `domain_pair_rules` (nullable FK)
- [x] Migrate existing rows: `user_id = NULL` for built-in global rules
- [x] Update `detect_and_record_duplicates` to filter by `user_id`
- [x] Update `batch_detect_duplicates` to filter by `user_id`
- [x] Update `resolve_duplicate` to filter by `user_id`
- [x] Add built-in rules that apply to all users (seed via migration)
- [x] Add per-user override: user can confirm/dismiss with their own counter

**Verification:**
- [x] Isolation: User A's rule not visible to User B
- [x] Global fallback: built-in rules apply when no user-specific rule exists
- [x] Migration: existing data preserved and correctly assigned

---

## P2.10 — Auto-Audit Middleware (1 day)

- [x] Add FastAPI middleware for all state-changing operations (POST/PUT/PATCH/DELETE to `/api/*`)
- [x] Capture: user_id, action, resource_type, resource_id, timestamp, IP
- [x] Add sensitive operation exclusions (password resets, token refreshes)
- [x] Keep explicit `log_audit()` calls for operations needing custom details
- [x] Add audit log TTL: auto-purge entries older than 90 days
- [x] Add audit log query endpoint for admin (owner-only)
- [x] Add retention policy to `_delete_expired_accounts` job

**Verification:**
- [x] Coverage: every state-changing endpoint produces audit log entry
- [x] Exclusion: password-reset-like operations are not logged
- [x] Retention: old entries purged by cleanup job

---

## Execution Order

| Step | Item | Why this order |
|------|------|----------------|
| 1 | P2.5 Pre-extraction fix 🔴 | Data corruption fix, independent |
| 2 | P2.6 Missing recompute calls 🔴 | Data corruption fix, independent |
| 3 | P2.8 DuplicatePair UNIQUE | Prevents data corruption race |
| 4 | P2.1 Distributed scheduler | Foundation for scale |
| 5 | P2.2 Adaptive dedup | Depends on P2.1 scheduler |
| 6 | P2.9 Scope DomainPairRule | Isolation after dedup infra |
| 7 | P2.3 Per-user LLM budget | After sync infrastructure stable |
| 8 | P2.7 Cursor pagination | Performance, independent |
| 9 | P2.4 Table partitioning | Data management, independent |
| 10 | P2.10 Auto-audit | Observability, independent |
