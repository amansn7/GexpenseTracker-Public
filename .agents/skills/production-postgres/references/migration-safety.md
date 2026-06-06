# Migration Safety Deep Dive

Complete reference for zero-downtime PostgreSQL schema migrations. Every dangerous operation with its safe alternative, including full Alembic and Django code.

---

## Principles

1. **Two-version compatibility**: During rolling deploy, old code and new code run simultaneously. Every schema change must be compatible with both versions.
2. **Lock budget**: No migration may hold a strong lock (ACCESS EXCLUSIVE, SHARE ROW EXCLUSIVE) for more than 2 seconds.
3. **Expand-contract**: Add new things first (expand), deploy code that uses them, then remove old things (contract).
4. **Fail fast**: Use `lock_timeout` so migrations fail immediately rather than queueing and blocking all traffic.

---

## Pattern 1: Adding a NOT NULL Column Safely

### The Problem

```sql
-- DANGEROUS: Takes ACCESS EXCLUSIVE lock, rewrites entire table
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
```

On a table with millions of rows, this locks the table for minutes. All queries queue behind it.

### Safe Pattern (Alembic, 3 Migrations)

**Migration 1: Add nullable column with default**

```python
"""add_users_status_column"""

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    # Fast: nullable column with DEFAULT doesn't rewrite table in PG 11+
    op.add_column('users', sa.Column('status', sa.String(50), nullable=True, server_default='active'))

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.drop_column('users', 'status')
```

**Migration 2: Backfill existing rows**

```python
"""backfill_users_status"""

from alembic import op
from sqlalchemy import text

def upgrade():
    conn = op.get_bind()
    batch_size = 5000
    while True:
        result = conn.execute(text("""
            UPDATE users
            SET status = 'active'
            WHERE id IN (
                SELECT id FROM users
                WHERE status IS NULL
                LIMIT :batch_size
                FOR UPDATE SKIP LOCKED
            )
        """), {"batch_size": batch_size})
        if result.rowcount == 0:
            break
        # Commit each batch to avoid long transactions
        conn.commit()

def downgrade():
    # No-op: removing the column in migration 1's downgrade handles cleanup
    pass
```

**Migration 3: Add NOT NULL constraint**

```python
"""add_users_status_not_null_constraint"""

from alembic import op

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    # NOT VALID: fast, doesn't scan existing rows
    op.execute("""
        ALTER TABLE users
        ADD CONSTRAINT users_status_not_null
        CHECK (status IS NOT NULL) NOT VALID
    """)
    # VALIDATE: scans rows but only takes ShareUpdateExclusiveLock (allows writes)
    op.execute("ALTER TABLE users VALIDATE CONSTRAINT users_status_not_null")
    # Optionally remove the server_default if you don't want it permanently
    op.alter_column('users', 'status', server_default=None)

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_not_null")
```

### Django Equivalent

```python
# Migration 1: Add nullable field
from django.db import migrations, models

class Migration(migrations.Migration):
    operations = [
        migrations.AddField(
            model_name='user',
            name='status',
            field=models.CharField(max_length=50, null=True, default='active'),
        ),
    ]

# Migration 2: RunPython for backfill
class Migration(migrations.Migration):
    operations = [
        migrations.RunPython(backfill_status, reverse_code=migrations.RunPython.noop),
    ]

def backfill_status(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    batch_size = 5000
    while User.objects.filter(status__isnull=True).exists():
        batch_ids = list(
            User.objects.filter(status__isnull=True)
            .values_list('id', flat=True)[:batch_size]
        )
        User.objects.filter(id__in=batch_ids).update(status='active')

# Migration 3: RunSQL for NOT VALID constraint
class Migration(migrations.Migration):
    operations = [
        migrations.RunSQL(
            sql=[
                "SET lock_timeout = '2s';",
                "ALTER TABLE accounts_user ADD CONSTRAINT user_status_not_null CHECK (status IS NOT NULL) NOT VALID;",
                "ALTER TABLE accounts_user VALIDATE CONSTRAINT user_status_not_null;",
            ],
            reverse_sql="ALTER TABLE accounts_user DROP CONSTRAINT IF EXISTS user_status_not_null;",
        ),
    ]
```

---

## Pattern 2: Creating Indexes Concurrently

### The Problem

```sql
-- DANGEROUS: Locks table for writes for the entire duration of index build
CREATE INDEX ix_orders_user_id ON orders (user_id);
```

### Safe Pattern (Alembic)

```python
"""add_index_orders_user_id"""

from alembic import op

# CRITICAL: This migration cannot run inside a transaction
# Option A: Set in migration file
revision = 'abc123'
down_revision = 'def456'
# This tells Alembic to not wrap this migration in a transaction
transaction = False  # Alembic 1.14+, or use autocommit_block below

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_user_id
        ON orders (user_id)
    """)

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_orders_user_id")
```

