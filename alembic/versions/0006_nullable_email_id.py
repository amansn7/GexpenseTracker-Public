"""make email_id nullable on transactions

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-12 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.alter_column(
            'email_id',
            existing_type=sa.String(length=36),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.alter_column(
            'email_id',
            existing_type=sa.String(length=36),
            nullable=False,
        )
