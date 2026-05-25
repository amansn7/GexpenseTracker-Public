from datetime import UTC

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.models import (
    ClassifierMethod,
    ConnectedAccount,
    DomainPairRule,
    Email,
    Label,
    MerchantAlias,
    PatternRule,
    Transaction,
    TransactionStatus,
    User,
)


@pytest.mark.asyncio
async def test_schedule_deletion_sets_timestamp_and_signs_out(db_session, mock_user):
    """PATCH /api/account/schedule-deletion sets scheduled_deletion_at and clears session."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.patch("/api/account/schedule-deletion")

    assert resp.status_code == 200
    data = resp.json()
    assert data["scheduled"] is True
    assert "deletion_at" in data
    assert "24 to 48 hours" in data["message"]

    await db_session.refresh(mock_user)
    assert mock_user.scheduled_deletion_at is not None


@pytest.mark.asyncio
async def test_cancel_deletion_clears_timestamp(db_session, mock_user):
    """POST /api/account/cancel-deletion clears scheduled_deletion_at."""
    mock_user.scheduled_deletion_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/account/cancel-deletion")

    assert resp.status_code == 200
    data = resp.json()
    assert data["cancelled"] is True

    await db_session.refresh(mock_user)
    assert mock_user.scheduled_deletion_at is None


@pytest.mark.asyncio
async def test_cancel_deletion_without_schedule_returns_404(db_session, mock_user):
    """POST /api/account/cancel-deletion returns 404 when no deletion is scheduled."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/account/cancel-deletion")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_scheduled_and_cancelled_user_can_still_log_in(db_session, mock_user):
    """A user with future scheduled_deletion_at can still log in and cancel."""
    from datetime import datetime, timedelta

    mock_user.scheduled_deletion_at = datetime.now(UTC) + timedelta(hours=24)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/account/cancel-deletion")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_delete_account_removes_all_user_data(db_session, mock_user):
    """DELETE /api/account (admin/compat) removes all user data."""
    email = Email(
        gmail_id="g-del-1",
        subject="Test",
        sender="s@test.com",
        sender_domain="test.com",
        user_id=mock_user.id,
    )
    db_session.add(email)
    await db_session.flush()

    txn = Transaction(
        email_id=email.id,
        label=Label.expense.value,
        amount=500.0,
        merchant="Test",
        category="Food",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    db_session.add(txn)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")

    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}

    assert (await db_session.execute(select(Email).where(Email.gmail_id == "g-del-1"))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(Transaction).where(Transaction.merchant == "Test"))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(User).where(User.id == mock_user.id))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(ConnectedAccount).where(ConnectedAccount.user_id == mock_user.id))
    ).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_delete_account_preserves_system_tables(db_session, mock_user):
    """System-wide tables survive deletion."""
    ma = MerchantAlias(raw="TEST RAW", canonical="test")
    pr = PatternRule(regex_pattern="test.*", label="expense")
    dr = DomainPairRule(domain_a="a.com", domain_b="b.com")
    db_session.add_all([ma, pr, dr])
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")
    assert resp.status_code == 200

    assert (
        await db_session.execute(select(MerchantAlias).where(MerchantAlias.raw == "TEST RAW"))
    ).scalar_one_or_none() is not None
    assert (
        await db_session.execute(select(PatternRule).where(PatternRule.regex_pattern == "test.*"))
    ).scalar_one_or_none() is not None
    assert (
        await db_session.execute(select(DomainPairRule).where(DomainPairRule.domain_a == "a.com"))
    ).scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_delete_requires_auth(db_session):
    """Unauthenticated requests are rejected."""
    from app.database import get_db

    async def _db_override():
        yield db_session

    app.dependency_overrides[get_db] = _db_override
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")
    assert resp.status_code in (401, 403)
    app.dependency_overrides.pop(get_db, None)