For older Alembic versions, use the autocommit block:

```python
def upgrade():
    with op.get_context().autocommit_block():
        op.execute("SET lock_timeout = '2s'")
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_user_id
            ON orders (user_id)
        """)
```

### Handling Failed CONCURRENTLY Builds

If `CREATE INDEX CONCURRENTLY` fails (OOM, canceled, etc.), it leaves an INVALID index behind:

```sql
-- Check for invalid indexes
SELECT indexrelid::regclass, indisvalid
FROM pg_index
WHERE NOT indisvalid;

-- Drop the invalid index and retry
DROP INDEX CONCURRENTLY ix_orders_user_id;
CREATE INDEX CONCURRENTLY ix_orders_user_id ON orders (user_id);
```

### Django Equivalent

```python
from django.db import migrations

class Migration(migrations.Migration):
    atomic = False  # Required for CONCURRENTLY

    operations = [
        migrations.RunSQL(
            sql="CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_orders_user_id ON orders (user_id);",
            reverse_sql="DROP INDEX CONCURRENTLY IF EXISTS ix_orders_user_id;",
        ),
    ]
```

Or use Django's `AddIndex` with `AddIndexConcurrently` from `django.contrib.postgres.operations`:

```python
from django.contrib.postgres.operations import AddIndexConcurrently
from django.db import migrations, models

class Migration(migrations.Migration):
    atomic = False

    operations = [
        AddIndexConcurrently(
            model_name='order',
            index=models.Index(fields=['user_id'], name='ix_orders_user_id'),
        ),
    ]
```

---

## Pattern 3: Renaming Columns (Expand-Contract)

### The Problem

```sql
-- DANGEROUS: Instantly breaks all code referencing 'username'
ALTER TABLE users RENAME COLUMN username TO display_name;
```

During rolling deploy, old instances query `username` (which no longer exists) and crash.

### Safe Pattern (3 Phases)

**Phase 1: Expand -- Add new column with sync trigger**

```python
"""expand_users_username_to_display_name"""

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.execute("SET lock_timeout = '2s'")

    # Add new column
    op.add_column('users', sa.Column('display_name', sa.String(255), nullable=True))

    # Backfill existing data
    op.execute("UPDATE users SET display_name = username WHERE display_name IS NULL")

    # Trigger to keep both columns in sync during transition
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_users_display_name()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' OR NEW.username IS DISTINCT FROM OLD.username THEN
                NEW.display_name = NEW.username;
            END IF;
            IF TG_OP = 'INSERT' OR NEW.display_name IS DISTINCT FROM OLD.display_name THEN
                NEW.username = NEW.display_name;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trg_sync_users_display_name
        BEFORE INSERT OR UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION sync_users_display_name();
    """)

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_users_display_name ON users")
    op.execute("DROP FUNCTION IF EXISTS sync_users_display_name()")
    op.drop_column('users', 'display_name')
```

**Phase 2: Deploy code** that reads/writes `display_name` instead of `username`. Both columns exist and are synced, so old and new code both work.

**Phase 3: Contract -- Remove old column and trigger**

```python
"""contract_users_drop_username"""

from alembic import op

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_users_display_name ON users")
    op.execute("DROP FUNCTION IF EXISTS sync_users_display_name()")
    op.drop_column('users', 'username')

def downgrade():
    # Reverse: re-add username, backfill, re-create trigger
    # (full implementation omitted for brevity, but it must exist)
    pass
```

---

## Pattern 4: Changing Column Types Safely

### The Problem

```sql
-- DANGEROUS: Rewrites entire table with ACCESS EXCLUSIVE lock
ALTER TABLE events ALTER COLUMN payload TYPE JSONB USING payload::jsonb;
```

### Safe Pattern: Expand-Contract

```python
"""expand_events_payload_to_jsonb"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

def upgrade():
    op.execute("SET lock_timeout = '2s'")

    # Step 1: Add new column with target type
    op.add_column('events', sa.Column('payload_v2', JSONB, nullable=True))

    # Step 2: Backfill in batches
    conn = op.get_bind()
    while True:
        result = conn.execute(text("""
            UPDATE events
            SET payload_v2 = payload::jsonb
            WHERE id IN (
                SELECT id FROM events
                WHERE payload_v2 IS NULL AND payload IS NOT NULL
                LIMIT 5000
            )
        """))
        if result.rowcount == 0:
            break
        conn.commit()

    # Step 3: Add trigger to sync during transition
    op.execute("""
        CREATE OR REPLACE FUNCTION sync_events_payload()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.payload_v2 = NEW.payload::jsonb;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_sync_events_payload
        BEFORE INSERT OR UPDATE OF payload ON events
        FOR EACH ROW EXECUTE FUNCTION sync_events_payload();
    """)

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_events_payload ON events")
    op.execute("DROP FUNCTION IF EXISTS sync_events_payload()")
    op.drop_column('events', 'payload_v2')
```

