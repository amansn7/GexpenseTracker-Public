"""Add last_dedup_scan_at to sync_state

Revision ID: 0062
Revises: 1a64dff10894
Create Date: 2026-06-05 00:00:00.000000

This column tracks when each user's last periodic dedup scan completed.
NULL means never scanned — the adaptive dedup job will scan those users first.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0062"
down_revision: Union[str, None] = "1a64dff10894"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("sync_state") as batch_op:
            batch_op.add_column(sa.Column("last_dedup_scan_at", sa.DateTime(timezone=True), nullable=True))
    else:
        op.add_column("sync_state", sa.Column("last_dedup_scan_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("sync_state") as batch_op:
            batch_op.drop_column("last_dedup_scan_at")
    else:
        op.drop_column("sync_state", "last_dedup_scan_at")
