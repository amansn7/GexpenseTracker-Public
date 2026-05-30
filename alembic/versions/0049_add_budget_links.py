"""Add budget_links table

Revision ID: 0049
Revises: 0048
Create Date: 2026-05-30

"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0049"
down_revision: Union[str, None] = "0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "budget_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("source_category", sa.String(100), nullable=False),
        sa.Column("target_category", sa.String(100), nullable=False),
        sa.Column("split_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "source_category", "target_category",
            name="uq_budget_link_user_src_tgt"
        ),
    )
    op.create_index("ix_budget_links_user_id", "budget_links", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_budget_links_user_id", table_name="budget_links")
    op.drop_table("budget_links")
