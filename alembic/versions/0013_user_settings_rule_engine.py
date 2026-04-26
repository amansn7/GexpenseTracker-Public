"""add use_rule_engine to user_settings

Revision ID: 0013
Revises: 0012
Create Date: 2026-04-25 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_settings',
        sa.Column('use_rule_engine', sa.Boolean(), nullable=False, server_default='1'),
    )


def downgrade() -> None:
    op.drop_column('user_settings', 'use_rule_engine')
