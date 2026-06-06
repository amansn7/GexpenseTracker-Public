# PostgreSQL Indexing Strategies Deep Dive

Complete reference for PostgreSQL index types, when to use each, and how to diagnose index effectiveness with EXPLAIN ANALYZE.

---

## B-tree Indexes (Default)

B-tree is the default index type and handles the vast majority of use cases. It supports equality (`=`) and range operators (`<`, `>`, `<=`, `>=`, `BETWEEN`, `IS NULL`).

### When B-tree Works

- Equality lookups: `WHERE email = 'user@example.com'`
- Range scans: `WHERE created_at > '2024-01-01'`
- Sorting: `ORDER BY created_at DESC`
- Prefix matching: `WHERE name LIKE 'John%'` (but NOT `LIKE '%John'`)

### When B-tree Fails

- Full-text search (use GIN with tsvector)
- JSONB containment queries (use GIN)
- Pattern matching with leading wildcard `LIKE '%pattern'` (use pg_trgm GIN)
- Low selectivity columns (boolean, status with 3 values) -- unless combined as composite or partial index

### B-tree Internals

A B-tree index stores sorted key values in a balanced tree structure. Leaf pages contain index entries pointing to table rows (via TID -- tuple identifier). For a table with N rows, lookup is O(log N) page reads.

Key properties:
- Each leaf page is 8KB by default
- Pages are doubly-linked for range scans
- NULLs are stored at the beginning or end (controllable with NULLS FIRST/LAST)
- Duplicate keys are stored with TID as a tiebreaker (deduplication in PG 13+)

---

## Hash Indexes

Hash indexes support only equality comparisons (`=`). Since PostgreSQL 10, they are crash-safe and WAL-logged.

### When to Use Hash

- Column with ONLY equality lookups, never range scans
- Very long keys where B-tree bloat is a concern (hash is fixed-size)

```sql
CREATE INDEX ix_sessions_token ON sessions USING HASH (token);
```

### When NOT to Use Hash

