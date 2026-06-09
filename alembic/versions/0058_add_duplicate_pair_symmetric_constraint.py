"""add symmetric unique index on duplicate_pairs to prevent mirrored pairs

Revision ID: 0057
Revises: 0056
Create Date: 2026-06-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0058'
down_revision: Union[str, None] = '0057'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    # ── Preflight: remove mirrored pairs ─────────────────────────────────
    # Delete rows where a mirrored entry exists (keeps the lower-ID row).
    # Uses a self-join to find pairs (A,B) and (B,A) and removes the higher-ID one.
    conn = op.get_bind()
    if _is_sqlite():
        # SQLite: use rowid-based approach for self-join deletion
        conn.exec_driver_sql(
            "DELETE FROM duplicate_pairs WHERE id IN ("
            "  SELECT dp1.id FROM duplicate_pairs dp1 "
            "  INNER JOIN duplicate_pairs dp2 "
            "    ON dp1.primary_tx_id = dp2.duplicate_tx_id "
            "   AND dp1.duplicate_tx_id = dp2.primary_tx_id "
            "   AND dp1.id > dp2.id"
            ")"
        )
        # Also remove exact duplicates (same primary_tx_id + duplicate_tx_id)
        conn.exec_driver_sql(
            "DELETE FROM duplicate_pairs WHERE id NOT IN ("
            "  SELECT MIN(id) FROM duplicate_pairs "
            "  GROUP BY primary_tx_id, duplicate_tx_id"
            ")"
        )
    else:
        # PostgreSQL
        conn.exec_driver_sql(
            "DELETE FROM duplicate_pairs WHERE id IN ("
            "  SELECT dp1.id FROM duplicate_pairs dp1 "
            "  INNER JOIN duplicate_pairs dp2 "
            "    ON dp1.primary_tx_id = dp2.duplicate_tx_id "
            "   AND dp1.duplicate_tx_id = dp2.primary_tx_id "
            "   AND dp1.id > dp2.id"
            ")"
        )
        conn.exec_driver_sql(
            "DELETE FROM duplicate_pairs WHERE id NOT IN ("
            "  SELECT MIN(id) FROM duplicate_pairs "
            "  GROUP BY primary_tx_id, duplicate_tx_id"
            ")"
        )

    # ── Add symmetric unique index ───────────────────────────────────────
    # This functional index normalizes the pair ordering so that (A,B) and (B,A)
    # are treated as the same key, preventing mirrored pairs at the DB level.
    if _is_sqlite():
        with op.batch_alter_table("duplicate_pairs") as batch_op:
            batch_op.create_index(
                "uq_duplicate_pair_symmetric",
                [sa.text("MIN(primary_tx_id, duplicate_tx_id), MAX(primary_tx_id, duplicate_tx_id)")],
                unique=True,
            )
    else:
        op.create_index(
            "uq_duplicate_pair_symmetric",
            "duplicate_pairs",
            [sa.text("LEAST(primary_tx_id, duplicate_tx_id), GREATEST(primary_tx_id, duplicate_tx_id)")],
            unique=True,
            postgresql_using="btree",
        )


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("duplicate_pairs") as batch_op:
            batch_op.drop_index("uq_duplicate_pair_symmetric")
    else:
        op.drop_index("uq_duplicate_pair_symmetric", table_name="duplicate_pairs")
