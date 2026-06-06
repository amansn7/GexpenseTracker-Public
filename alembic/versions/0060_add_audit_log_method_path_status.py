"""add method, path, status_code columns to audit_logs

Revision ID: 0060
Revises: 0059
Create Date: 2026-06-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0060"
down_revision: Union[str, None] = "0059"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("audit_logs") as batch_op:
            batch_op.add_column(sa.Column("method", sa.String(10), nullable=True))
            batch_op.add_column(sa.Column("path", sa.String(500), nullable=True))
            batch_op.add_column(sa.Column("status_code", sa.Integer(), nullable=True))
            batch_op.alter_column("action", type_=sa.String(255), existing_type=sa.String(50))
    else:
        op.add_column("audit_logs", sa.Column("method", sa.String(10), nullable=True))
        op.add_column("audit_logs", sa.Column("path", sa.String(500), nullable=True))
        op.add_column("audit_logs", sa.Column("status_code", sa.Integer(), nullable=True))
        op.alter_column("audit_logs", "action", type_=sa.String(255), existing_type=sa.String(50))


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("audit_logs") as batch_op:
            batch_op.drop_column("status_code")
            batch_op.drop_column("path")
            batch_op.drop_column("method")
            batch_op.alter_column("action", type_=sa.String(50), existing_type=sa.String(255))
    else:
        op.drop_column("audit_logs", "status_code")
        op.drop_column("audit_logs", "path")
        op.drop_column("audit_logs", "method")
        op.alter_column("audit_logs", "action", type_=sa.String(50), existing_type=sa.String(255))
