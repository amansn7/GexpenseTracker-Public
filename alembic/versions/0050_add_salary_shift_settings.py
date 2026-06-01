"""Add salary_shift_enabled and salary_shift_window to user_settings

Revision ID: 0050
Revises: 0049
Create Date: 2026-06-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0050'
down_revision: Union[str, None] = '0049'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('salary_shift_enabled', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('user_settings', sa.Column('salary_shift_window', sa.Integer(), nullable=False, server_default='3'))


def downgrade() -> None:
    op.drop_column('user_settings', 'salary_shift_window')
    op.drop_column('user_settings', 'salary_shift_enabled')
