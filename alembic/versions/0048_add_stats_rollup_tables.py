"""Add period_rollups and daily_snapshots tables

Revision ID: 0048
Revises: 0047
Create Date: 2026-05-30

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0048"
down_revision: Union[str, None] = "0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "period_rollups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("period_type", sa.String(10), nullable=False),
        sa.Column("period_key", sa.String(7), nullable=False),

        sa.Column("total_income", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_expenses", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_cc_payments", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_investments", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("net_savings", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("savings_rate", sa.Numeric(5, 1), nullable=False, server_default="0"),

        sa.Column("expenses_by_category", sa.Text, nullable=True),
        sa.Column("income_by_category", sa.Text, nullable=True),
        sa.Column("top_merchants", sa.Text, nullable=True),

        sa.Column("txn_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unread_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("needs_review_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("flagged_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("subscription_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("subscription_count", sa.Integer, nullable=False, server_default="0"),

        sa.Column("txn_version", sa.Integer, nullable=False, server_default="0"),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_period_rollups_user_period", "period_rollups",
                    ["user_id", "period_type", "period_key"], unique=True)

    op.create_table(
        "daily_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("income", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("expenses", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("txn_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("running_balance", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("top_categories", sa.Text, nullable=True),
    )
    op.create_unique_constraint("uq_daily_snapshot_user_date",
                                "daily_snapshots", ["user_id", "date"])


def downgrade() -> None:
    op.drop_constraint("uq_daily_snapshot_user_date", "daily_snapshots", type_="unique")
    op.drop_table("daily_snapshots")
    op.drop_index("ix_period_rollups_user_period", table_name="period_rollups")
    op.drop_table("period_rollups")
