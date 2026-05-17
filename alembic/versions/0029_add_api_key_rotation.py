"""add api key rotation fields to user_ai_services

Revision ID: 0029_add_api_key_rotation
Revises: 0028_add_audit_logs
Create Date: 2026-05-16 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0029_add_api_key_rotation'
down_revision: Union[str, None] = '0028_add_audit_logs'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_ai_services', sa.Column('last_rotated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('user_ai_services', sa.Column('key_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('user_ai_services', sa.Column('rotation_enabled', sa.Boolean(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('user_ai_services', 'rotation_enabled')
    op.drop_column('user_ai_services', 'key_expires_at')
    op.drop_column('user_ai_services', 'last_rotated_at')
