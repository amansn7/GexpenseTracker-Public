"""add_export_jobs

Revision ID: f6ea7cca8531
Revises: 0052
Create Date: 2026-06-03 05:30:57.199160

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6ea7cca8531'
down_revision: Union[str, None] = '0052'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('export_jobs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('filters', sa.JSON(), nullable=True),
    sa.Column('row_count', sa.Integer(), nullable=True),
    sa.Column('file_path', sa.String(length=512), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('export_jobs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_export_jobs_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('export_jobs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_export_jobs_user_id'))
    op.drop_table('export_jobs')
