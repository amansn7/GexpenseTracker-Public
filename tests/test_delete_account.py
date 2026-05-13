import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.models import (
    Email, Transaction, ClassificationLog, Label, TransactionStatus, ClassifierMethod,
    ConnectedAccount, UserCategory, Budget, User,
    MerchantAlias, PatternRule, DomainPairRule, FilterRule,
)


@pytest.mark.asyncio
async def test_delete_account_removes_emails_and_transactions(db_session, mock_user):
    """After account deletion, Email + Transaction rows are gone."""
    email = Email(
        gmail_id="g-del-1", subject="Test", sender="s@test.com",
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

    email_check = (await db_session.execute(
        select(Email).where(Email.gmail_id == "g-del-1")
    )).scalar_one_or_none()
    assert email_check is None, "Email should be deleted"

    txn_check = (await db_session.execute(
        select(Transaction).where(Transaction.merchant == "Test")
    )).scalar_one_or_none()
    assert txn_check is None, "Transaction should be deleted"

    user_check = (await db_session.execute(
        select(User).where(User.id == mock_user.id)
    )).scalar_one_or_none()
    assert user_check is None, "User row should be deleted"


@pytest.mark.asyncio
async def test_delete_account_removes_classification_log(db_session, mock_user):
    """ClassificationLog rows are deleted."""
    email = Email(
        gmail_id="g-log", subject="Log test",
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
    assert log_check is None, "ClassificationLog should be deleted"


@pytest.mark.asyncio
async def test_delete_account_removes_personal_data(db_session, mock_user):
    """ConnectedAccount + UserCategory are deleted."""
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
    assert conn_check is None

    cat_check = (await db_session.execute(
        select(UserCategory).where(UserCategory.user_id == mock_user.id)
    )).scalar_one_or_none()
    assert cat_check is None


@pytest.mark.asyncio
async def test_delete_account_preserves_system_tables(db_session, mock_user):
    """System-wide tables (merchant_aliases, pattern_rules, etc.) survive deletion."""
    ma = MerchantAlias(raw="TEST RAW", canonical="test_canonical")
    pr = PatternRule(regex_pattern="test.*", label="expense")
    dr = DomainPairRule(domain_a="a.com", domain_b="b.com")
    db_session.add_all([ma, pr, dr])
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")

    assert resp.status_code == 200

    ma_check = (await db_session.execute(
        select(MerchantAlias).where(MerchantAlias.raw == "TEST RAW")
    )).scalar_one_or_none()
    assert ma_check is not None, "MerchantAlias should persist"

    pr_check = (await db_session.execute(
        select(PatternRule).where(PatternRule.regex_pattern == "test.*")
    )).scalar_one_or_none()
    assert pr_check is not None, "PatternRule should persist"

    dr_check = (await db_session.execute(
        select(DomainPairRule).where(DomainPairRule.domain_a == "a.com")
    )).scalar_one_or_none()
    assert dr_check is not None, "DomainPairRule should persist"


@pytest.mark.asyncio
async def test_delete_account_requires_auth(db_session):
    """Unauthenticated requests are rejected."""
    from app.database import get_db

    async def _db_override():
        yield db_session

    app.dependency_overrides[get_db] = _db_override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")
    assert resp.status_code in (401, 403)
    app.dependency_overrides.pop(get_db, None)
