"""add query indexes for transactions and emails

Revision ID: 0032_add_query_indexes
Revises: 0031_add_sync_progress
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0032_add_query_indexes'
down_revision: Union[str, None] = '0031_add_sync_progress'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_transactions_email_id', 'transactions', ['email_id'], if_not_exists=True)
    op.create_index('ix_transactions_txn_date', 'transactions', ['txn_date'], if_not_exists=True)
    op.create_index('ix_transactions_label', 'transactions', ['label'], if_not_exists=True)
    op.create_index('ix_transactions_status', 'transactions', ['status'], if_not_exists=True)
    op.create_index('ix_emails_sender_domain', 'emails', ['sender_domain'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_transactions_status', table_name='transactions')
    op.drop_index('ix_transactions_label', table_name='transactions')
    op.drop_index('ix_transactions_txn_date', table_name='transactions')
    op.drop_index('ix_transactions_email_id', table_name='transactions')
    op.drop_index('ix_emails_sender_domain', table_name='emails')
