"""add unique constraints for Transaction.email_id and FilterRule, plus composite index

Adds:
  - UniqueConstraint on Transaction.email_id (1:1 Email→Transaction)
  - UniqueConstraint on FilterRule(rule_type, value, source, user_id)
  - Composite index (user_id, pre_filter_status) on Email for pending tab perf

Revision ID: 0040
Revises: 0039_merchant_aliases_user_id, 0039_encrypt_totp_secrets
Create Date: 2026-05-24 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0040"
down_revision: Union[str, Sequence[str], None] = (
    "0039_merchant_aliases_user_id",
    "0039_encrypt_totp_secrets",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Unique constraint on Transaction.email_id — run dedup_before_migration.py first
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.create_unique_constraint("uq_transactions_email_id", ["email_id"])

    # Composite unique constraint on FilterRule
    with op.batch_alter_table("filter_rules") as batch_op:
        batch_op.create_unique_constraint(
            "uq_filter_rules_type_value_source_user",
            ["rule_type", "value", "source", "user_id"],
        )

    # Composite index for pending tab queries
    op.create_index(
        "ix_emails_user_id_pre_filter_status",
        "emails",
        ["user_id", "pre_filter_status"],
        if_not_exists=True,

    )


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint("uq_transactions_email_id", type_="unique")
    with op.batch_alter_table("filter_rules") as batch_op:
        batch_op.drop_constraint("uq_filter_rules_type_value_source_user", type_="unique")
    op.drop_index("ix_emails_user_id_pre_filter_status", table_name="emails")
