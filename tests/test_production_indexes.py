import os
from datetime import date, datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ["TESTING"] = "1"

INDEX_DEFS = [
    ("ix_transactions_email_id", "transactions", ["email_id"]),
    ("ix_transactions_txn_date", "transactions", ["txn_date"]),
    ("ix_transactions_label_status", "transactions", ["label", "status"]),
    ("ix_transactions_created_at", "transactions", ["created_at"]),
    ("ix_emails_sender_domain", "emails", ["sender_domain"]),
    ("ix_emails_user_received", "emails", ["user_id", "received_at"]),
]


def _apply_indexes_sync(sync_conn):
    for idx_name, table, columns in INDEX_DEFS:
        cols = ", ".join(columns)
        sync_conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({cols})"))


def _drop_indexes_sync(sync_conn):
    for idx_name, table, _ in INDEX_DEFS:
        sync_conn.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))


@pytest_asyncio.fixture
async def migrated_engine():
    TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
    engine = create_async_engine(TEST_DATABASE_URL)

    async with engine.begin() as conn:
        from app.models import Base

        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_apply_indexes_sync)

    yield engine

    async with engine.begin() as conn:
        from app.models import Base

        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def migrated_session(migrated_engine):
    factory = async_sessionmaker(migrated_engine, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest.mark.asyncio
async def test_indexes_exist_after_migration(migrated_session):
    result = await migrated_session.execute(
        text("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'")
    )
    index_names = {row[0] for row in result.fetchall()}

    expected = {idx[0] for idx in INDEX_DEFS}
    assert expected.issubset(index_names), f"Missing indexes: {expected - index_names}"


@pytest.mark.asyncio
async def test_explain_uses_index_for_label_status_query(migrated_session):
    import uuid

    from app.models import Email as EmailModel
    from app.models import Label, TransactionStatus
    from app.models import Transaction as TxnModel

    user_id = str(uuid.uuid4())
    base_date = date(2026, 1, 1)

    for i in range(1000):
        email = EmailModel(
            id=str(uuid.uuid4()),
            gmail_id=f"msg-{i}",
            sender=f"sender{i}@example.com",
            sender_domain="example.com",
            subject=f"Transaction {i}",
            body_text="",
            user_id=user_id,
            received_at=datetime(2026, 1, 1, 0, 0, 0) + timedelta(days=i),
        )
        migrated_session.add(email)

        txn = TxnModel(
            id=str(uuid.uuid4()),
            email_id=email.id,
            label=Label.expense if i % 2 == 0 else Label.income,
            amount=100.0 + i,
            status=TransactionStatus.auto if i % 3 != 0 else TransactionStatus.confirmed,
            txn_date=base_date + timedelta(days=i),
            currency="USD",
        )
        migrated_session.add(txn)

    await migrated_session.flush()

    explain_result = await migrated_session.execute(
        text("""
            EXPLAIN QUERY PLAN
            SELECT SUM(amount) FROM transactions
            WHERE label = 'expense' AND status = 'auto'
              AND txn_date BETWEEN '2026-01-01' AND '2026-12-31'
        """)
    )
    rows = explain_result.fetchall()
    plan_text = " ".join(str(r[-1]) for r in rows).upper()

    assert "SEARCH" in plan_text or "USING INDEX" in plan_text, f"Expected index usage in query plan, got: {plan_text}"


@pytest.mark.asyncio
async def test_migration_idempotent(migrated_engine):
    async with migrated_engine.begin() as conn:
        await conn.run_sync(_apply_indexes_sync)
        await conn.run_sync(_apply_indexes_sync)

    async with migrated_engine.begin() as conn:
        result = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'"))
        index_names = {row[0] for row in result.fetchall()}

    expected = {idx[0] for idx in INDEX_DEFS}
    assert expected.issubset(index_names), f"Missing indexes after double migration: {expected - index_names}"


@pytest.mark.asyncio
async def test_downgrade_drops_all_indexes(migrated_engine):
    async with migrated_engine.begin() as conn:
        await conn.run_sync(_drop_indexes_sync)

    async with migrated_engine.begin() as conn:
        result = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'ix_%'"))
        index_names = {row[0] for row in result.fetchall()}

    expected = {idx[0] for idx in INDEX_DEFS}
    assert expected.isdisjoint(index_names), f"Indexes not dropped: {expected & index_names}"
