"""Drop salary_shift_enabled and salary_shift_window from user_settings

Revision ID: 0052
Revises: 0051
Create Date: 2026-06-02 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0052'
down_revision: Union[str, None] = '0051'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('user_settings', 'salary_shift_window')
    op.drop_column('user_settings', 'salary_shift_enabled')


def downgrade() -> None:
    op.add_column('user_settings', sa.Column('salary_shift_enabled', sa.Boolean(), nullable=False, server_default='0'))
    op.add_column('user_settings', sa.Column('salary_shift_window', sa.Integer(), nullable=False, server_default='3'))
