import csv
import io
from datetime import UTC, date, datetime

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_export_without_date_range_exceeds_10k_returns_422(mock_user, db_session):
    from app.api.transactions import EXPORT_MAX_ROWS
    from app.main import app
    from app.models import Email, Transaction

    for i in range(EXPORT_MAX_ROWS + 100):
        email = Email(
            gmail_id=f"gmail-cap-{i}",
            user_id=mock_user.id,
            subject=f"Transaction {i}",
            sender="bank@example.com",
            sender_domain="example.com",
            received_at=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
        )
        db_session.add(email)
        await db_session.flush()
        db_session.add(Transaction(
            email_id=email.id,
            label="expense",
            amount=100.0 + i,
            currency="INR",
            merchant=f"Merchant {i}",
            category="Shopping",
            txn_date=date(2026, 5, 1),
            confidence=0.9,
            status="auto",
            classifier_method="llm",
            created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
        ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")

    assert resp.status_code == 422
    body = resp.json()
    assert "date range" in body["detail"].lower()
    assert "10,000" in body["detail"]


@pytest.mark.asyncio
async def test_export_with_date_range_under_10k_succeeds(mock_user, db_session):
    from app.main import app
    from app.models import Email, Transaction

    for i in range(50):
        email = Email(
            gmail_id=f"gmail-dated-{i}",
            user_id=mock_user.id,
            subject=f"Txn {i}",
            sender="bank@example.com",
            sender_domain="example.com",
            received_at=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
        )
        db_session.add(email)
        await db_session.flush()
        db_session.add(Transaction(
            email_id=email.id,
            label="expense",
            amount=50.0 + i,
            currency="INR",
            merchant=f"Shop {i}",
            category="Food",
            txn_date=date(2026, 5, 1),
            confidence=0.85,
            status="auto",
            classifier_method="llm",
            created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
        ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/transactions/export",
            params={"date_from": "2026-05-01", "date_to": "2026-05-31"},
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert len(rows) == 50
    assert rows[0]["label"] == "expense"
    assert rows[0]["currency"] == "INR"


@pytest.mark.asyncio
async def test_export_with_date_range_zero_rows_returns_header_only(mock_user, db_session):
    from app.api.transactions import EXPORT_COLUMNS
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(
            "/api/transactions/export",
            params={"date_from": "2020-01-01", "date_to": "2020-01-31"},
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.headers["x-row-count"] == "0"
    assert resp.text.strip() == ",".join(EXPORT_COLUMNS)


@pytest.mark.asyncio
async def test_export_with_label_filter_returns_only_matching(mock_user, db_session):
    from app.main import app
    from app.models import Email, Transaction

    for label in ["expense", "income", "transfer"]:
        email = Email(
            gmail_id=f"gmail-label-{label}",
            user_id=mock_user.id,
            subject=f"{label} alert",
            sender="bank@example.com",
            sender_domain="example.com",
            received_at=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
        )
        db_session.add(email)
        await db_session.flush()
        db_session.add(Transaction(
            email_id=email.id,
            label=label,
            amount=100.0,
            currency="INR",
            merchant="Test",
            category="Test",
            txn_date=date(2026, 5, 1),
            confidence=0.9,
            status="auto",
            classifier_method="llm",
            created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
        ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export", params={"label": "expense"})

    assert resp.status_code == 200
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert len(rows) == 1
    assert rows[0]["label"] == "expense"


@pytest.mark.asyncio
async def test_export_csv_columns_match_export_columns(mock_user, db_session):
    from app.api.transactions import EXPORT_COLUMNS
    from app.main import app
    from app.models import Email, Transaction

    email = Email(
        gmail_id="gmail-cols-check",
        user_id=mock_user.id,
        subject="Column check",
        sender="bank@example.com",
        sender_domain="example.com",
        received_at=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
    )
    db_session.add(email)
    await db_session.flush()
    db_session.add(Transaction(
        email_id=email.id,
        label="expense",
        amount=42.0,
        currency="USD",
        merchant="TestMerchant",
        category="TestCategory",
        txn_date=date(2026, 5, 1),
        confidence=0.95,
        status="corrected",
        classifier_method="rules",
        user_notes="test note",
        read=False,
        flagged=True,
        created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
    ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")

    assert resp.status_code == 200
    reader = csv.DictReader(io.StringIO(resp.text))
    assert list(reader.fieldnames) == EXPORT_COLUMNS
    rows = list(reader)
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] is not None
    assert row["label"] == "expense"
    assert row["amount"] == "42.0"
    assert row["currency"] == "USD"
    assert row["merchant"] == "TestMerchant"
    assert row["category"] == "TestCategory"
    assert row["txn_date"] == "2026-05-01"
    assert row["confidence"] == "0.95"
    assert row["status"] == "corrected"
    assert row["classifier_method"] == "rules"
    assert row["user_notes"] == "test note"
    assert row["read"] == "False"
    assert row["flagged"] == "True"
    assert row["email_subject"] == "Column check"
    assert row["email_sender"] == "bank@example.com"
    assert "gmail_link" in row
    assert "created_at" in row


@pytest.mark.asyncio
async def test_export_includes_x_row_count_header(mock_user, db_session):
    from app.main import app
    from app.models import Email, Transaction

    for i in range(3):
        email = Email(
            gmail_id=f"gmail-rowcount-{i}",
            user_id=mock_user.id,
            subject=f"Row count {i}",
            sender="bank@example.com",
            sender_domain="example.com",
            received_at=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
        )
        db_session.add(email)
        await db_session.flush()
        db_session.add(Transaction(
            email_id=email.id,
            label="expense",
            amount=10.0,
            currency="INR",
            merchant="Test",
            category="Test",
            txn_date=date(2026, 5, 1),
            confidence=0.9,
            status="auto",
            classifier_method="llm",
            created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
        ))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")

    assert resp.status_code == 200
    assert resp.headers["x-row-count"] == "3"
