"""Partition transactions, emails, and classification_log by month

Revision ID: 0059
Revises: 0058
Create Date: 2026-06-05 00:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '0059'
down_revision: str | None = '0058'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _is_pg() -> bool:
    return op.get_bind().engine.dialect.name == "postgresql"


def _is_sqlite() -> bool:
    return op.get_bind().engine.dialect.name == "sqlite"


def _month_range(year: int, month: int):
    from datetime import date
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


def _create_monthly_partitions(table: str):
    """Create monthly partitions from 36 months ago to 3 months ahead."""
    from datetime import date
    today = date.today()
    # Start: 36 months ago
    start = today.replace(day=1)
    for _ in range(36):
        if start.month == 1:
            start = start.replace(year=start.year - 1, month=12)
        else:
            start = start.replace(month=start.month - 1)
    # End: 3 months ahead
    end = today.replace(day=1)
    for _ in range(3):
        if end.month == 12:
            end = end.replace(year=end.year + 1, month=1)
        else:
            end = end.replace(month=end.month + 1)
    # Iterate month by month from start to end
    cur = start
    while cur <= end:
        y, m = cur.year, cur.month
        pname = f"{table}_{y}_{m:02d}"
        s, e = _month_range(y, m)
        op.execute(
            sa.text(
                f"CREATE TABLE {pname} PARTITION OF {table} "
                f"FOR VALUES FROM (:start) TO (:end)"
            ).bindparams(start=s.isoformat(), end=e.isoformat())
        )
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1)
        else:
            cur = cur.replace(month=cur.month + 1)


def _upgrade_postgres():
    conn = op.get_bind()

    # ── 1. Fix null partition columns ───────────────────────────
    conn.execute(
        sa.text("UPDATE transactions SET txn_date = created_at::date "
                "WHERE txn_date IS NULL AND created_at IS NOT NULL")
    )
    conn.execute(
        sa.text("UPDATE transactions SET txn_date = '1970-01-01' WHERE txn_date IS NULL")
    )
    conn.execute(
        sa.text("UPDATE emails SET received_at = synced_at "
                "WHERE received_at IS NULL AND synced_at IS NOT NULL")
    )
    conn.execute(
        sa.text("UPDATE emails SET received_at = '1970-01-01' WHERE received_at IS NULL")
    )

    # ── 2. Drop inbound FK constraints ──────────────────────────
    conn.execute(sa.text("ALTER TABLE duplicate_pairs DROP CONSTRAINT IF EXISTS duplicate_pairs_primary_tx_id_fkey"))
    conn.execute(sa.text("ALTER TABLE duplicate_pairs DROP CONSTRAINT IF EXISTS duplicate_pairs_duplicate_tx_id_fkey"))
    conn.execute(sa.text("ALTER TABLE transaction_corrections DROP CONSTRAINT IF EXISTS transaction_corrections_transaction_id_fkey"))
    conn.execute(sa.text("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_email_id_fkey"))
    conn.execute(sa.text("ALTER TABLE classification_log DROP CONSTRAINT IF EXISTS classification_log_email_id_fkey"))

    # ── 3. classification_log ───────────────────────────────────
    op.execute(
        "CREATE TABLE classification_log_partitioned ("
        "  id VARCHAR(36) NOT NULL,"
        "  email_id VARCHAR(36),"
        "  sender_domain VARCHAR(255),"
        "  subject TEXT,"
        "  body_snippet TEXT,"
        "  provider VARCHAR(50),"
        "  model VARCHAR(100),"
        "  latency_ms INTEGER,"
        "  llm_label VARCHAR(20),"
        "  llm_amount NUMERIC(12, 2),"
        "  pre_extraction_amount NUMERIC(12, 2),"
        "  llm_merchant VARCHAR(255),"
        "  llm_category VARCHAR(100),"
        "  llm_confidence FLOAT,"
        "  llm_txn_date DATE,"
        "  raw_response TEXT,"
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  UNIQUE (id, created_at)"
        ") PARTITION BY RANGE (created_at)"
    )
    _create_monthly_partitions("classification_log_partitioned")
    conn.execute(sa.text(
        "INSERT INTO classification_log_partitioned "
        "SELECT * FROM classification_log"
    ))
    op.create_index("ix_classification_log_email_id", "classification_log_partitioned", ["email_id"])
    op.create_index("ix_classification_log_created_at", "classification_log_partitioned", ["created_at"])
    conn.execute(sa.text("CREATE UNIQUE INDEX uq_classification_log_id ON classification_log_partitioned (id)"))
    conn.execute(sa.text("DROP TABLE classification_log CASCADE"))
    conn.execute(sa.text("ALTER TABLE classification_log_partitioned RENAME TO classification_log"))

    # ── 4. emails ───────────────────────────────────────────────
    op.execute(
        "CREATE TABLE emails_partitioned ("
        "  id VARCHAR(36) NOT NULL,"
        "  user_id VARCHAR(36) NOT NULL,"
        "  gmail_id VARCHAR(255) NOT NULL,"
        "  subject TEXT,"
        "  sender VARCHAR(500),"
        "  sender_domain VARCHAR(255),"
        "  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  body_snippet TEXT,"
        "  body_text TEXT,"
        "  body_dates JSON,"
        "  reference_ids JSON,"
        "  gmail_link VARCHAR(500),"
        "  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  pre_filter_status VARCHAR(20) NOT NULL DEFAULT 'passed',"
        "  UNIQUE (id, received_at)"
        ") PARTITION BY RANGE (received_at)"
    )
    _create_monthly_partitions("emails_partitioned")
    conn.execute(sa.text("INSERT INTO emails_partitioned SELECT * FROM emails"))
    conn.execute(sa.text("CREATE UNIQUE INDEX uq_emails_gmail_id ON emails_partitioned (gmail_id)"))
    conn.execute(sa.text("CREATE UNIQUE INDEX uq_emails_id ON emails_partitioned (id)"))
    op.create_index("ix_emails_user_id_pre_filter_status", "emails_partitioned", ["user_id", "pre_filter_status"])
    op.create_index("ix_emails_user_id", "emails_partitioned", ["user_id"])
    op.create_index("ix_emails_sender_domain", "emails_partitioned", ["sender_domain"])
    conn.execute(sa.text("DROP TABLE emails CASCADE"))
    conn.execute(sa.text("ALTER TABLE emails_partitioned RENAME TO emails"))

    # ── 5. transactions ─────────────────────────────────────────
    op.execute(
        "CREATE TABLE transactions_partitioned ("
        "  id VARCHAR(36) NOT NULL,"
        "  email_id VARCHAR(36),"
        "  label VARCHAR(20) NOT NULL,"
        "  transaction_type VARCHAR(20),"
        "  payment_mode VARCHAR(20),"
        "  amount NUMERIC(12, 2),"
        "  currency VARCHAR(3) DEFAULT 'INR',"
        "  merchant VARCHAR(255),"
        "  category VARCHAR(100),"
        "  txn_date DATE NOT NULL DEFAULT '1970-01-01',"
        "  confidence FLOAT,"
        "  status VARCHAR(20) NOT NULL,"
        "  classifier_method VARCHAR(10),"
        "  user_notes TEXT,"
        "  read BOOLEAN NOT NULL DEFAULT FALSE,"
        "  flagged BOOLEAN NOT NULL DEFAULT FALSE,"
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  UNIQUE (id, txn_date)"
        ") PARTITION BY RANGE (txn_date)"
    )
    _create_monthly_partitions("transactions_partitioned")
    conn.execute(sa.text("INSERT INTO transactions_partitioned SELECT * FROM transactions"))
    conn.execute(sa.text("CREATE UNIQUE INDEX uq_transactions_id ON transactions_partitioned (id)"))
    conn.execute(sa.text("CREATE UNIQUE INDEX uq_transactions_email_id ON transactions_partitioned (email_id)"))
    op.create_index("ix_transactions_label", "transactions_partitioned", ["label"])
    op.create_index("ix_transactions_status", "transactions_partitioned", ["status"])
    op.create_index("ix_transactions_txn_date", "transactions_partitioned", ["txn_date"])
    op.create_index("ix_transactions_email_id_txn_date", "transactions_partitioned", ["email_id", "txn_date"])
    op.create_index("ix_transactions_email_id_created_at", "transactions_partitioned", ["email_id", "created_at"])
    op.create_index("ix_transactions_email_id", "transactions_partitioned", ["email_id"])
    conn.execute(sa.text("DROP TABLE transactions CASCADE"))
    conn.execute(sa.text("ALTER TABLE transactions_partitioned RENAME TO transactions"))

    # ── 6. FK-like indexes (app-level integrity) ────────────────
    op.create_index("ix_duplicate_pairs_primary_tx_id", "duplicate_pairs", ["primary_tx_id"])
    op.create_index("ix_duplicate_pairs_duplicate_tx_id", "duplicate_pairs", ["duplicate_tx_id"])
    op.create_index("ix_transaction_corrections_transaction_id", "transaction_corrections", ["transaction_id"])


def _downgrade_postgres():
    conn = op.get_bind()

    # ── 1. Drop FK-like indexes ─────────────────────────────────
    op.drop_index("ix_duplicate_pairs_primary_tx_id", table_name="duplicate_pairs")
    op.drop_index("ix_duplicate_pairs_duplicate_tx_id", table_name="duplicate_pairs")
    op.drop_index("ix_transaction_corrections_transaction_id", table_name="transaction_corrections")

    # ── 2. Revert emails FIRST (transactions FK depends on it) ──
    conn.execute(sa.text("DROP TABLE emails CASCADE"))
    op.execute(
        "CREATE TABLE emails ("
        "  id VARCHAR(36) NOT NULL,"
        "  user_id VARCHAR(36) NOT NULL,"
        "  gmail_id VARCHAR(255) NOT NULL,"
        "  subject TEXT,"
        "  sender VARCHAR(500),"
        "  sender_domain VARCHAR(255),"
        "  received_at TIMESTAMPTZ,"
        "  body_snippet TEXT,"
        "  body_text TEXT,"
        "  body_dates JSON,"
        "  reference_ids JSON,"
        "  gmail_link VARCHAR(500),"
        "  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  pre_filter_status VARCHAR(20) NOT NULL DEFAULT 'passed',"
        "  PRIMARY KEY (id)"
        ")"
    )
    conn.execute(sa.text("ALTER TABLE emails ADD CONSTRAINT uq_emails_gmail_id UNIQUE (gmail_id)"))
    op.create_index("ix_emails_user_id_pre_filter_status", "emails", ["user_id", "pre_filter_status"])
    op.create_index("ix_emails_user_id", "emails", ["user_id"])
    op.create_index("ix_emails_sender_domain", "emails", ["sender_domain"])

    # ── 3. Revert transactions ──────────────────────────────────
    conn.execute(sa.text("DROP TABLE transactions CASCADE"))
    op.execute(
        "CREATE TABLE transactions ("
        "  id VARCHAR(36) NOT NULL,"
        "  email_id VARCHAR(36),"
        "  label VARCHAR(20) NOT NULL,"
        "  transaction_type VARCHAR(20),"
        "  payment_mode VARCHAR(20),"
        "  amount NUMERIC(12, 2),"
        "  currency VARCHAR(3) DEFAULT 'INR',"
        "  merchant VARCHAR(255),"
        "  category VARCHAR(100),"
        "  txn_date DATE,"
        "  confidence FLOAT,"
        "  status VARCHAR(20) NOT NULL,"
        "  classifier_method VARCHAR(10),"
        "  user_notes TEXT,"
        "  read BOOLEAN NOT NULL DEFAULT FALSE,"
        "  flagged BOOLEAN NOT NULL DEFAULT FALSE,"
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  PRIMARY KEY (id)"
        ")"
    )
    conn.execute(sa.text("ALTER TABLE transactions ADD CONSTRAINT uq_transactions_email_id UNIQUE (email_id)"))
    op.create_index("ix_transactions_email_id_txn_date", "transactions", ["email_id", "txn_date"])
    op.create_index("ix_transactions_email_id_created_at", "transactions", ["email_id", "created_at"])
    op.create_index("ix_transactions_label", "transactions", ["label"])
    op.create_index("ix_transactions_status", "transactions", ["status"])
    op.create_index("ix_transactions_txn_date", "transactions", ["txn_date"])
    op.create_index("ix_transactions_email_id", "transactions", ["email_id"])
    # Restore FKs now that emails is a regular table with proper PK
    conn.execute(sa.text(
        "ALTER TABLE transactions ADD CONSTRAINT transactions_email_id_fkey "
        "FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE"
    ))
    conn.execute(sa.text(
        "ALTER TABLE duplicate_pairs ADD CONSTRAINT duplicate_pairs_primary_tx_id_fkey "
        "FOREIGN KEY (primary_tx_id) REFERENCES transactions(id)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE duplicate_pairs ADD CONSTRAINT duplicate_pairs_duplicate_tx_id_fkey "
        "FOREIGN KEY (duplicate_tx_id) REFERENCES transactions(id)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE transaction_corrections ADD CONSTRAINT transaction_corrections_transaction_id_fkey "
        "FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE"
    ))

    # ── 4. Revert classification_log ────────────────────────────
    conn.execute(sa.text("DROP TABLE classification_log CASCADE"))
    op.execute(
        "CREATE TABLE classification_log ("
        "  id VARCHAR(36) NOT NULL,"
        "  email_id VARCHAR(36),"
        "  sender_domain VARCHAR(255),"
        "  subject TEXT,"
        "  body_snippet TEXT,"
        "  provider VARCHAR(50),"
        "  model VARCHAR(100),"
        "  latency_ms INTEGER,"
        "  llm_label VARCHAR(20),"
        "  llm_amount NUMERIC(12, 2),"
        "  pre_extraction_amount NUMERIC(12, 2),"
        "  llm_merchant VARCHAR(255),"
        "  llm_category VARCHAR(100),"
        "  llm_confidence FLOAT,"
        "  llm_txn_date DATE,"
        "  raw_response TEXT,"
        "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
        "  PRIMARY KEY (id)"
        ")"
    )
    op.create_index("ix_classification_log_email_id", "classification_log", ["email_id"])
    op.create_index("ix_classification_log_created_at", "classification_log", ["created_at"])
    # Restore FK from classification_log to emails
    conn.execute(sa.text(
        "ALTER TABLE classification_log ADD CONSTRAINT classification_log_email_id_fkey "
        "FOREIGN KEY (email_id) REFERENCES emails(id)"
    ))


# ── Public upgrade/downgrade entry points ────────────────────────


def upgrade() -> None:
    if _is_sqlite():
        op.create_index("ix_transactions_txn_date", "transactions", ["txn_date"], if_not_exists=True)
        op.create_index("ix_emails_received_at", "emails", ["received_at"], if_not_exists=True)
        op.create_index("ix_classification_log_created_at", "classification_log", ["created_at"], if_not_exists=True)
        op.create_index("ix_emails_user_id_received_at", "emails",
                        ["user_id", "received_at"], if_not_exists=True)
        op.create_index("ix_transactions_email_id_created_at", "transactions",
                        ["email_id", "created_at"], if_not_exists=True)
    else:
        _upgrade_postgres()


def downgrade() -> None:
    if _is_sqlite():
        op.drop_index("ix_transactions_txn_date", table_name="transactions")
        op.drop_index("ix_emails_received_at", table_name="emails")
        op.drop_index("ix_classification_log_created_at", table_name="classification_log")
        op.drop_index("ix_emails_user_id_received_at", table_name="emails")
        op.drop_index("ix_transactions_email_id_created_at", table_name="transactions")
    else:
        _downgrade_postgres()
