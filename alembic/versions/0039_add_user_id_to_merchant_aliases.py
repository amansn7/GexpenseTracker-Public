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
    op.add_column(
        "merchant_aliases",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_merchant_aliases_user_id", "merchant_aliases", ["user_id"])

    # Drop old global unique constraint on raw; replace with per-user unique
    op.drop_constraint("merchant_aliases_raw_key", "merchant_aliases", type_="unique")
    op.create_unique_constraint(
        "uq_merchant_alias_user_raw", "merchant_aliases", ["user_id", "raw"]
    )

    # Backfill existing rows to the owner user
    op.execute("""
        UPDATE merchant_aliases SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint("uq_merchant_alias_user_raw", "merchant_aliases", type_="unique")
    op.create_unique_constraint(
        "merchant_aliases_raw_key", "merchant_aliases", ["raw"]
    )
    op.drop_index("ix_merchant_aliases_user_id", "merchant_aliases")
    op.drop_column("merchant_aliases", "user_id")
