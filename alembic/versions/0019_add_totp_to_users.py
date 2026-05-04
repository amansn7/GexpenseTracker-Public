"""add totp columns to users

Revision ID: 0019
Revises: 0018
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_secret_pending", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "totp_secret_pending")
    op.drop_column("users", "totp_secret")
    op.drop_column("users", "totp_enabled")
