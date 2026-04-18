"""add pattern_rules table

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-13 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pattern_rules',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('regex_pattern', sa.Text(), nullable=False, unique=True),
        sa.Column('label', sa.String(20), nullable=False),
        sa.Column('merchant', sa.String(255), nullable=True),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0.88'),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('source', sa.String(20), nullable=False, server_default='llm_generated'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('pattern_rules')
