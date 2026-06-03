"""Add invitations table

Revision ID: 0054
Revises: 0053
Create Date: 2026-06-03 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0054'
down_revision: Union[str, None] = '0053'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'invitations',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('email', sa.String(255), nullable=False, index=True),
        sa.Column('invited_by', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("(now() at time zone 'utc')")),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text("(now() at time zone 'utc')")),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('invitations')
