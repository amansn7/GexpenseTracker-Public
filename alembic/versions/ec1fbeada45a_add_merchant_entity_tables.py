"""add_merchant_entity_tables

Revision ID: ec1fbeada45a
Revises: 0027
Create Date: 2026-05-16 16:49:21.019397

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ec1fbeada45a'
down_revision: Union[str, None] = '0027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()

    if "merchant_entity_aliases" not in existing:
        op.create_table(
            'merchant_entity_aliases',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('canonical_name', sa.String(255), nullable=False),
            sa.Column('alias_name', sa.String(255), nullable=False),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint('alias_name', 'user_id', name='uq_merchant_alias_name_user'),
            sa.Index('ix_merchant_alias_canonical', 'canonical_name'),
            sa.Index('ix_merchant_alias_user_id', 'user_id'),
        )

    if "merchant_entities" not in existing:
        op.create_table(
            'merchant_entities',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('canonical_name', sa.String(255), unique=True, nullable=False),
            sa.Column('parent_entity', sa.String(255), nullable=True),
            sa.Column('category_hint', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    op.drop_table('merchant_entities')
    op.drop_table('merchant_entity_aliases')
