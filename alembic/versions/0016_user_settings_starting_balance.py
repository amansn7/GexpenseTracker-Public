"""user_settings: add starting_balance and starting_balance_date

Revision ID: 0016
Revises: 0015
Create Date: 2026-04-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user_settings', sa.Column('starting_balance', sa.Numeric(12, 2), nullable=True))
    op.add_column('user_settings', sa.Column('starting_balance_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('user_settings', 'starting_balance_date')
    op.drop_column('user_settings', 'starting_balance')
