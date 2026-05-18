"""add transaction_corrections table

Revision ID: 0030_add_transaction_corrections
Revises: 0029_add_api_key_rotation
Create Date: 2026-05-18 07:54:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0030_add_transaction_corrections'
down_revision: Union[str, None] = '0029_add_api_key_rotation'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'transaction_corrections',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('transaction_id', sa.String(36), sa.ForeignKey('transactions.id'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('old_label', sa.String(20), nullable=True),
        sa.Column('new_label', sa.String(20), nullable=True),
        sa.Column('old_category', sa.String(100), nullable=True),
        sa.Column('new_category', sa.String(100), nullable=True),
        sa.Column('old_merchant', sa.String(255), nullable=True),
        sa.Column('new_merchant', sa.String(255), nullable=True),
        sa.Column('old_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('new_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('corrected_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('transaction_corrections')
