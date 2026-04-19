"""add duplicate_pairs and domain_pair_rules tables

Revision ID: 0010
Revises: 0009
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'domain_pair_rules',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('domain_a', sa.String(255), nullable=False),
        sa.Column('domain_b', sa.String(255), nullable=False),
        sa.Column('confirmed_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('dismissed_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0'),
        sa.Column('auto_resolve', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.UniqueConstraint('domain_a', 'domain_b', name='uq_domain_pair'),
    )
    op.create_table(
        'duplicate_pairs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('primary_tx_id', sa.String(36), sa.ForeignKey('transactions.id'), nullable=False),
        sa.Column('duplicate_tx_id', sa.String(36), sa.ForeignKey('transactions.id'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0'),
        sa.Column('rule_source', sa.String(20), nullable=False, server_default='amount_date'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('duplicate_pairs')
    op.drop_table('domain_pair_rules')
