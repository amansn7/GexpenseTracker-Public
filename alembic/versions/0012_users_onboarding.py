"""add users onboarding profile and settings tables

Revision ID: 0012
Revises: 0011
Create Date: 2026-04-22 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='member'),
        sa.Column('status', sa.String(20), nullable=False, server_default='invited'),
        sa.Column('onboarding_complete', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('email', name='uq_users_email'),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    op.create_table(
        'user_profiles',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('full_name', sa.String(255), nullable=False),
        sa.Column('display_name', sa.String(120), nullable=True),
        sa.Column('phone', sa.String(40), nullable=True),
        sa.Column('location', sa.String(120), nullable=True),
        sa.Column('avatar_url', sa.String(500), nullable=True),
        sa.Column('default_currency', sa.String(3), nullable=False, server_default='INR'),
        sa.Column('timezone', sa.String(80), nullable=False, server_default='Asia/Kolkata'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        'user_settings',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('daily_digest', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('low_confidence_alerts', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('auto_categorize', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('show_confidence', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('sound_effects', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('two_factor_enabled', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('confidence_threshold', sa.Integer(), nullable=False, server_default='70'),
        sa.Column('monthly_ai_budget', sa.Numeric(12, 2), nullable=True),
        sa.Column('active_ai_service_id', sa.String(36), nullable=True),
        sa.Column('digest_hour', sa.Integer(), nullable=False, server_default='9'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        'connected_accounts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(40), nullable=False),
        sa.Column('account_email', sa.String(255), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='disconnected'),
        sa.Column('external_id', sa.String(255), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'provider', 'account_email', name='uq_connected_account_user_provider_email'),
    )
    op.create_index('ix_connected_accounts_user_id', 'connected_accounts', ['user_id'])

    op.create_table(
        'user_categories',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('color', sa.String(20), nullable=False, server_default='#dcd5c3'),
        sa.Column('icon', sa.String(40), nullable=True),
        sa.Column('kind', sa.String(20), nullable=False, server_default='expense'),
        sa.Column('active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('user_id', 'name', name='uq_user_category_name'),
    )
    op.create_index('ix_user_categories_user_id', 'user_categories', ['user_id'])

    op.create_table(
        'user_ai_services',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(60), nullable=False),
        sa.Column('display_name', sa.String(120), nullable=False),
        sa.Column('model_id', sa.String(160), nullable=False),
        sa.Column('base_url', sa.String(500), nullable=True),
        sa.Column('auth_header', sa.String(40), nullable=False, server_default='bearer'),
        sa.Column('api_key_hint', sa.String(40), nullable=True),
        sa.Column('encrypted_api_key', sa.Text(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_user_ai_services_user_id', 'user_ai_services', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_user_ai_services_user_id', table_name='user_ai_services')
    op.drop_table('user_ai_services')
    op.drop_index('ix_user_categories_user_id', table_name='user_categories')
    op.drop_table('user_categories')
    op.drop_index('ix_connected_accounts_user_id', table_name='connected_accounts')
    op.drop_table('connected_accounts')
    op.drop_table('user_settings')
    op.drop_table('user_profiles')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_table('users')
