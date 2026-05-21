"""add llm_spend_tracker table

Revision ID: 0035_add_llm_spend_tracker
Revises: 0034_add_production_indexes
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0035_add_llm_spend_tracker'
down_revision: Union[str, None] = '0034_add_production_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'llm_spend_tracker',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('provider', sa.String(60), nullable=False),
        sa.Column('model', sa.String(160), nullable=False),
        sa.Column('calls', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tokens_in', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tokens_out', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost', sa.Numeric(12, 4), nullable=False, server_default='0'),
        sa.UniqueConstraint('user_id', 'date', 'provider', 'model', name='uq_llm_spend_user_date_provider_model'),
    )
    op.create_index('ix_llm_spend_tracker_user_id', 'llm_spend_tracker', ['user_id'])
    op.create_index('ix_llm_spend_tracker_date', 'llm_spend_tracker', ['date'])


def downgrade() -> None:
    op.drop_index('ix_llm_spend_tracker_date', table_name='llm_spend_tracker')
    op.drop_index('ix_llm_spend_tracker_user_id', table_name='llm_spend_tracker')
    op.drop_table('llm_spend_tracker')
