"""add user_id to merchant_aliases for IDOR fix

Revision ID: 0039_merchant_aliases_user_id
Revises: 0038
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0039_merchant_aliases_user_id"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == "postgresql":
        # Safety guard: skip if column already exists (avoids DuplicateColumn crash
        # when Alembic's transactional DDL replays 0039 from scratch after a failed
        # later migration rolled back alembic_version but not the DDL).
        col_exists = conn.execute(
            sa.text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = 'merchant_aliases' AND column_name = 'user_id'"
            )
        ).scalar()
        if col_exists:
            print("  merchant_aliases.user_id already exists — skipping 0039")
            return

    with op.batch_alter_table("merchant_aliases") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key("fk_merchant_aliases_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE")
        batch_op.drop_constraint("merchant_aliases_raw_key", type_="unique")
        batch_op.create_unique_constraint(
            "uq_merchant_alias_user_raw", ["user_id", "raw"]
        )
        batch_op.create_index("ix_merchant_aliases_user_id", ["user_id"])

    # Backfill existing rows to the owner user
    op.execute("""
        UPDATE merchant_aliases SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)


def downgrade() -> None:
    with op.batch_alter_table("merchant_aliases") as batch_op:
        batch_op.drop_constraint("uq_merchant_alias_user_raw", type_="unique")
        batch_op.create_unique_constraint(
            "merchant_aliases_raw_key", ["raw"]
        )
    op.drop_index("ix_merchant_aliases_user_id", "merchant_aliases")
    op.drop_column("merchant_aliases", "user_id")
