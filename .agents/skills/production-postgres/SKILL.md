---
name: production-postgres
description: "PostgreSQL production patterns — safe migrations, indexing strategies, connection pooling, schema design, and query optimization. Use this skill when the user is working with PostgreSQL, writing database migrations (Alembic, Django migrations, raw SQL), designing database schemas, optimizing queries, setting up connection pooling (PgBouncer, asyncpg), or asks about database best practices. Triggers on SQL files, migration files, SQLAlchemy models, Django models, or Prisma schemas that target PostgreSQL."
---

# Production PostgreSQL

This skill encodes battle-tested PostgreSQL patterns for zero-downtime deployments, safe schema evolution, and production-grade performance. Every recommendation comes from real outage post-mortems.

---

## 1. Migration Safety

**This is the most critical section. Unsafe migrations are the #1 cause of production database outages.**

### The Golden Rule

Every migration MUST be safe for zero-downtime rolling deploys. Old code and new code run simultaneously during deploy windows. If a migration breaks old code, you get downtime.

### Lock Timeout on Every Migration

```sql
-- First statement in every migration
SET lock_timeout = '2s';
```

If you can't acquire the lock in 2 seconds, FAIL. Never let a migration queue behind a long-running query and block all subsequent queries. In Alembic:

```python
def upgrade():
    op.execute("SET lock_timeout = '2s'")
    # ... rest of migration
```

### Never: Add NOT NULL Column With DEFAULT on Large Tables

This takes an `ACCESS EXCLUSIVE` lock and rewrites the entire table:

```python
# DANGEROUS - locks table for minutes/hours on large tables
op.add_column('users', sa.Column('status', sa.String(), nullable=False, server_default='active'))
```

Safe pattern (3-step):

```python
# Migration 1: Add nullable column
def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.add_column('users', sa.Column('status', sa.String(), nullable=True))

# Migration 2: Backfill in batches (run as data migration or script)
def upgrade():
    conn = op.get_bind()
    while True:
        result = conn.execute(text(
            "UPDATE users SET status = 'active' "
            "WHERE id IN (SELECT id FROM users WHERE status IS NULL LIMIT 1000)"
        ))
        if result.rowcount == 0:
            break

# Migration 3: Add NOT NULL constraint
def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT users_status_not_null "
        "CHECK (status IS NOT NULL) NOT VALID"
    )
    # Validate in separate transaction (takes ShareUpdateExclusiveLock, not ACCESS EXCLUSIVE)
    op.execute("ALTER TABLE users VALIDATE CONSTRAINT users_status_not_null")
```

### Always: CREATE INDEX CONCURRENTLY

Regular `CREATE INDEX` locks the table for writes. `CONCURRENTLY` does not, but it cannot run inside a transaction:

```python
# In Alembic - must disable transaction wrapping
from alembic import op

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_user_id "
        "ON orders (user_id)"
    )

# CRITICAL: This migration must not be in a transaction
# Add this to the migration file top level or use:
# with op.get_context().autocommit_block():
```

### Never: Rename Columns in a Single Migration

Old code references the old column name. New code references the new name. During rolling deploy, one of them breaks.

Expand-contract pattern:
1. **Migration 1**: Add new column, backfill, add trigger to sync both columns
2. **Deploy**: Update all code to read/write new column
3. **Migration 2**: Drop old column and trigger

### Constraints: NOT VALID Then VALIDATE

Adding a constraint scans the entire table under a strong lock. Split it:

```sql
-- Fast: adds constraint but doesn't verify existing rows (weak lock)
ALTER TABLE orders ADD CONSTRAINT orders_amount_positive
  CHECK (amount > 0) NOT VALID;

-- Slow but safe: validates existing rows (ShareUpdateExclusiveLock, allows writes)
ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive;
```

### Foreign Keys Follow the Same Pattern

```sql
ALTER TABLE orders ADD CONSTRAINT orders_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;

ALTER TABLE orders VALIDATE CONSTRAINT orders_user_fk;
```

See [references/migration-safety.md](references/migration-safety.md) for complete patterns including column type changes, table renames, and rollback strategies.

---

## 2. Connection Pooling

### PgBouncer: Default Recommendation for Web Apps

Use **transaction mode** pooling. Each connection returns to the pool after each transaction.

```ini
; pgbouncer.ini
[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
```

**Pool sizing**: Start at 20-30 for OLTP. Monitor `cl_waiting` in `SHOW POOLS` -- if consistently > 0, increase. PostgreSQL degrades past ~100-200 active connections.

**Transaction mode breaks**: prepared statements, advisory locks, SET commands, LISTEN/NOTIFY, temporary tables (all session-scoped). Use PgBouncer 1.21+ `max_prepared_statements` for prepared statement support.

