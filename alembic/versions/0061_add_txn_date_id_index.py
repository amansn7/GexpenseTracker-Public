"""add composite index on (txn_date, id) for cursor-based pagination

Revision ID: 0061
Revises: 0060
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0061'
down_revision: Union[str, None] = '0060'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.create_index("ix_transactions_txn_date_id", ["txn_date", "id"])
    else:
        op.create_index(
            "ix_transactions_txn_date_id",
            "transactions",
            ["txn_date", "id"],
            postgresql_using="btree",
        )


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.drop_index("ix_transactions_txn_date_id")
    else:
        op.drop_index("ix_transactions_txn_date_id", table_name="transactions")
