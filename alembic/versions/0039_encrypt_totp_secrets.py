"""widen totp_secret columns to String(256) for encrypted values

Revision ID: 0039
Revises: 0038
Create Date: 2026-05-21
"""
import sqlalchemy as sa
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "totp_secret",
            type_=sa.String(256),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "totp_secret_pending",
            type_=sa.String(256),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "totp_secret",
            type_=sa.String(64),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "totp_secret_pending",
            type_=sa.String(64),
            existing_nullable=True,
        )
