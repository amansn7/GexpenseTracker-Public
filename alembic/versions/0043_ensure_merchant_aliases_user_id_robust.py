"""ensure merchant_aliases.user_id exists (direct DDL, no batch_alter_table)

Previous migrations 0039 and 0042 attempted to add user_id via batch_alter_table
and information_schema checks, but on PostgreSQL these sometimes fail to actually
materialize the column on the live table. This migration uses pure PostgreSQL DDL
with IF NOT EXISTS / IF EXISTS guards for full idempotence.

Revision ID: 0043
Revises: 0042
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0043"
down_revision: Union[str, Sequence[str], None] = "0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    # 1. Add column idempotently (PostgreSQL 9.6+)
    op.execute(
        "ALTER TABLE merchant_aliases ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)"
    )

    # 2. Backfill NULL rows to the owner user
    op.execute("""
        UPDATE merchant_aliases SET user_id = (
            SELECT id FROM users WHERE role = 'owner'
              AND email != 'service@localhost'
            LIMIT 1
        ) WHERE user_id IS NULL
    """)

    # 3. Make NOT NULL
    op.execute("ALTER TABLE merchant_aliases ALTER COLUMN user_id SET NOT NULL")

    # 4. Add FK constraint (guard against pre-existence from 0039 batch)
    op.execute("""
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
    """)

    # 5. Unique constraint: drop old-style if present, create composite if missing
    op.execute(
        "ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS merchant_aliases_raw_key"
    )
    op.execute("""
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
    """)

    # 6. Index
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_merchant_aliases_user_id"
        " ON merchant_aliases (user_id)"
    )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    op.execute("DROP INDEX IF EXISTS ix_merchant_aliases_user_id")
    op.execute(
        "ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS uq_merchant_alias_user_raw"
    )
    op.execute(
        "ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS fk_merchant_aliases_user_id"
    )
    op.execute("ALTER TABLE merchant_aliases DROP COLUMN IF EXISTS user_id")
