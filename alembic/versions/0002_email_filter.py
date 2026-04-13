"""add email_filter to sync_state

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-11 00:01:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'sync_state',
        sa.Column('email_filter', sa.String(length=10), server_default='all', nullable=False),
    )


def downgrade() -> None:
    op.drop_column('sync_state', 'email_filter')
