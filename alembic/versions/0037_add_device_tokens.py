"""add device_tokens and refresh_token_blacklist tables

Revision ID: 0037_add_device_tokens
Revises: 0036_merge_heads
Create Date: 2026-05-21 00:01:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0037_add_device_tokens"
down_revision: Union[str, None] = "0036_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "device_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token", sa.String(512), nullable=False, unique=True),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_device_tokens_user_id", "device_tokens", ["user_id"])

    op.create_table(
        "refresh_token_blacklist",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("jti", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "blacklisted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_refresh_token_blacklist_user_id", "refresh_token_blacklist", ["user_id"])
    op.create_index("ix_refresh_token_blacklist_jti", "refresh_token_blacklist", ["jti"])


def downgrade() -> None:
    op.drop_index("ix_refresh_token_blacklist_jti", table_name="refresh_token_blacklist")
    op.drop_index("ix_refresh_token_blacklist_user_id", table_name="refresh_token_blacklist")
    op.drop_table("refresh_token_blacklist")
    op.drop_index("ix_device_tokens_user_id", table_name="device_tokens")
    op.drop_table("device_tokens")
