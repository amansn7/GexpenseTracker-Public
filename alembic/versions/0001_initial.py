"""initial

Revision ID: 0001
Revises:
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### emails table ###
    op.create_table(
        'emails',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('gmail_id', sa.String(length=255), nullable=False),
        sa.Column('subject', sa.Text(), nullable=True),
        sa.Column('sender', sa.String(length=500), nullable=True),
        sa.Column('sender_domain', sa.String(length=255), nullable=True),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('body_snippet', sa.Text(), nullable=True),
        sa.Column('gmail_link', sa.String(length=500), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('gmail_id'),
    )

    # ### transactions table ###
    op.create_table(
        'transactions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('email_id', sa.String(length=36), nullable=False),
        sa.Column('label', sa.String(length=20), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('merchant', sa.String(length=255), nullable=True),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('txn_date', sa.Date(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('classifier_method', sa.String(length=10), nullable=True),
        sa.Column('user_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['email_id'], ['emails.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )

    # ### sync_state table ###
    op.create_table(
        'sync_state',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_history_id', sa.String(length=255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # ### sender_rules table ###
    op.create_table(
        'sender_rules',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('sender_domain', sa.String(length=255), nullable=False),
        sa.Column('label', sa.String(length=20), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sender_domain'),
    )


def downgrade() -> None:
    op.drop_table('sender_rules')
    op.drop_table('sync_state')
    op.drop_table('transactions')
    op.drop_table('emails')
