"""add redirect_uri to oauth_states for Capacitor OAuth callback flow

Revision ID: 0065
Revises: 0064
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0065"
down_revision: Union[str, None] = "0064"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "oauth_states",
        sa.Column("redirect_uri", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("oauth_states", "redirect_uri")
