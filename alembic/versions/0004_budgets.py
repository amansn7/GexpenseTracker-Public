"""add budgets table

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-11 00:04:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budgets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('monthly_limit', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category', name='budgets_category_key'),
    )


def downgrade() -> None:
    op.drop_table('budgets')
