"""add goals and goal_contributions tables

Revision ID: 0038
Revises: 0037_add_device_tokens
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0038"
down_revision = "0037_add_device_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("target_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("target_date", sa.Date, nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "goal_contributions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("goal_id", sa.String(36), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("contributed_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("goal_contributions")
    op.drop_table("goals")
