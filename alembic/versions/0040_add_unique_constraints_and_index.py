"""add unique constraints for Transaction.email_id and FilterRule, plus composite index

Adds:
  - UniqueConstraint on Transaction.email_id (1:1 Email→Transaction)
  - UniqueConstraint on FilterRule(rule_type, value, source, user_id)
  - Composite index (user_id, pre_filter_status) on Email for pending tab perf

Revision ID: 0040
Revises: 0039_add_user_id_to_merchant_aliases, 0039_encrypt_totp_secrets
Create Date: 2026-05-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0040"
down_revision: Union[str, Sequence[str], None] = (
    "0039_add_user_id_to_merchant_aliases",
    "0039_encrypt_totp_secrets",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Unique constraint on Transaction.email_id — run dedup_before_migration.py first
    op.create_unique_constraint("uq_transactions_email_id", "transactions", ["email_id"])

    # Composite unique constraint on FilterRule
    op.create_unique_constraint(
        "uq_filter_rules_type_value_source_user",
        "filter_rules",
        ["rule_type", "value", "source", "user_id"],
    )

    # Composite index for pending tab queries
    op.create_index(
        "ix_emails_user_id_pre_filter_status",
        "emails",
        ["user_id", "pre_filter_status"],
        if_not_exists=True,
        postgresql_concurrently=True,
    )


def downgrade() -> None:
    op.drop_constraint("uq_transactions_email_id", "transactions", type_="unique")
    op.drop_constraint("uq_filter_rules_type_value_source_user", "filter_rules", type_="unique")
    op.drop_index("ix_emails_user_id_pre_filter_status", table_name="emails")
