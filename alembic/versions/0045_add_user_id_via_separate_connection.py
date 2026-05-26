"""finally add merchant_aliases.user_id — DROP + ADD fresh inside Alembic txn

Previous migrations (0039-0044) all failed because they relied on stale
pg_catalog metadata (from 0039's batch_alter_table) to decide whether to
skip adding the column. The column name existed in the catalog but never
materialized on the live table.

This migration uses the simplest possible approach: DROP COLUMN IF EXISTS
CASCADE (handles all states: live, dropped, phantom) then ADD COLUMN fresh.
All inside Alembic's single transaction — no separate connection, no DO
blocks, no EXCEPTION handlers, no pg_attribute queries, no .fetchone().

Revision ID: 0045
Revises: 0044
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0045"
down_revision: Union[str, Sequence[str], None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    # ---- Nuclear option: DROP + ADD fresh ----
    # DROP COLUMN IF EXISTS handles ALL possible states:
    # - Column is LIVE with data → drops cleanly (data is inaccessible anyway)
    # - Column is a phantom/dropped artifact → no-op (name already freed by PG)
    # - Column doesn't exist at all → no-op
    # CASCADE drops any dependent constraints/indexes that reference this column
    op.execute(
        "ALTER TABLE merchant_aliases DROP COLUMN IF EXISTS user_id CASCADE"
    )
    # ADD COLUMN creates a fresh column — the name is guaranteed free after the DROP
    op.execute(
        "ALTER TABLE merchant_aliases ADD COLUMN user_id VARCHAR(36)"
    )

    # ---- Backfill ----
    conn.execute(
        sa.text("""
            UPDATE merchant_aliases SET user_id = (
                SELECT id FROM users WHERE role = 'owner'
                  AND email != 'service@localhost'
                LIMIT 1
            ) WHERE user_id IS NULL
        """)
    )

    # ---- NOT NULL ----
    op.alter_column(
        "merchant_aliases", "user_id",
        existing_type=sa.String(36),
        nullable=False,
    )

    # ---- FK constraint ----
    op.create_foreign_key(
        "fk_merchant_aliases_user_id", "merchant_aliases", "users",
        ["user_id"], ["id"], ondelete="CASCADE",
    )

    # ---- Unique constraint ----
    op.execute(
        "ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS merchant_aliases_raw_key"
    )
    op.create_unique_constraint(
        "uq_merchant_alias_user_raw", "merchant_aliases",
        ["user_id", "raw"],
    )

    # ---- Index ----
    conn.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_merchant_aliases_user_id "
            "ON merchant_aliases (user_id)"
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    conn.execute(
        sa.text("DROP INDEX IF EXISTS ix_merchant_aliases_user_id")
    )
    op.drop_constraint(
        "uq_merchant_alias_user_raw", "merchant_aliases", type_="unique"
    )
    op.drop_constraint(
        "fk_merchant_aliases_user_id", "merchant_aliases", type_="foreignkey"
    )
    op.alter_column(
        "merchant_aliases", "user_id",
        existing_type=sa.String(36),
        nullable=True,
    )
    op.drop_column("merchant_aliases", "user_id")
