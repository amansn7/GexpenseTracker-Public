"""Add audit log created_at and composite user_id+created_at indexes

Revision ID: 0056
Revises: 0055
Create Date: 2026-06-04 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = '0056'
down_revision: Union[str, None] = '0055'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'], if_not_exists=True)
    op.create_index('ix_audit_logs_user_id_created_at', 'audit_logs', ['user_id', 'created_at'], if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_logs_user_id_created_at', table_name='audit_logs')
