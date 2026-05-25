from datetime import UTC

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.main import app
from app.models import (
    DomainPairRule,
    MerchantAlias,
    PatternRule,
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
    from datetime import date, datetime, timedelta

    from sqlalchemy import func, select

    from app.models import (
        AuditLog,
        Budget,
        ClassificationLog,
        ClassifierMethod,
        ConnectedAccount,
        Debt,
        DeviceToken,
        DuplicatePair,
        Email,
        FilterRule,
        Goal,
        GoalContribution,
        Label,
        LLMSpendTracker,
        MerchantAlias,
        MerchantEntityAlias,
        RecurringExpense,
        RefreshTokenBlacklist,
        SenderRule,
        Session,
        SyncProgress,
        SyncState,
        Transaction,
        TransactionCorrection,
        TransactionStatus,
        User,
        UserAIService,
        UserCategory,
        UserMerchantOverride,
        UserProfile,
        UserRole,
        UserSettings,
        UserStatus,
    )

    uid_1 = mock_user.id

    # --- user 2 for isolation ---
    user2 = User(
        email="isolated@delete-test.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(user2)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user2.id))
    db_session.add(UserProfile(user_id=user2.id, full_name="Isolated User"))

    # --- user 1 data across all affected tables ---
    email_a = Email(gmail_id="g-del-1", subject="Test", sender="s@test.com", sender_domain="test.com", user_id=uid_1)
    email_b = Email(gmail_id="g-del-2", subject="Test2", sender="s2@test.com", sender_domain="test.com", user_id=uid_1)
    db_session.add_all([email_a, email_b])
    await db_session.flush()

    # two transactions (each with unique email_id) needed for duplicate_pair
    txn_a = Transaction(
        email_id=email_a.id,
        label=Label.expense.value,
        amount=500.0,
        merchant="Test",
        category="Food",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    txn_b = Transaction(
        email_id=email_b.id,
        label=Label.expense.value,
        amount=300.0,
        merchant="Test2",
        category="Travel",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    db_session.add_all([txn_a, txn_b])
    await db_session.flush()

    cl = ClassificationLog(email_id=email_a.id, sender_domain="test.com", provider="openai")
    db_session.add(cl)

    dp = DuplicatePair(primary_tx_id=txn_a.id, duplicate_tx_id=txn_b.id, rule_source="amount_date")
    db_session.add(dp)

    budget = Budget(user_id=uid_1, category="Food", monthly_limit=1000)
    debt = Debt(user_id=uid_1, name="Test Debt", total_amount=5000)
    re = RecurringExpense(user_id=uid_1, name="Netflix", amount=500, frequency="monthly")
    sr = SenderRule(user_id=uid_1, sender_domain="newsletter.com", label="ignore")
    fr = FilterRule(user_id=uid_1, rule_type="blocklist_domain", value="spam.com", source="user")
    sess = Session(user_id=uid_1, token=b"a" * 32, expires_at=datetime.now(UTC) + timedelta(hours=1))
    umo = UserMerchantOverride(user_id=uid_1, merchant="TestMerchant", category="Food")
    uas = UserAIService(
        user_id=uid_1, provider="openai", display_name="Test", model_id="gpt-4", encrypted_api_key="enc"
    )
    uc = UserCategory(user_id=uid_1, name="TestCat", kind="expense")
    ca = ConnectedAccount(user_id=uid_1, provider="gmail", account_email="u1@gmail.com")
    ss = SyncState(user_id=uid_1, last_history_id="123")
    tc = TransactionCorrection(transaction_id=txn_a.id, user_id=uid_1)
    sp = SyncProgress(user_id=uid_1, running=False)
    lst = LLMSpendTracker(user_id=uid_1, date=date.today(), provider="openai", model="gpt-4")
    al = AuditLog(user_id=uid_1, action="test")
    dt = DeviceToken(user_id=uid_1, token="device-tok-1", platform="ios")
    rtb = RefreshTokenBlacklist(user_id=uid_1, jti="jti-test-1")
    goal = Goal(user_id=uid_1, name="Test Goal", target_amount=10000)
    ma_fin = MerchantAlias(user_id=uid_1, raw="RAW MERCH", canonical="canonical")
    ma_ent = MerchantEntityAlias(user_id=uid_1, canonical_name="Canon", alias_name="Alias")

    db_session.add_all(
        [
            budget,
            debt,
            re,
            sr,
            fr,
            sess,
            umo,
            uas,
            uc,
            ca,
            ss,
            tc,
            sp,
            lst,
            al,
            dt,
            rtb,
            goal,
            ma_fin,
            ma_ent,
        ]
    )
    await db_session.flush()

    gc = GoalContribution(goal_id=goal.id, user_id=uid_1, amount=1000)
    db_session.add(gc)

    # --- user 2 fixture data ---
    email_u2 = Email(
        gmail_id="g-iso-1", sender="s@iso.com", sender_domain="iso.com", subject="Isolated", user_id=user2.id
    )
    db_session.add(email_u2)
    await db_session.flush()

    txn_u2 = Transaction(
        email_id=email_u2.id,
        label=Label.expense.value,
        amount=999,
        merchant="Isolated",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    budget_u2 = Budget(user_id=user2.id, category="Transport", monthly_limit=500)
    ca_u2 = ConnectedAccount(user_id=user2.id, provider="gmail", account_email="u2@gmail.com")
    db_session.add_all([txn_u2, budget_u2, ca_u2])
    await db_session.commit()

    # verify pre-deletion counts
    assert (
        await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == uid_1))
    ).scalar() == 2

    # --- call deletion ---
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/account")

    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}

    # --- user 1 data gone from all tables ---
    assert (await db_session.execute(select(Email).where(Email.user_id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(Transaction).where(Transaction.id == txn_a.id))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(User).where(User.id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(ClassificationLog).where(ClassificationLog.id == cl.id))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(DuplicatePair).where(DuplicatePair.id == dp.id))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(Budget).where(Budget.user_id == uid_1))).scalar_one_or_none() is None
    assert (await db_session.execute(select(Debt).where(Debt.user_id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(RecurringExpense).where(RecurringExpense.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(SenderRule).where(SenderRule.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(FilterRule).where(FilterRule.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(ConnectedAccount).where(ConnectedAccount.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(Session).where(Session.user_id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(UserMerchantOverride).where(UserMerchantOverride.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(UserAIService).where(UserAIService.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(UserCategory).where(UserCategory.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(UserProfile).where(UserProfile.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(UserSettings).where(UserSettings.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(SyncState).where(SyncState.user_id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(TransactionCorrection).where(TransactionCorrection.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(SyncProgress).where(SyncProgress.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(LLMSpendTracker).where(LLMSpendTracker.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(AuditLog).where(AuditLog.user_id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(DeviceToken).where(DeviceToken.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(RefreshTokenBlacklist).where(RefreshTokenBlacklist.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (await db_session.execute(select(Goal).where(Goal.user_id == uid_1))).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(GoalContribution).where(GoalContribution.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(MerchantAlias).where(MerchantAlias.user_id == uid_1))
    ).scalar_one_or_none() is None
    assert (
        await db_session.execute(select(MerchantEntityAlias).where(MerchantEntityAlias.user_id == uid_1))
    ).scalar_one_or_none() is None

    # --- user 2 data untouched ---
    assert (await db_session.execute(select(User).where(User.id == user2.id))).scalar_one_or_none() is not None
    assert (await db_session.execute(select(Email).where(Email.gmail_id == "g-iso-1"))).scalar_one_or_none() is not None
    assert (
        await db_session.execute(select(Transaction).where(Transaction.id == txn_u2.id))
    ).scalar_one_or_none() is not None
    assert (await db_session.execute(select(Budget).where(Budget.user_id == user2.id))).scalar_one_or_none() is not None
    assert (
        await db_session.execute(select(ConnectedAccount).where(ConnectedAccount.user_id == user2.id))
    ).scalar_one_or_none() is not None


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
