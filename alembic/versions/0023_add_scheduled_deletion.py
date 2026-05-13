"""add scheduled_deletion_at to users

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("scheduled_deletion_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "scheduled_deletion_at")
