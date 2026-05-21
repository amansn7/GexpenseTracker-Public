"""add production indexes for query-hot columns

Revision ID: 0034_add_production_indexes
Revises: 0033_move_startup_ddl_to_alembic
Create Date: 2026-05-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0034_add_production_indexes'
down_revision: Union[str, None] = '0033_move_startup_ddl_to_alembic'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_transactions_email_id', 'transactions', ['email_id'], if_not_exists=True)
    op.create_index('ix_transactions_txn_date', 'transactions', ['txn_date'], if_not_exists=True)
    op.create_index('ix_transactions_label_status', 'transactions', ['label', 'status'], if_not_exists=True)
    op.create_index('ix_transactions_created_at', 'transactions', ['created_at'], if_not_exists=True)
    op.create_index('ix_emails_sender_domain', 'emails', ['sender_domain'], if_not_exists=True)
    op.create_index('ix_emails_user_received', 'emails', ['user_id', 'received_at'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_transactions_email_id', table_name='transactions')
    op.drop_index('ix_transactions_txn_date', table_name='transactions')
    op.drop_index('ix_transactions_label_status', table_name='transactions')
    op.drop_index('ix_transactions_created_at', table_name='transactions')
    op.drop_index('ix_emails_sender_domain', table_name='emails')
    op.drop_index('ix_emails_user_received', table_name='emails')
