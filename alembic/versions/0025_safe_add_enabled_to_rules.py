"""safely add enabled column with IF NOT EXISTS

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sender_rules "
        "ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE"
    )
    op.execute(
        "ALTER TABLE pattern_rules "
        "ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.drop_column("pattern_rules", "enabled")
    op.drop_column("sender_rules", "enabled")