### asyncpg Pool for Python Async

For fully async apps (FastAPI/Starlette), asyncpg's built-in pool avoids the PgBouncer hop:

```python
pool = await asyncpg.create_pool(
    dsn="postgresql://user:pass@localhost/myapp",
    min_size=5, max_size=20,
    max_inactive_connection_lifetime=300.0, command_timeout=30.0,
)
```

### SQLAlchemy Pool Configuration

```python
engine = create_engine(
    "postgresql+psycopg2://user:pass@localhost/myapp",
    pool_size=10, max_overflow=5,
    pool_pre_ping=True, pool_recycle=3600, pool_timeout=30,
)
```

### Kill Stalled Connections

```sql
ALTER DATABASE myapp SET idle_in_transaction_session_timeout = '30s';
ALTER DATABASE myapp SET statement_timeout = '30s';
```

---

## 3. Indexing Strategies

### Always Index Foreign Keys

PostgreSQL does NOT automatically index foreign keys. Without an index:
- JOINs on the FK do sequential scans
- `ON DELETE CASCADE` on the parent locks the child table and scans it fully

```sql
-- For every FK column, add this:
CREATE INDEX CONCURRENTLY ix_orders_user_id ON orders (user_id);
```

### Composite Index Ordering

Put the most selective column first. Match your query patterns:

```sql
-- Query: WHERE tenant_id = ? AND created_at > ?
-- Good: matches equality first, then range
CREATE INDEX ix_orders_tenant_created ON orders (tenant_id, created_at);

-- Bad: range on first column means second column can't use the index efficiently
CREATE INDEX ix_orders_bad ON orders (created_at, tenant_id);
```

### Partial Indexes

Save space and speed by indexing only the rows you query:

```sql
-- Only index active users (90% of queries filter on active = true)
CREATE INDEX ix_users_active_email ON users (email) WHERE active = true;

-- Soft-delete pattern: index only non-deleted rows
CREATE INDEX ix_orders_not_deleted ON orders (user_id, created_at)
  WHERE deleted_at IS NULL;
```

### JSONB Indexes (GIN)

```sql
-- Index all keys and values for @>, ?, ?| operators
CREATE INDEX ix_events_metadata ON events USING GIN (metadata);

-- Index a specific JSON path for equality lookups
CREATE INDEX ix_events_type ON events ((metadata->>'type'));
```

### BRIN Indexes for Time-Series

For append-only tables where data is physically ordered by time:

```sql
-- 100x smaller than B-tree, nearly as fast for range scans
CREATE INDEX ix_logs_created ON logs USING BRIN (created_at);
```

### Monitor Unused Indexes

```sql
SELECT schemaname, relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(i.indexrelid))
FROM pg_stat_user_indexes i
JOIN pg_index USING (indexrelid)
WHERE idx_scan = 0
  AND NOT indisunique
  AND NOT indisprimary
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

Every unused index costs write performance and disk space. Drop them.

See [references/indexing-strategies.md](references/indexing-strategies.md) for B-tree internals, covering indexes, expression indexes, and EXPLAIN ANALYZE walkthroughs.

---

## 4. Schema Design

### Primary Keys: BIGSERIAL Internal, UUID Public

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,              -- Internal: fast joins, compact, sequential
    public_id UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,  -- External: non-guessable
    email TEXT NOT NULL
);
```

Expose `public_id` in APIs. Use `id` for joins and foreign keys. UUIDs as PKs fragment B-tree indexes and slow inserts.

### Always Add Timestamps With Trigger

```sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    -- ... columns ...
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Avoid ENUMs, Use CHECK Constraints

ENUMs are hard to modify in PostgreSQL (adding values requires a migration, removing values is nearly impossible without recreating the type):

```sql
-- Instead of: CREATE TYPE order_status AS ENUM ('pending', 'paid', 'shipped');
-- Use:
CREATE TABLE orders (
    status TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled'))
);
```

Or use a lookup table for frequently changing values.

### Soft Deletes

```sql
ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial index so queries on active records are fast
CREATE INDEX ix_orders_active ON orders (user_id, created_at) WHERE deleted_at IS NULL;
```

Every query must include `WHERE deleted_at IS NULL`. Consider using a view:

```sql
CREATE VIEW active_orders AS SELECT * FROM orders WHERE deleted_at IS NULL;
```

### JSONB Best Practices

- Always JSONB, never JSON (JSONB is parsed, indexable, and deduplicated; JSON is raw text)
- Add GIN index for flexible querying
- Validate structure with CHECK constraints:

```sql
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    CONSTRAINT events_payload_valid CHECK (
        payload ? 'type' AND payload ? 'timestamp'
    )
);
CREATE INDEX ix_events_payload ON events USING GIN (payload);
```

### Normalize to 3NF, Denormalize With Evidence

Start normalized. Only denormalize when you have measured evidence of a performance problem and have exhausted indexing solutions. Common acceptable denormalization:

- Materialized views for dashboard/reporting queries
- Counter caches for frequently counted relations
- Storing computed values that are expensive to calculate in real-time

---

## 5. Query Optimization

### Always EXPLAIN ANALYZE

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;
```

