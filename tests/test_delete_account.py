import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.models import (
    Email, Transaction, ClassificationLog, Label, TransactionStatus, ClassifierMethod,
    ConnectedAccount, UserCategory, Budget, User,
)


@pytest.mark.asyncio
async def test_delete_account_preserves_transactions_and_emails(db_session, mock_user):
    """After account deletion, Email + Transaction rows still exist."""
    email = Email(
        gmail_id="g-del-test-1", subject="Test", sender="s@test.com",
        sender_domain="test.com", user_id=mock_user.id,
    )
    db_session.add(email)
    await db_session.flush()

    txn = Transaction(
        email_id=email.id, label=Label.expense.value, amount=500.0,
        merchant="Test", category="Food",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    db_session.add(txn)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")

    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}

    await db_session.refresh(mock_user)
    assert mock_user.status == "disabled"
    assert mock_user.email.startswith("deleted-")
    assert mock_user.onboarding_complete is False
    assert mock_user.totp_secret is None

    email_check = (await db_session.execute(
        select(Email).where(Email.gmail_id == "g-del-test-1")
    )).scalar_one_or_none()
    assert email_check is not None, "Email should still exist after account deletion"

    txn_check = (await db_session.execute(
        select(Transaction).where(Transaction.merchant == "Test")
    )).scalar_one_or_none()
    assert txn_check is not None, "Transaction should still exist after account deletion"


@pytest.mark.asyncio
async def test_delete_account_removes_personal_data(db_session, mock_user):
    """After account deletion, ConnectedAccount + UserCategory are gone."""
    conn = ConnectedAccount(
        user_id=mock_user.id, provider="gmail",
        account_email="test@gmail.com",
    )
    cat = UserCategory(user_id=mock_user.id, name="Custom Cat")
    db_session.add_all([conn, cat])
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")

    assert resp.status_code == 200

    conn_check = (await db_session.execute(
        select(ConnectedAccount).where(ConnectedAccount.user_id == mock_user.id)
    )).scalar_one_or_none()
    assert conn_check is None, "ConnectedAccount should be deleted"

    cat_check = (await db_session.execute(
        select(UserCategory).where(UserCategory.user_id == mock_user.id)
    )).scalar_one_or_none()
    assert cat_check is None, "UserCategory should be deleted"


@pytest.mark.asyncio
async def test_delete_account_preserves_classification_log(db_session, mock_user):
    """ClassificationLog rows survive account deletion."""
    email = Email(
        gmail_id="g-log-test", subject="Log test",
        sender="s@test.com", sender_domain="test.com",
        user_id=mock_user.id,
    )
    db_session.add(email)
    await db_session.flush()

    log = ClassificationLog(
        email_id=email.id, sender_domain="test.com",
        provider="google", model="gemini",
    )
    db_session.add(log)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")

    assert resp.status_code == 200

    log_check = (await db_session.execute(
        select(ClassificationLog).where(ClassificationLog.sender_domain == "test.com")
    )).scalar_one_or_none()
    assert log_check is not None, "ClassificationLog should still exist"


@pytest.mark.asyncio
async def test_delete_account_disabled_user_cannot_log_in(db_session, mock_user):
    """Deleted user has no active session and is disabled."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")
    assert resp.status_code == 200

    user_check = (await db_session.execute(
        select(User).where(User.id == mock_user.id)
    )).scalar_one_or_none()
    assert user_check is not None, "User row should still exist (soft-delete)"
    assert user_check.status == "disabled"
    assert user_check.email.startswith("deleted-")


@pytest.mark.asyncio
async def test_delete_account_requires_auth(db_session):
    """Unauthenticated requests are rejected."""
    from app.main import app
    from app.database import get_db

    async def _db_override():
        yield db_session

    app.dependency_overrides[get_db] = _db_override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")
    assert resp.status_code in (401, 403)
    app.dependency_overrides.pop(get_db, None)
