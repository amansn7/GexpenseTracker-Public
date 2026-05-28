"""add ON DELETE CASCADE to transaction_corrections FK

The transaction_corrections.transaction_id FK was created without
ondelete=CASCADE in migration 0030. This causes ForeignKeyViolationError
when resolve_pair deletes a transaction that has correction records.

Revision ID: 0046
Revises: 0045
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0046"
down_revision: Union[str, None] = "0045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    op.drop_constraint(
        "transaction_corrections_transaction_id_fkey",
        "transaction_corrections",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "transaction_corrections_transaction_id_fkey",
        "transaction_corrections",
        "transactions",
        ["transaction_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        return
    op.drop_constraint(
        "transaction_corrections_transaction_id_fkey",
        "transaction_corrections",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "transaction_corrections_transaction_id_fkey",
        "transaction_corrections",
        "transactions",
        ["transaction_id"],
        ["id"],
    )
