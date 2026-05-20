"""move startup DDL to alembic migration

Revision ID: 0033_move_startup_ddl_to_alembic
Revises: 0032_add_query_indexes
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0033_move_startup_ddl_to_alembic'
down_revision: Union[str, None] = '0032_add_query_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id)"
    )
    op.execute(
        "ALTER TABLE filter_rules ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id)"
    )
    op.execute(
        "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(20)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE transactions DROP COLUMN IF EXISTS payment_mode")
    op.execute("ALTER TABLE filter_rules DROP COLUMN IF EXISTS user_id")
    op.execute("ALTER TABLE sync_state DROP COLUMN IF EXISTS user_id")
