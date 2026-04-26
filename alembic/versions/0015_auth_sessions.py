"""auth: sessions table, emails.user_id, allowed_emails, account tokens

Revision ID: 0015
Revises: 0014
Create Date: 2026-04-26 00:00:00.000000
"""
from typing import Sequence, Union
import uuid
from alembic import op
import sqlalchemy as sa

revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.LargeBinary(32), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_sessions_token', 'sessions', ['token'])
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'])

    # 2. allowed_emails on user_settings
    op.add_column('user_settings', sa.Column('allowed_emails', sa.Text(), nullable=True))

    # 3. token columns on connected_accounts
    op.add_column('connected_accounts', sa.Column('access_token', sa.Text(), nullable=True))
    op.add_column('connected_accounts', sa.Column('refresh_token', sa.Text(), nullable=True))
    op.add_column('connected_accounts', sa.Column('token_expiry', sa.DateTime(timezone=True), nullable=True))

    # 4. emails.user_id — add nullable, seed service user, backfill, then constrain
    bind = op.get_bind()

    # Create service user (idempotent)
    service_id = str(uuid.uuid4())
    bind.execute(
        sa.text(
            "INSERT INTO users (id, email, role, status, onboarding_complete, created_at, updated_at) "
            "VALUES (:id, 'service@localhost', 'owner', 'active', true, now(), now()) "
            "ON CONFLICT (email) DO NOTHING"
        ),
        {"id": service_id}
    )
    row = bind.execute(
        sa.text("SELECT id FROM users WHERE email = 'service@localhost'")
    ).fetchone()
    actual_service_id = row[0]

    op.add_column('emails', sa.Column('user_id', sa.String(36), nullable=True))
    op.create_foreign_key('fk_emails_user_id', 'emails', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    bind.execute(sa.text("UPDATE emails SET user_id = :uid"), {"uid": actual_service_id})
    op.alter_column('emails', 'user_id', nullable=False)
    op.create_index('ix_emails_user_id', 'emails', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_emails_user_id', table_name='emails')
    op.drop_constraint('fk_emails_user_id', 'emails', type_='foreignkey')
    op.drop_column('emails', 'user_id')
    op.drop_column('connected_accounts', 'token_expiry')
    op.drop_column('connected_accounts', 'refresh_token')
    op.drop_column('connected_accounts', 'access_token')
    op.drop_column('user_settings', 'allowed_emails')
    op.drop_index('ix_sessions_user_id', table_name='sessions')
    op.drop_index('ix_sessions_token', table_name='sessions')
    op.drop_table('sessions')
