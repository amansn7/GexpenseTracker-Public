"""add transaction_type column with backfill

Revision ID: 0026
Revises: 0025
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE transactions "
        "ADD COLUMN transaction_type VARCHAR(20) NULL"
    )

    op.execute(
        "UPDATE transactions SET transaction_type = 'purchase' "
        "WHERE label = 'expense' AND transaction_type IS NULL"
    )
    op.execute(
        "UPDATE transactions SET transaction_type = 'income' "
        "WHERE label = 'income' AND transaction_type IS NULL"
    )
    op.execute(
        "UPDATE transactions SET transaction_type = 'cc_payment' "
        "WHERE label = 'ignore' AND category = 'CC Payment' AND transaction_type IS NULL"
    )
    op.execute(
        "UPDATE transactions SET transaction_type = 'investment' "
        "WHERE label = 'expense' AND category = 'Investment' AND transaction_type IS NULL"
    )


def downgrade() -> None:
    op.drop_column("transactions", "transaction_type")
