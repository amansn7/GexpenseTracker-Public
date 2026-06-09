"""Add webauthn_credentials table and passkeys_enabled column to users

Revision ID: 0053
Revises: f6ea7cca8531
Create Date: 2026-06-03 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0053'
down_revision: Union[str, None] = 'f6ea7cca8531'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('passkeys_enabled', sa.Boolean(), nullable=False, server_default='0'))
    op.create_table(
        'webauthn_credentials',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('credential_id', sa.String(512), nullable=False, unique=True),
        sa.Column('public_key', sa.Text, nullable=False),
        sa.Column('sign_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('device_name', sa.String(120), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('webauthn_credentials')
    op.drop_column('users', 'passkeys_enabled')
