"""add sync_progress table

Revision ID: 0031_add_sync_progress
Revises: 0030_add_transaction_corrections
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0031_add_sync_progress'
down_revision: Union[str, None] = '0030_add_transaction_corrections'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sync_progress',
        sa.Column('user_id', sa.String(36), primary_key=True),
        sa.Column('running', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('phase', sa.String(64), nullable=False, server_default='idle'),
        sa.Column('phase_detail', sa.String(256), nullable=False, server_default=''),
        sa.Column('current', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('result_json', sa.Text(), nullable=True),
        sa.Column('error', sa.String(512), nullable=True),
        sa.Column('log_json', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('sync_progress')
