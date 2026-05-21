import csv
import io
from datetime import UTC, date, datetime

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_export_empty_returns_csv_header(mock_user):
    from app.api.transactions import EXPORT_COLUMNS
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert resp.headers["content-disposition"] == 'attachment; filename="transactions.csv"'
    assert resp.text.strip() == ",".join(EXPORT_COLUMNS)


@pytest.mark.asyncio
async def test_export_returns_only_current_users_transactions(mock_user, db_session):
    from app.main import app
    from app.models import Email, Transaction, User, UserRole, UserStatus

    email = Email(
        gmail_id="gmail-1",
        user_id=mock_user.id,
        subject="Debit alert",
        sender="bank@example.com",
        sender_domain="example.com",
        received_at=datetime(2026, 5, 1, 10, 30, tzinfo=UTC),
        gmail_link="https://mail.google.com/mail/u/0/#inbox/1",
    )
    db_session.add(email)
    await db_session.flush()
    db_session.add(Transaction(
        email_id=email.id,
        label="expense",
        amount=123.45,
        currency="INR",
        merchant="Cafe",
        category="Food",
        txn_date=date(2026, 5, 1),
        confidence=0.91,
        status="auto",
        classifier_method="llm",
        user_notes="Lunch",
        read=True,
        flagged=False,
        created_at=datetime(2026, 5, 1, 11, 0, tzinfo=UTC),
    ))

    other_user = User(
        email="other@example.com",
        role=UserRole.member,
        status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(other_user)
    await db_session.flush()
    other_email = Email(gmail_id="gmail-2", user_id=other_user.id, subject="Other")
    db_session.add(other_email)
    await db_session.flush()
    db_session.add(Transaction(email_id=other_email.id, label="income", amount=999))
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/transactions/export")

    assert resp.status_code == 200
    rows = list(csv.DictReader(io.StringIO(resp.text)))
    assert len(rows) == 1
    assert rows[0]["label"] == "expense"
    assert rows[0]["amount"] == "123.45"
    assert rows[0]["merchant"] == "Cafe"
    assert rows[0]["email_subject"] == "Debit alert"
