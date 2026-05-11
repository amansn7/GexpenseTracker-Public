"""add pre_filter_status to emails; add filter_rules table

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

_DOMAIN_SEEDS = [
    "hdfcbank.com", "axisbank.com", "sbi.co.in", "icicibank.com", "kotak.com",
    "yesbank.in", "indusind.com", "idfcfirstbank.com", "rbl.co.in", "federalbank.co.in",
    "paytm.com", "phonepe.com", "gpay.com", "googlepay.com", "amazonpay.in",
    "npci.org.in", "razorpay.com", "cashfree.com", "billdesk.com", "mobikwik.com",
    "freecharge.in", "pnbindia.in", "canarabank.in", "unionbankofindia.co.in",
    "bankofbaroda.in", "upi.npci.org.in",
]

_KEYWORD_SEEDS = [
    "debit", "credit", "transaction", "payment", "salary", "cashback",
    "refund", "EMI", "transfer", "charged", "purchased", "spent",
    "received", "deposited", "withdrawn",
]


def upgrade() -> None:
    op.add_column(
        "emails",
        sa.Column("pre_filter_status", sa.String(20), server_default="passed", nullable=False),
    )

    op.create_table(
        "filter_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("rule_type", sa.String(30), nullable=False, index=True),
        sa.Column("value", sa.String(255), nullable=False, index=True),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("hit_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    rows = []
    for domain in _DOMAIN_SEEDS:
        rows.append({
            "id": str(uuid.uuid4()),
            "rule_type": "allowlist_domain",
            "value": domain,
            "source": "system",
            "hit_count": 0,
            "created_at": now,
        })
    for keyword in _KEYWORD_SEEDS:
        rows.append({
            "id": str(uuid.uuid4()),
            "rule_type": "keyword_pattern",
            "value": keyword,
            "source": "system",
            "hit_count": 0,
            "created_at": now,
        })

    if rows:
        op.bulk_insert(
            sa.table(
                "filter_rules",
                sa.column("id", sa.String),
                sa.column("rule_type", sa.String),
                sa.column("value", sa.String),
                sa.column("source", sa.String),
                sa.column("hit_count", sa.Integer),
                sa.column("created_at", sa.DateTime),
            ),
            rows,
        )


def downgrade() -> None:
    op.drop_table("filter_rules")
    op.drop_column("emails", "pre_filter_status")
