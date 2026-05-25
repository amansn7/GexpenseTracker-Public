"""move startup DDL to alembic migration

Revision ID: 0033_move_startup_ddl_to_alembic
Revises: 0032_add_query_indexes
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '0033_move_startup_ddl_to_alembic'
down_revision: Union[str, None] = '0032_add_query_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sync_state ADD COLUMN user_id VARCHAR(36) REFERENCES users(id)"
    )
    op.execute(
        "ALTER TABLE filter_rules ADD COLUMN user_id VARCHAR(36) REFERENCES users(id)"
    )
    op.execute(
        "ALTER TABLE transactions ADD COLUMN payment_mode VARCHAR(20)"
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    cols = [c["name"] for c in inspector.get_columns("transactions")]
    if "payment_mode" in cols:
        op.drop_column("transactions", "payment_mode")

    cols = [c["name"] for c in inspector.get_columns("filter_rules")]
    if "user_id" in cols:
        op.drop_column("filter_rules", "user_id")

    cols = [c["name"] for c in inspector.get_columns("sync_state")]
    if "user_id" in cols:
        op.drop_column("sync_state", "user_id")