Red flags: **Seq Scan** on large tables (missing index), **rows estimated vs actual** off by 10x+ (run `ANALYZE`), **Nested Loop** with large outer (check `work_mem`), **Sort** with disk merge (increase `work_mem`).

### N+1 Query Detection

```python
# BAD: N+1 -- 1 query for list, then N queries for related data
users = db.query(User).all()
for user in users:
    orders = db.query(Order).filter_by(user_id=user.id).all()

# GOOD: eager load (1 query with JOIN)
users = db.query(User).options(joinedload(User.orders)).all()
```

### Batch Inserts

```python
# Slow: individual inserts
for row in data:
    db.execute(insert(table).values(**row))
# Fast: bulk insert with executemany
db.execute(insert(table), data)
# Fastest: COPY for massive loads
cur.copy_expert("COPY table FROM STDIN WITH CSV", file_obj)
```

### Other Rules

- **Never `SELECT *`** in production code -- fetch only needed columns
- **CTEs**: inlined by default in PG 12+; optimization barriers in PG < 12 (use `NOT MATERIALIZED` / `MATERIALIZED` to control)

---

## 6. Backup & Recovery

```bash
# Logical backup (portable, compressed, parallel)
pg_dump -Fc -j4 -d myapp -f myapp_$(date +%Y%m%d).dump
pg_restore -Fc -j4 -d myapp_restore myapp_20240101.dump

# WAL archiving for point-in-time recovery (postgresql.conf)
# wal_level = replica; archive_mode = on
# Use pgBackRest for production (parallel, compression, verification)
pgbackrest --stanza=myapp --type=full backup     # Full
pgbackrest --stanza=myapp --type=incr backup     # Daily incremental
pgbackrest --stanza=myapp --type=time --target="2024-01-15 14:30:00" restore  # PITR
```

**The untested backup rule**: An untested backup is not a backup. Restore to staging monthly. Measure restore time. Run smoke tests.

---

## 7. Monitoring Queries

### pg_stat_statements (Essential)

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- Top queries by total time
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```

### Active Queries and Locks

```sql
-- Running queries
SELECT pid, now() - xact_start AS xact_age, state, query
FROM pg_stat_activity WHERE state != 'idle' ORDER BY xact_start;

-- Lock waits: blocked and blocking queries
SELECT blocked.pid, blocked.query AS blocked_query,
       blocking.pid, blocking.query AS blocking_query
FROM pg_locks bl JOIN pg_stat_activity blocked ON blocked.pid = bl.pid
JOIN pg_locks bk ON bk.locktype = bl.locktype AND bk.relation = bl.relation AND bk.pid != bl.pid
JOIN pg_stat_activity blocking ON blocking.pid = bk.pid
WHERE NOT bl.granted;
```

### Key Health Checks

```sql
-- Cache hit ratio (should be > 99% for OLTP)
SELECT round(blks_hit * 100.0 / nullif(blks_hit + blks_read, 0), 2) AS cache_hit_ratio
FROM pg_stat_database WHERE datname = current_database();

-- Long transactions (block autovacuum, cause bloat)
SELECT pid, now() - xact_start AS duration, state, query
FROM pg_stat_activity WHERE xact_start < now() - interval '5 minutes' AND state != 'idle';

-- Table bloat (pgstattuple extension; dead_tuple_percent > 20% = needs VACUUM)
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT * FROM pgstattuple('users');
```

---

## Quick Reference: Migration Safety Checklist

Before merging any migration, verify:

- [ ] `SET lock_timeout = '2s'` is the first statement
- [ ] No `NOT NULL` column additions on tables with > 10k rows without the 3-step pattern
- [ ] All `CREATE INDEX` statements use `CONCURRENTLY`
- [ ] All new constraints use `NOT VALID` + separate `VALIDATE`
- [ ] No column renames (use expand-contract)
- [ ] No column type changes (use expand-contract)
- [ ] Rollback migration exists and is tested
- [ ] Migration tested against production-scale data volume
- [ ] Run `squawk` or equivalent linter on the migration SQL