### Exception: Some Type Changes Are Lock-Free

These `ALTER TYPE` changes do NOT rewrite the table:

- `varchar(N)` to `varchar(M)` where M > N (increasing length)
- `varchar(N)` to `text`
- `numeric(P, S)` to `numeric(P2, S)` where P2 > P (increasing precision)

```sql
-- Safe: just a metadata change, no rewrite
ALTER TABLE users ALTER COLUMN name TYPE varchar(500);  -- was varchar(255)
ALTER TABLE users ALTER COLUMN name TYPE text;          -- was varchar
```

---

## Pattern 5: Adding Foreign Key Constraints

### The Problem

```sql
-- DANGEROUS: Scans entire child table to validate, holds ShareRowExclusiveLock
ALTER TABLE orders ADD CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users(id);
```

### Safe Pattern

```python
"""add_orders_user_fk"""

from alembic import op

def upgrade():
    op.execute("SET lock_timeout = '2s'")

    # Step 1: Add FK as NOT VALID (instant, no table scan)
    op.execute("""
        ALTER TABLE orders
        ADD CONSTRAINT orders_user_fk
        FOREIGN KEY (user_id) REFERENCES users(id)
        NOT VALID
    """)

    # Step 2: Validate separately (ShareUpdateExclusiveLock, allows writes)
    op.execute("ALTER TABLE orders VALIDATE CONSTRAINT orders_user_fk")

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_fk")
```

---

## Pattern 6: Adding CHECK Constraints

```python
"""add_orders_amount_positive"""

from alembic import op

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("""
        ALTER TABLE orders
        ADD CONSTRAINT orders_amount_positive
        CHECK (amount > 0) NOT VALID
    """)
    op.execute("ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_positive")

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_amount_positive")
```

---

## Pattern 7: Adding UNIQUE Constraints

A UNIQUE constraint creates an index under the hood. The safe way is to create the index first, then add the constraint using the existing index:

```python
"""add_users_email_unique"""

from alembic import op

# Must be outside a transaction for CONCURRENTLY
transaction = False

def upgrade():
    op.execute("SET lock_timeout = '2s'")

    # Step 1: Create the unique index concurrently (no lock)
    op.execute("""
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ix_users_email_unique
        ON users (email)
    """)

    # Step 2: Add constraint using the existing index (instant)
    op.execute("""
        ALTER TABLE users
        ADD CONSTRAINT users_email_unique
        UNIQUE USING INDEX ix_users_email_unique
    """)

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique")
    # The index is dropped with the constraint when created via USING INDEX
```

---

## Pattern 8: Splitting Large Data Migrations

For data migrations that touch millions of rows, never do it in a single transaction:

```python
"""backfill_orders_total_amount"""

from alembic import op
from sqlalchemy import text
import time

def upgrade():
    conn = op.get_bind()
    batch_size = 10000
    total_updated = 0
    start_time = time.time()

    while True:
        result = conn.execute(text("""
            WITH batch AS (
                SELECT id
                FROM orders
                WHERE total_amount IS NULL
                LIMIT :batch_size
                FOR UPDATE SKIP LOCKED
            )
            UPDATE orders
            SET total_amount = subtotal + tax + shipping
            WHERE id IN (SELECT id FROM batch)
        """), {"batch_size": batch_size})

        rows = result.rowcount
        total_updated += rows
        conn.commit()

        if rows == 0:
            break

        elapsed = time.time() - start_time
        rate = total_updated / elapsed if elapsed > 0 else 0
        print(f"  Backfilled {total_updated} rows ({rate:.0f} rows/sec)")

        # Optional: small sleep to reduce replication lag
        # time.sleep(0.1)

def downgrade():
    conn = op.get_bind()
    batch_size = 10000
    while True:
        result = conn.execute(text("""
            UPDATE orders SET total_amount = NULL
            WHERE id IN (SELECT id FROM orders WHERE total_amount IS NOT NULL LIMIT :batch_size)
        """), {"batch_size": batch_size})
        conn.commit()
        if result.rowcount == 0:
            break
```

Key principles:
- `FOR UPDATE SKIP LOCKED` avoids deadlocks with concurrent writes
- Commit after each batch to release locks and avoid long transactions
- Log progress so operators know it's working
- Keep batches at 5,000-10,000 rows (large enough for efficiency, small enough for low lock time)

---

## Pattern 9: Dropping Columns Safely

### The Problem

Dropping a column instantly breaks any code that references it.

### Safe Pattern

**Phase 1**: Deploy code that no longer reads/writes the column. Make sure:
- ORM models don't reference it
- No raw SQL references it
- SELECT * is not used anywhere (this is why SELECT * is banned in production)

**Phase 2**: Drop the column in a migration

