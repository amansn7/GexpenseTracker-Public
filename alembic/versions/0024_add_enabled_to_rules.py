"""add enabled column to sender_rules and pattern_rules

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sender_rules",
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "pattern_rules",
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("pattern_rules", "enabled")
    op.drop_column("sender_rules", "enabled")
