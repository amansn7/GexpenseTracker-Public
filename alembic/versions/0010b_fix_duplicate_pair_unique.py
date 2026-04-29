"""add unique constraint to duplicate_pairs

Revision ID: 0010b
Revises: 0010
Create Date: 2026-04-19 00:00:01.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = '0010b'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = {uc['name'] for uc in inspector.get_unique_constraints('duplicate_pairs')}
    if 'uq_duplicate_pair' not in existing:
        with op.batch_alter_table('duplicate_pairs') as batch_op:
            batch_op.create_unique_constraint('uq_duplicate_pair', ['primary_tx_id', 'duplicate_tx_id'])


def downgrade() -> None:
    with op.batch_alter_table('duplicate_pairs') as batch_op:
        batch_op.drop_constraint('uq_duplicate_pair', type_='unique')