```python
"""drop_users_legacy_status"""

from alembic import op

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.drop_column('users', 'legacy_status')

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.add_column('users', sa.Column('legacy_status', sa.String(50), nullable=True))
```

---

## Pattern 10: Dropping Tables Safely

Same expand-contract as columns, but larger scope:

1. Remove all code references to the table (queries, ORM models, FKs)
2. Deploy
3. Drop the table in a migration
4. Keep the downgrade with full table recreation and data is NOT recoverable (document this)

```python
"""drop_legacy_audit_log"""

from alembic import op
import sqlalchemy as sa

def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.drop_table('legacy_audit_log')

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.create_table(
        'legacy_audit_log',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('action', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
```

---

## CI Integration: Automated Migration Safety Checks

### squawk (Recommended)

[squawk](https://github.com/sbdchd/squawk) is a linter for PostgreSQL migrations that catches unsafe patterns:

```bash
# Install
npm install -g squawk-cli
# or
brew install squawk

# Lint a migration file
squawk migration.sql

# In CI (lint all new migration files)
git diff --name-only origin/main... -- 'alembic/versions/*.py' | while read f; do
    # Extract SQL from Alembic migration (or generate with --sql flag)
    alembic upgrade head --sql | squawk
done
```

squawk catches:
- Adding NOT NULL column without default
- Creating index non-concurrently
- Adding constraint without NOT VALID
- Changing column type unsafely
- Setting NOT NULL on existing column
- Renaming column/table

### Alembic --sql for CI

Generate raw SQL from migrations for review and linting:

```bash
# Generate SQL for a specific migration
alembic upgrade abc123:def456 --sql > migration.sql

# Review the SQL before applying
cat migration.sql | squawk
```

### Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: squawk-migrations
        name: Check migration safety
        entry: bash -c 'git diff --cached --name-only -- "alembic/versions/*.py" | xargs -I{} alembic upgrade head --sql | squawk'
        language: system
        files: 'alembic/versions/.*\.py$'
```

---

## Rollback Strategies

### Schema Rollbacks

Every Alembic migration must have a working `downgrade()`. Test it:

```bash
# Apply migration
alembic upgrade head

# Roll back
alembic downgrade -1

# Verify: apply again to make sure it's idempotent
alembic upgrade head
```

### Data Migration Rollbacks

Data migrations are harder to roll back. Strategies:

1. **Reversible transforms**: If the backfill computes `total = subtotal + tax`, the downgrade sets `total = NULL`
2. **Backup before migrate**: `CREATE TABLE orders_backup AS SELECT * FROM orders` before destructive changes
3. **Soft rollback**: Add a feature flag that switches between old and new column reads

### When NOT to Roll Back

Sometimes forward-fixing is safer than rolling back:
- The migration already backfilled millions of rows (rolling back would take as long)
- Rolling back would lose user data created after the migration
- The issue is in application code, not the schema

---

## Testing Migrations Against Production-Scale Data

### The Problem

A migration that runs in 200ms on your dev database with 100 rows takes 45 minutes on production with 50M rows.

### The Solution

1. **Restore a production backup to staging**:
   ```bash
   pg_restore -Fc -j4 -d staging_db production_backup.dump
   ```

2. **Time the migration**:
   ```bash
   time alembic upgrade head
   ```

3. **Check lock duration** (in a separate session while migration runs):
   ```sql
   SELECT pid, mode, relation::regclass, granted,
          now() - query_start AS lock_duration
   FROM pg_locks l
   JOIN pg_stat_activity a USING (pid)
   WHERE relation = 'users'::regclass;
   ```

4. **Monitor replication lag** (if using replicas):
   ```sql
   SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
          now() - replay_lag AS lag
   FROM pg_stat_replication;
   ```

### Automated Migration Testing Script

```bash
#!/bin/bash
# test-migration.sh - Run against a staging DB with production-scale data
set -euo pipefail

DB_URL="${STAGING_DB_URL:?Set STAGING_DB_URL}"
MIGRATION_REV="${1:?Usage: test-migration.sh <revision>}"

echo "=== Testing migration ${MIGRATION_REV} ==="

# Record table sizes before
psql "$DB_URL" -c "
    SELECT relname, n_live_tup, pg_size_pretty(pg_relation_size(oid))
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC
    LIMIT 10;
"

# Time the upgrade
echo "--- Upgrade ---"
time alembic -x sqlalchemy.url="$DB_URL" upgrade "$MIGRATION_REV"

# Time the downgrade
echo "--- Downgrade ---"
time alembic -x sqlalchemy.url="$DB_URL" downgrade -1

# Re-apply to verify idempotency
echo "--- Re-upgrade ---"
time alembic -x sqlalchemy.url="$DB_URL" upgrade "$MIGRATION_REV"

echo "=== Migration test passed ==="
```
