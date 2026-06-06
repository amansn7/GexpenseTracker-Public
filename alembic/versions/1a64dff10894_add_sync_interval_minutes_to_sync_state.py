"""Add sync_interval_minutes to sync_state

Revision ID: 1a64dff10894
Revises: 0060
Create Date: 2026-06-05 11:20:04.666152

This column enables per-user adaptive sync intervals. When set, it overrides
the global SYNC_INTERVAL_HOURS for that user. NULL means use the global default.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1a64dff10894"
down_revision: Union[str, None] = "0061"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("sync_state") as batch_op:
            batch_op.add_column(sa.Column("sync_interval_minutes", sa.Integer(), nullable=True))
    else:
        op.add_column("sync_state", sa.Column("sync_interval_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("sync_state") as batch_op:
            batch_op.drop_column("sync_interval_minutes")
    else:
        op.drop_column("sync_state", "sync_interval_minutes")
