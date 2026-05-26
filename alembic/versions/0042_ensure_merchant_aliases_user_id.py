"""ensure user_id column exists on merchant_aliases

Some production databases may not have received migration
0039_merchant_aliases_user_id. This migration idempotently
adds the column and backfills missing values.

Revision ID: 0042
Revises: 0041
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0042"
down_revision: Union[str, Sequence[str], None] = "0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == "postgresql":
        # Check if column already exists (idempotent)
        result = conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'merchant_aliases' AND column_name = 'user_id'"
            )
        )
        if result.scalar() is None:
            op.add_column(
                "merchant_aliases",
                sa.Column("user_id", sa.String(36), nullable=True),
            )
            op.create_foreign_key(
                "fk_merchant_aliases_user_id",
                "merchant_aliases",
                "users",
                ["user_id"],
                ["id"],
                ondelete="CASCADE",
            )
            op.drop_constraint("merchant_aliases_raw_key", type_="unique")
            op.create_unique_constraint(
                "uq_merchant_alias_user_raw",
                "merchant_aliases",
                ["user_id", "raw"],
            )
            op.create_index(
                "ix_merchant_aliases_user_id",
                "merchant_aliases",
                ["user_id"],
            )

            # Backfill missing user_id
            op.execute("""
                UPDATE merchant_aliases SET user_id = (
                    SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
                ) WHERE user_id IS NULL
            """)

            # Make NOT NULL (safe now after backfill)
            op.alter_column(
                "merchant_aliases",
                "user_id",
                existing_type=sa.String(36),
                nullable=False,
            )
        else:
            # Column exists; still ensure NOT NULL
            null_count = conn.execute(
                sa.text("SELECT COUNT(*) FROM merchant_aliases WHERE user_id IS NULL")
            ).scalar()
            if null_count > 0:
                conn.execute(sa.text("""
                    UPDATE merchant_aliases SET user_id = (
                        SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
                    ) WHERE user_id IS NULL
                """))
            op.alter_column(
                "merchant_aliases",
                "user_id",
                existing_type=sa.String(36),
                nullable=False,
            )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == "postgresql":
        result = conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'merchant_aliases' AND column_name = 'user_id'"
            )
        )
        if result.scalar() is not None:
            op.alter_column("merchant_aliases", "user_id", existing_type=sa.String(36), nullable=True)
