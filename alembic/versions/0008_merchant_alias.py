"""add merchant_aliases table

Revision ID: 0008
Revises: 0007
Create Date: 2026-04-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'merchant_aliases',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('raw', sa.String(255), nullable=False, unique=True),
        sa.Column('canonical', sa.String(255), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('source', sa.String(20), nullable=False, server_default='fuzzy_learned'),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('merchant_aliases')
