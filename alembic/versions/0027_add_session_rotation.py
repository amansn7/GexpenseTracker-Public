"""add last_rotated_at to sessions

Revision ID: 0027
Revises: 0026
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sessions "
        "ADD COLUMN IF NOT EXISTS last_rotated_at TIMESTAMP WITH TIME ZONE NULL"
    )


def downgrade() -> None:
    op.drop_column("sessions", "last_rotated_at")
