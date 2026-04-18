"""add classification_log table

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-18 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'classification_log',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email_id', sa.String(36), sa.ForeignKey('emails.id'), nullable=True),
        sa.Column('sender_domain', sa.String(255), nullable=True),
        sa.Column('subject', sa.Text(), nullable=True),
        sa.Column('body_snippet', sa.Text(), nullable=True),
        sa.Column('provider', sa.String(50), nullable=True),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('llm_label', sa.String(20), nullable=True),
        sa.Column('llm_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('llm_merchant', sa.String(255), nullable=True),
        sa.Column('llm_category', sa.String(100), nullable=True),
        sa.Column('llm_confidence', sa.Float(), nullable=True),
        sa.Column('llm_txn_date', sa.Date(), nullable=True),
        sa.Column('raw_response', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('classification_log')
