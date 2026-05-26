"""safely add enabled column with IF NOT EXISTS

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    for table in ["sender_rules", "pattern_rules"]:
        if "enabled" not in {c["name"] for c in inspector.get_columns(table)}:
            op.add_column(
                table,
                sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            )


def downgrade() -> None:
    op.drop_column("pattern_rules", "enabled")
    op.drop_column("sender_rules", "enabled")
