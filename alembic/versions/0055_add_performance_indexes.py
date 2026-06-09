"""Add performance indexes for query-hot columns

Revision ID: 0055
Revises: 0054
Create Date: 2026-06-04 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = '0055'
down_revision: Union[str, None] = '0054'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Expression index for category-based stats queries (15+ paths)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_transactions_lower_category "
        "ON transactions (LOWER(category))"
    )

    # Composite indexes for common query patterns
    op.create_index('ix_transactions_email_id_txn_date', 'transactions', ['email_id', 'txn_date'], if_not_exists=True)
    op.create_index('ix_transactions_email_id_created_at', 'transactions', ['email_id', 'created_at'], if_not_exists=True)

    # ClassificationLog query indexes
    op.create_index('ix_classification_log_email_id', 'classification_log', ['email_id'], if_not_exists=True)
    op.create_index('ix_classification_log_created_at', 'classification_log', ['created_at'], if_not_exists=True)

    # DuplicatePair index for OR queries on duplicate_tx_id
    op.create_index('ix_duplicate_pairs_duplicate_tx_id', 'duplicate_pairs', ['duplicate_tx_id'], if_not_exists=True)

    # GoalContribution timeline queries
    op.create_index('ix_goal_contributions_contributed_at', 'goal_contributions', ['contributed_at'], if_not_exists=True)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_transactions_lower_category")
    op.execute("DROP INDEX IF EXISTS ix_transactions_email_id_txn_date")
    op.execute("DROP INDEX IF EXISTS ix_transactions_email_id_created_at")
    op.execute("DROP INDEX IF EXISTS ix_classification_log_email_id")
    op.execute("DROP INDEX IF EXISTS ix_classification_log_created_at")
    op.execute("DROP INDEX IF EXISTS ix_duplicate_pairs_duplicate_tx_id")
    op.execute("DROP INDEX IF EXISTS ix_goal_contributions_contributed_at")
