"""ensure merchant_aliases.user_id exists (direct DDL, no batch_alter_table)

Previous migrations 0039 and 0042 attempted to add user_id via batch_alter_table
and information_schema checks, but on PostgreSQL these sometimes leave
information_schema metadata in a state where the column appears to exist but the
actual live table does not have it.

This migration uses a PostgreSQL DO block with EXCEPTION handling to add the
column unconditionally — bypassing corrupted information_schema metadata — while
handling the "already exists" case cleanly within the same transaction.

Revision ID: 0044
Revises: 0043
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0044"
down_revision: Union[str, Sequence[str], None] = "0043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    # 1. Add column — use DO block with EXCEPTION to handle the "already exists"
    #    case inside PostgreSQL, bypassing corrupted information_schema metadata.
    conn.execute(sa.text("""
        DO $$
        BEGIN
            ALTER TABLE merchant_aliases ADD COLUMN user_id VARCHAR(36);
        EXCEPTION
            WHEN duplicate_column THEN
                NULL;
        END $$;
    """))

    # 2. Backfill NULL rows to the owner user
    conn.execute(sa.text("""
        UPDATE merchant_aliases SET user_id = (
            SELECT id FROM users WHERE role = 'owner'
              AND email != 'service@localhost'
            LIMIT 1
        ) WHERE user_id IS NULL
    """))

    # 3. Make NOT NULL
    conn.execute(
        sa.text("ALTER TABLE merchant_aliases ALTER COLUMN user_id SET NOT NULL")
    )

    # 4. Add FK constraint if missing
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_merchant_aliases_user_id'
                  AND table_name = 'merchant_aliases'
            ) THEN
                ALTER TABLE merchant_aliases
                    ADD CONSTRAINT fk_merchant_aliases_user_id
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
        END $$;
    """))

    # 5. Unique constraint: drop old-style if present, create composite if missing
    conn.execute(
        sa.text("ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS merchant_aliases_raw_key")
    )
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'uq_merchant_alias_user_raw'
                  AND table_name = 'merchant_aliases'
            ) THEN
                ALTER TABLE merchant_aliases
                    ADD CONSTRAINT uq_merchant_alias_user_raw
                    UNIQUE (user_id, raw);
            END IF;
        END $$;
    """))

    # 6. Index — pg_class index is reliable
    conn.execute(
        sa.text("CREATE INDEX IF NOT EXISTS ix_merchant_aliases_user_id"
                " ON merchant_aliases (user_id)")
    )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    conn.execute(sa.text("DROP INDEX IF EXISTS ix_merchant_aliases_user_id"))
    conn.execute(
        sa.text("ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS uq_merchant_alias_user_raw")
    )
    conn.execute(
        sa.text("ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS fk_merchant_aliases_user_id")
    )
    conn.execute(sa.text("ALTER TABLE merchant_aliases DROP COLUMN IF EXISTS user_id"))
