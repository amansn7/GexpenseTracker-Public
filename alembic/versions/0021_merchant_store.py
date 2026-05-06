"""add category to merchant_aliases; add user_merchant_overrides

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "merchant_aliases",
        sa.Column("category", sa.String(100), nullable=True),
    )

    op.create_table(
        "user_merchant_overrides",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("merchant", sa.String(255), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("corrected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "merchant", name="uq_user_merchant_override"),
    )


def downgrade() -> None:
    op.drop_table("user_merchant_overrides")
    op.drop_column("merchant_aliases", "category")