- Any range queries (hash can't do `<`, `>`, `BETWEEN`)
- `ORDER BY` (hash has no ordering)
- Multicolumn indexes (hash doesn't support composite keys)
- In practice, B-tree is almost always better. Use hash only when benchmarks prove otherwise.

---

## GIN Indexes (Generalized Inverted Index)

GIN indexes are optimized for values that contain multiple elements -- arrays, JSONB documents, full-text search vectors.

### JSONB Indexing

```sql
-- Default GIN: supports @>, ?, ?|, ?& operators
CREATE INDEX ix_events_data ON events USING GIN (data);

-- jsonb_path_ops: supports only @> but is smaller and faster
CREATE INDEX ix_events_data_pathops ON events USING GIN (data jsonb_path_ops);
```

**Operator support**:

| Operator | Default GIN | jsonb_path_ops | Description |
|----------|:-----------:|:--------------:|-------------|
| `@>`     | Yes         | Yes            | Contains |
| `?`      | Yes         | No             | Key exists |
| `?|`     | Yes         | No             | Any key exists |
| `?&`     | Yes         | No             | All keys exist |

```sql
-- Uses GIN index:
SELECT * FROM events WHERE data @> '{"type": "click"}';
SELECT * FROM events WHERE data ? 'user_id';

-- Does NOT use GIN index (use expression index instead):
SELECT * FROM events WHERE data->>'type' = 'click';
```

For equality on a specific path, add an expression index:

```sql
-- Expression index for specific path equality
CREATE INDEX ix_events_type ON events ((data->>'type'));

-- Now this uses the index:
SELECT * FROM events WHERE data->>'type' = 'click';
```

### Full-Text Search

```sql
-- Add a tsvector column (or use generated column in PG 12+)
ALTER TABLE articles ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || body)) STORED;

-- GIN index on the tsvector
CREATE INDEX ix_articles_search ON articles USING GIN (search_vector);

-- Query
SELECT * FROM articles WHERE search_vector @@ to_tsquery('english', 'postgres & production');
```

### Array Indexing

```sql
CREATE INDEX ix_users_tags ON users USING GIN (tags);

-- Uses the index:
SELECT * FROM users WHERE tags @> ARRAY['admin'];
SELECT * FROM users WHERE tags && ARRAY['admin', 'editor'];
```

### GIN Characteristics

- **Slower writes** than B-tree (must update the inverted index for each element)
- **Faster reads** for containment queries on multi-element values
- **Larger on disk** than B-tree for simple values
- Use `gin_pending_list_limit` to control the pending list size (trades write speed for read speed)

---

## GiST Indexes (Generalized Search Tree)

GiST supports geometric types, range types, and nearest-neighbor searches.

### Range Types

```sql
CREATE TABLE reservations (
    id BIGSERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL,
    during TSTZRANGE NOT NULL,
    EXCLUDE USING GIST (room_id WITH =, during WITH &&)
);

-- Prevents overlapping reservations for the same room
INSERT INTO reservations (room_id, during)
VALUES (1, '[2024-01-15 14:00, 2024-01-15 16:00)');
```

### Geometric Types

```sql
-- PostGIS: spatial index
CREATE INDEX ix_locations_geom ON locations USING GIST (geom);

-- Nearest-neighbor query (uses GiST index for K-NN)
SELECT * FROM locations
ORDER BY geom <-> ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)
LIMIT 10;
```

### GiST vs GIN for Full-Text Search

- **GIN**: Faster reads, slower writes, larger index. Best for mostly-read workloads.
- **GiST**: Faster writes, slower reads, smaller index. Best for write-heavy workloads or when index size matters.

For most production full-text search, use GIN.

---

## BRIN Indexes (Block Range Index)

BRIN indexes store summary information about ranges of physical table blocks. They are extremely small but only effective when the indexed column correlates with physical row order.

### When BRIN Works

- **Time-series data**: `created_at` on an append-only table (rows are physically ordered by insertion time)
- **Sequential IDs**: autoincrement columns
- **Monotonically increasing values**: any column that naturally grows with row insertion order

### When BRIN Fails

- Tables with heavy UPDATE/DELETE (physical order gets fragmented)
- Random insertion patterns
- Queries that select a tiny fraction of rows (B-tree will be faster)

```sql
-- BRIN for time-series logs (append-only)
CREATE INDEX ix_logs_created_brin ON logs USING BRIN (created_at)
    WITH (pages_per_range = 32);
```

### Sizing

| Table Rows | B-tree Size | BRIN Size | Ratio |
|-----------|-------------|-----------|-------|
| 1M        | ~22 MB      | ~48 KB    | 450x  |
| 100M      | ~2.1 GB     | ~4.8 MB   | 440x  |

### pages_per_range Tuning

Default is 128 pages. Lower values = more granularity (better filtering) but larger index. For time-series:
- 32: Good for queries selecting narrow time ranges
- 128: Good default
- 256+: Very compact, but only useful for wide range scans

---

## Covering Indexes (INCLUDE Clause)

Available in PostgreSQL 11+. A covering index stores additional columns in the index leaf pages so queries can be answered entirely from the index (index-only scan) without visiting the table.

```sql
-- Query: SELECT email, name FROM users WHERE email = ?
-- Regular index: finds row in index, then goes to table for 'name'
CREATE INDEX ix_users_email ON users (email);

-- Covering index: 'name' is stored in the index leaf, no table visit needed
CREATE INDEX ix_users_email_covering ON users (email) INCLUDE (name);
```

### When to Use INCLUDE

- High-frequency queries that select a few extra columns beyond the indexed ones
- When the included columns are narrow (avoid including large TEXT/JSONB columns)
- When the table is wide and heap fetches are expensive

### INCLUDE vs Composite Index

```sql
-- Composite: both columns are searchable, index is sorted by (email, name)
CREATE INDEX ix_comp ON users (email, name);

-- INCLUDE: only email is searchable, name is just stored alongside
CREATE INDEX ix_include ON users (email) INCLUDE (name);
```

Use composite when you query on both columns. Use INCLUDE when you only filter on the key column but SELECT the included column.

---

## Expression Indexes

Index the result of a function or expression, not the raw column value.

```sql
-- Case-insensitive email lookup
CREATE INDEX ix_users_email_lower ON users (lower(email));
-- Query MUST match the expression:
SELECT * FROM users WHERE lower(email) = 'user@example.com';

-- Index on year extracted from timestamp
CREATE INDEX ix_orders_year ON orders (extract(year FROM created_at));
-- Query:
SELECT * FROM orders WHERE extract(year FROM created_at) = 2024;

-- JSONB nested value
CREATE INDEX ix_events_type ON events ((payload->>'type'));
-- Query:
SELECT * FROM events WHERE payload->>'type' = 'purchase';
```

The query must use the exact same expression as the index. `WHERE LOWER(email) = ...` works. `WHERE email = ...` does not use the `lower(email)` index.

---

## Partial Indexes

Index only the rows that match a `WHERE` condition. Smaller index, faster lookups, less write overhead.

```sql
-- Only index active users (if 90% of queries filter for active users)
CREATE INDEX ix_users_active ON users (email) WHERE active = true;

-- Only index non-deleted orders
CREATE INDEX ix_orders_not_deleted ON orders (user_id, created_at)
    WHERE deleted_at IS NULL;

-- Only index unprocessed jobs (the queue pattern)
CREATE INDEX ix_jobs_pending ON jobs (priority, created_at)
    WHERE status = 'pending';
```

### Size Savings

If only 10% of rows match the WHERE condition, the partial index is ~10% the size of a full index. This means:
- 10x less disk space
- 10x less write overhead on INSERT/UPDATE
- Fits in memory more easily

### Query Must Match

The query's WHERE clause must imply the index's WHERE clause:

```sql
-- Uses ix_users_active:
SELECT * FROM users WHERE active = true AND email = 'user@example.com';

-- Does NOT use ix_users_active (no active = true filter):
SELECT * FROM users WHERE email = 'user@example.com';
```

---

## Multicolumn Index Ordering

### The Leftmost Prefix Rule

A composite index `(a, b, c)` can satisfy queries on:
- `(a)` -- yes
- `(a, b)` -- yes
- `(a, b, c)` -- yes
- `(b)` -- NO (doesn't start with leftmost column)
- `(b, c)` -- NO
- `(a, c)` -- partially (uses index for `a`, then filters `c`)

### Column Order Strategy

1. **Equality columns first**: columns compared with `=`
2. **Range column last**: the column compared with `<`, `>`, `BETWEEN`
3. **Most selective equality column first** (among equals)

```sql
-- Query: WHERE tenant_id = ? AND status = ? AND created_at > ?
-- Optimal order:
CREATE INDEX ix_orders_tenant_status_created
    ON orders (tenant_id, status, created_at);
-- tenant_id: equality, high selectivity (many tenants)
-- status: equality, lower selectivity (few statuses)
-- created_at: range (must be last to use index for range scan)
```

### Sort Direction

Index sort order matters for ORDER BY:

```sql
-- Query: ORDER BY created_at DESC, id ASC
CREATE INDEX ix_orders_sort ON orders (created_at DESC, id ASC);

-- Backward scan: PG can scan an index in reverse, so
-- (created_at ASC) works for ORDER BY created_at DESC
-- BUT for mixed directions, you need the index to match exactly
```

---

## Index-Only Scans and the Visibility Map

An **index-only scan** reads data entirely from the index without visiting the table heap. This is only possible when:

1. All columns in the query are in the index (key + INCLUDE columns)
2. The visibility map confirms all rows on a page are visible to all transactions

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, created_at FROM orders WHERE user_id = 12345;
```

```
Index Only Scan using ix_orders_user_created on orders
  Index Cond: (user_id = 12345)
  Heap Fetches: 0          -- 0 means fully index-only
  Buffers: shared hit=4    -- only index pages read
```

If `Heap Fetches` is high, run `VACUUM` on the table to update the visibility map:

```sql
VACUUM orders;
```

After VACUUM, recently-modified pages are marked visible and index-only scans become effective.

---

## When NOT to Index

### Small Tables

Tables with fewer than ~1,000 rows: PostgreSQL will sequential scan regardless because it's faster to read a few pages than to traverse an index.

### Low-Selectivity Columns

A boolean column with 50/50 distribution: the index doesn't help because PostgreSQL still reads half the table. Exception: partial index on the rare value.

```sql
-- Bad: full index on boolean (useless for both values)
CREATE INDEX ix_users_active ON users (active);

-- Good: partial index on the rare value
CREATE INDEX ix_users_inactive ON users (id) WHERE active = false;
-- Only useful if inactive users are a small fraction
```

### Write-Heavy Tables with Few Reads

Every index slows down INSERT, UPDATE, and DELETE. If a table receives 10,000 inserts/second and is queried once per minute, extra indexes cost more than they save.

### Columns That Are Almost Always Selected With Other Indexed Columns

If column `B` is never queried without column `A`, and `A` already has an index, adding a separate index on `B` alone wastes space. Add `B` to the composite index instead.

---

## Monitoring and Maintenance

### Find Unused Indexes

```sql
SELECT
    schemaname || '.' || relname AS table,
    indexrelname AS index,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(i.indexrelid)) AS size
FROM pg_stat_user_indexes i
JOIN pg_index pi ON i.indexrelid = pi.indexrelid
WHERE idx_scan = 0
  AND NOT pi.indisunique    -- Don't drop unique constraint indexes
  AND NOT pi.indisprimary   -- Don't drop primary keys
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

Wait at least 2-4 weeks of production traffic before concluding an index is unused (some queries run monthly).

### Find Duplicate Indexes

```sql
SELECT
    array_agg(indexrelid::regclass) AS indexes,
    indrelid::regclass AS table,
    indkey AS column_positions
FROM pg_index
GROUP BY indrelid, indkey
HAVING count(*) > 1;
```

### Find Missing Indexes

```sql
-- Tables with high sequential scan rates
SELECT
    schemaname || '.' || relname AS table,
    seq_scan,
    seq_tup_read,
    idx_scan,
    n_live_tup,
    ROUND(seq_tup_read::numeric / NULLIF(seq_scan, 0)) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 100
  AND n_live_tup > 10000
ORDER BY seq_tup_read DESC
LIMIT 20;
```

### Index Bloat

Over time, indexes accumulate dead tuples and bloat. Check with:

```sql
-- Requires pgstattuple extension
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT
    indexrelid::regclass AS index,
    avg_leaf_density,
    leaf_fragmentation
FROM pgstatindex('ix_orders_user_id');
-- avg_leaf_density < 50% suggests significant bloat
```

Fix with `REINDEX CONCURRENTLY` (PG 12+):

```sql
-- Rebuilds index without locking writes
REINDEX INDEX CONCURRENTLY ix_orders_user_id;

-- Rebuild all indexes on a table
REINDEX TABLE CONCURRENTLY orders;
```

For PG < 12, create a new index concurrently and swap:

```sql
CREATE INDEX CONCURRENTLY ix_orders_user_id_new ON orders (user_id);
DROP INDEX CONCURRENTLY ix_orders_user_id;
ALTER INDEX ix_orders_user_id_new RENAME TO ix_orders_user_id;
```

---

## Real-World EXPLAIN ANALYZE Examples

### Example 1: Missing Index

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE user_id = 12345;
```

```
Seq Scan on orders  (cost=0.00..285432.00 rows=50 width=120)
                    (actual time=892.431..1543.207 rows=47 loops=1)
  Filter: (user_id = 12345)
  Rows Removed by Filter: 9999953
  Buffers: shared hit=12045 read=123387
Planning Time: 0.085 ms
Execution Time: 1543.271 ms
```

**Diagnosis**: Sequential scan on a 10M row table. Reading 135K pages. Fix: add index on `user_id`.

After index:

```
Index Scan using ix_orders_user_id on orders  (cost=0.43..124.58 rows=50 width=120)
                                               (actual time=0.031..0.089 rows=47 loops=1)
  Index Cond: (user_id = 12345)
  Buffers: shared hit=51
Planning Time: 0.092 ms
Execution Time: 0.112 ms
```

1543ms -> 0.1ms. 51 pages instead of 135K.

### Example 2: Wrong Composite Index Order

```sql
-- Index exists: (created_at, tenant_id)
-- Query:
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders
WHERE tenant_id = 42 AND created_at > '2024-01-01';
```

```
Bitmap Heap Scan on orders  (cost=12456.78..45678.90 rows=50000 width=120)
                            (actual time=234.567..567.890 rows=48723 loops=1)
  Recheck Cond: (created_at > '2024-01-01')
  Filter: (tenant_id = 42)
  Rows Removed by Filter: 451277
  Buffers: shared hit=45678 read=12345
```

**Diagnosis**: Index is `(created_at, tenant_id)`. PostgreSQL uses the index for `created_at > '2024-01-01'` (range on first column) but then filters `tenant_id` from the results -- discarding 90% of matched rows.

Fix: reorder index to `(tenant_id, created_at)`:

```
Index Scan using ix_orders_tenant_created on orders  (cost=0.56..1234.56 rows=50000 width=120)
                                                      (actual time=0.034..45.678 rows=48723 loops=1)
  Index Cond: ((tenant_id = 42) AND (created_at > '2024-01-01'))
  Buffers: shared hit=5678
```

### Example 3: Index-Only Scan vs Index Scan

```sql
-- Index: (user_id) -- no covering columns
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, created_at FROM orders WHERE user_id = 12345;
```

```
Index Scan using ix_orders_user_id on orders  (cost=0.43..124.58 rows=50 width=16)
                                               (actual time=0.031..0.089 rows=47 loops=1)
  Index Cond: (user_id = 12345)
  Buffers: shared hit=51 read=12    -- 12 heap page reads for created_at
```

After adding covering index:

```sql
CREATE INDEX ix_orders_user_covering ON orders (user_id) INCLUDE (created_at);
```

```
Index Only Scan using ix_orders_user_covering on orders  (cost=0.43..62.29 rows=50 width=16)
                                                          (actual time=0.023..0.048 rows=47 loops=1)
  Index Cond: (user_id = 12345)
  Heap Fetches: 0
  Buffers: shared hit=4    -- only index pages, no heap reads
```

### Example 4: Partial Index Effectiveness

```sql
-- Full index (100M rows, 2.1 GB)
CREATE INDEX ix_jobs_status ON jobs (created_at) ;

-- Partial index (only pending jobs, ~100K rows, ~2 MB)
CREATE INDEX ix_jobs_pending ON jobs (created_at) WHERE status = 'pending';
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 10;
```

With partial index:
```
Limit  (cost=0.42..1.23 rows=10 width=180)
       (actual time=0.021..0.034 rows=10 loops=1)
  ->  Index Scan using ix_jobs_pending on jobs  (cost=0.42..8234.56 rows=101234 width=180)
        Buffers: shared hit=4
```

4 buffer hits. The entire pending job index fits in a few MB of RAM.

### Example 5: GIN Index for JSONB

```sql
CREATE INDEX ix_events_data ON events USING GIN (data);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM events WHERE data @> '{"type": "purchase", "source": "web"}';
```

```
Bitmap Heap Scan on events  (cost=24.89..1234.56 rows=500 width=256)
                            (actual time=0.345..2.567 rows=487 loops=1)
  Recheck Cond: (data @> '{"type": "purchase", "source": "web"}'::jsonb)
  Buffers: shared hit=567
  ->  Bitmap Index Scan on ix_events_data  (cost=0.00..24.76 rows=500 width=0)
        Index Cond: (data @> '{"type": "purchase", "source": "web"}'::jsonb)
        Buffers: shared hit=12
```

GIN efficiently finds matching documents without scanning the whole table.

---

## Quick Reference: Index Selection

| Query Pattern | Index Type | Example |
|--------------|-----------|---------|
| `WHERE col = ?` | B-tree | `CREATE INDEX ON t (col)` |
| `WHERE col > ?` | B-tree | `CREATE INDEX ON t (col)` |
| `WHERE col = ? AND col2 > ?` | B-tree composite | `CREATE INDEX ON t (col, col2)` |
| `WHERE jsonb @> '{}'` | GIN | `CREATE INDEX ON t USING GIN (col)` |
| `WHERE jsonb->>'key' = ?` | B-tree expression | `CREATE INDEX ON t ((col->>'key'))` |
| `WHERE tsvector @@ tsquery` | GIN | `CREATE INDEX ON t USING GIN (col)` |
| `WHERE col = ? (time-series)` | BRIN | `CREATE INDEX ON t USING BRIN (col)` |
| Range overlap / nearest neighbor | GiST | `CREATE INDEX ON t USING GIST (col)` |
| Equality only, long keys | Hash | `CREATE INDEX ON t USING HASH (col)` |
| Active subset of rows | Partial (any type) | `... WHERE active = true` |
| Avoid heap fetch | Covering (INCLUDE) | `... (col) INCLUDE (col2, col3)` |
