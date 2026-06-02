"""Add body_dates and reference_ids columns to emails table

Revision ID: 0051
Revises: 0050
Create Date: 2026-06-02 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0051'
down_revision: Union[str, None] = '0050'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('emails', sa.Column('body_dates', sa.JSON(), nullable=True))
    op.add_column('emails', sa.Column('reference_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('emails', 'reference_ids')
    op.drop_column('emails', 'body_dates')
