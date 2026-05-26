"""fix data integrity: FK cascade, NOT NULL, orphaned cleanup

Fixes:
  - D1: Add ondelete=CASCADE to transactions.email_id FK
  - D2: Make user_id NOT NULL on 6 financial tables
  - D3: Add FK constraint to llm_spend_tracker.user_id
  - D4: Create merchant_entities / merchant_entity_aliases (replaces orphaned ec1fbeada45a)

Revision ID: 0041
Revises: 0040
Create Date: 2026-05-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0041"
down_revision: Union[str, Sequence[str], None] = ("0040", "ec1fbeada45a")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # D1 (PostgreSQL only): Replace auto-named FK with CASCADE FK
    # PostgreSQL auto-names anonymous FKs as {table}_{column}_fkey
    if dialect == "postgresql":
        op.execute(
            "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_email_id_fkey"
        )
        op.create_foreign_key(
            "fk_transactions_email_id_emails",
            "transactions",
            "emails",
            ["email_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # D2 (PostgreSQL only): Make user_id NOT NULL on 6 financial tables
    if dialect == "postgresql":
        op.alter_column("budgets", "user_id", existing_type=sa.String(36), nullable=False)
        op.alter_column("debts", "user_id", existing_type=sa.String(36), nullable=False)
        op.alter_column("recurring_expenses", "user_id", existing_type=sa.String(36), nullable=False)
        op.alter_column("sender_rules", "user_id", existing_type=sa.String(36), nullable=False)
        op.alter_column("merchant_aliases", "user_id", existing_type=sa.String(36), nullable=False)
        op.alter_column("goals", "user_id", existing_type=sa.String(36), nullable=False)

    # D3 (PostgreSQL only): Add FK constraint to llm_spend_tracker.user_id
    if dialect == "postgresql":
        op.create_foreign_key(
            "fk_llm_spend_tracker_user_id",
            "llm_spend_tracker",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # D4: Create merchant_entities / merchant_entity_aliases tables
    inspector = sa.inspect(conn)
    existing = inspector.get_table_names()

    if "merchant_entities" not in existing:
        op.create_table(
            "merchant_entities",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("canonical_name", sa.String(255), unique=True, nullable=False),
            sa.Column("parent_entity", sa.String(255), nullable=True),
            sa.Column("category_hint", sa.String(100), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "merchant_entity_aliases" not in existing:
        op.create_table(
            "merchant_entity_aliases",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("canonical_name", sa.String(255), nullable=False),
            sa.Column("alias_name", sa.String(255), nullable=False),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("alias_name", "user_id", name="uq_merchant_alias_name_user"),
            sa.Index("ix_merchant_alias_canonical", "canonical_name"),
        )


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name

    # Reverse D4
    op.drop_table("merchant_entity_aliases")
    op.drop_table("merchant_entities")

    # Reverse D3 (PostgreSQL only)
    if dialect == "postgresql":
        op.drop_constraint("fk_llm_spend_tracker_user_id", "llm_spend_tracker", type_="foreignkey")

    # Reverse D2 (PostgreSQL only): restore nullable=True
    if dialect == "postgresql":
        op.alter_column("goals", "user_id", existing_type=sa.String(36), nullable=True)
        op.alter_column("merchant_aliases", "user_id", existing_type=sa.String(36), nullable=True)
        op.alter_column("sender_rules", "user_id", existing_type=sa.String(36), nullable=True)
        op.alter_column("recurring_expenses", "user_id", existing_type=sa.String(36), nullable=True)
        op.alter_column("debts", "user_id", existing_type=sa.String(36), nullable=True)
        op.alter_column("budgets", "user_id", existing_type=sa.String(36), nullable=True)

    # Reverse D1 (PostgreSQL only): drop CASCADE FK
    if dialect == "postgresql":
        op.execute(
            "ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_email_id_emails"
        )
