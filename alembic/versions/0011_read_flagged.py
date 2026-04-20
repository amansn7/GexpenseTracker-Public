"""add read and flagged columns to transactions

Revision ID: 0011
Revises: 0010b
Create Date: 2026-04-20 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0011'
down_revision: Union[str, None] = '0010b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('read', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('transactions', sa.Column('flagged', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('transactions', 'flagged')
    op.drop_column('transactions', 'read')
