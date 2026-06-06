# P2.4 — DB Table Partitioning

**Goal:** Partition `transactions`, `emails`, and `classification_log` by month for unbounded table growth.

## Plan

### 1. Migration: 0059 — Create partitioned tables
- [x] Understand current state: models, FKs, migration patterns
- [x] Write migration `0059_partition_transactions_emails_classification_log.py`

### 2. Partition management module
- [x] Create `app/services/partition_manager.py`
- [x] Auto-create next month's partitions
- [x] Auto-drop partitions older than retention window (default 36mo)
- [x] Config: `DATA_RETENTION_MONTHS` in settings

### 3. Scheduler integration
- [x] Add `_partition_maintenance_job` to scheduler.py

### 4. Verify
- [x] Migration syntax valid (Python AST + ruff pass)
- [x] Partition manager module syntax valid
- [x] Scheduler integration syntax valid
- [x] Config change syntax valid
- [x] ruff passes on all modified files

### 5. Partition pruning audit
The following queries do NOT filter by date and scan all partitions:
- `build_confidence_query` (stats_queries.py:318) — all-time confidence aggregates
- `build_health_aggregation_query` (stats_queries.py:349) — all-time health
- `find_duplicates` (transactions.py:865) — all expense transactions
- `cc_accounts` (reconciliation.py:382) — all transactions for CC detection
- `list_low_confidence_transactions` (transactions.py:346) — no date filter, but LIMIT 50
These are noted but not changed — they're user-facing queries where adding a default date range could change behavior. The rollup tables (PeriodRollup) already back the stats endpoints for most views, so the full-table scans only affect confidence aggregates and CC detection.

### 6. Final summary of changes

**Files created:**
- `alembic/versions/0059_partition_transactions_emails_and_classification_log.py` — Migration to partition all 3 tables by month range. Covers: null fix, FK drop, partitioned table creation, monthly partition creation, data copy, table swap, index creation, and FK-like index replacement. Has full upgrade and downgrade, with SQLite fallback that adds performance indexes instead.
- `app/services/partition_manager.py` — Partition management service with `ensure_future_partitions()`, `drop_old_partitions()`, and `run_partition_maintenance()`. Auto-creates 3-month lookahead partitions. Drops partitions beyond `DATA_RETENTION_MONTHS` (default 36).
- `tasks/p2-4-partitioning-todo.md` — Task tracking.

**Files modified:**
- `app/scheduler.py` — Added daily `_partition_maintenance_job` that creates future partitions and cleans up old ones.
- `app/config.py` — Added `DATA_RETENTION_MONTHS: int = 36`.

**Migration upgrade path (PostgreSQL):**
1. Fix null `txn_date` and `received_at` (set to fallback dates)
2. Drop all FK constraints pointing to the 3 tables
3. Create `classification_log_partitioned` partitioned by RANGE (created_at) with 40 monthly partitions
4. Copy data via INSERT...SELECT
5. Create indexes and unique indices
6. DROP + RENAME to swap
7. Repeat for `emails` (partitioned by received_at) and `transactions` (partitioned by txn_date)
8. Create FK-replacement indexes on `duplicate_pairs` and `transaction_corrections`

**Migration downgrade path:**
1. Drop FK-replacement indexes
2. Reverse order: revert emails first (so regular PK available), then transactions (with FKs to emails), then classification_log

**Models:** No changes needed — they point to the same table names. Partitioning is transparent to SQLAlchemy.

**Partition naming:** `{table}_{year}_{month:02d}` (e.g. `transactions_2024_01`)

**Scheduler:** `_partition_maintenance_job` runs every 24 hours, commits if any partitions were created or dropped.
