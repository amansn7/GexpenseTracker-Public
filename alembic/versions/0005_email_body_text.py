"""add body_text to emails

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-12 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('emails', sa.Column('body_text', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('emails', 'body_text')
