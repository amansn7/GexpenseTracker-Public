"""Add llm budget fields to user_settings

Revision ID: 0063
Revises: 0062
Create Date: 2026-06-05 12:00:00.000000

Adds daily_llm_budget_cents and llm_budget_tier columns to user_settings
for per-user LLM budget enforcement with tiered pricing.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0063"
down_revision: Union[str, None] = "0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("user_settings") as batch_op:
            batch_op.add_column(sa.Column("daily_llm_budget_cents", sa.Integer(), nullable=True))
            batch_op.add_column(sa.Column("llm_budget_tier", sa.String(20), nullable=False, server_default="free"))
    else:
        op.add_column("user_settings", sa.Column("daily_llm_budget_cents", sa.Integer(), nullable=True))
        op.add_column(
            "user_settings",
            sa.Column("llm_budget_tier", sa.String(20), nullable=False, server_default="free"),
        )


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("user_settings") as batch_op:
            batch_op.drop_column("llm_budget_tier")
            batch_op.drop_column("daily_llm_budget_cents")
    else:
        op.drop_column("user_settings", "llm_budget_tier")
        op.drop_column("user_settings", "daily_llm_budget_cents")
