from datetime import UTC
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth_deps import get_current_user
from app.database import get_db
from app.main import app
from app.models import User, UserAIService, UserRole, UserStatus


@pytest.mark.asyncio
async def test_admin_test_provider_uses_service_id_for_user_services(db_session):
    owner = User(email="owner@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(owner)
    await db_session.flush()

    service_a = UserAIService(
        user_id=owner.id,
        provider="openai",
        display_name="OpenAI A",
        model_id="gpt-4o-mini",
        encrypted_api_key="enc-a",
        enabled=True,
    )
    service_b = UserAIService(
        user_id=owner.id,
        provider="openai",
        display_name="OpenAI B",
        model_id="gpt-4.1-mini",
        encrypted_api_key="enc-b",
        enabled=True,
    )
    db_session.add_all([service_a, service_b])
    await db_session.commit()

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: owner

    completion = AsyncMock(
        return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="OK"))])
    )
    provider = SimpleNamespace(
        name="openai",
        model="gpt-4.1-mini",
        client=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=completion))),
    )
    user_client = SimpleNamespace(
        _providers=[provider],
        _ranked_providers=lambda: [provider],
        _call_provider_raw=AsyncMock(return_value="OK"),
    )

    try:
        with (
            patch(
                "app.classifier.llm_client.MultiLLMClient",
                return_value=MagicMock(_providers=[provider], _ranked_providers=lambda: [provider]),
            ),
            patch("app.crypto.decrypt_ai_secret", return_value="secret"),
            patch("app.classifier.llm_client.build_user_client", return_value=user_client) as build_user_client,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/admin/test-provider",
                    json={
                        "provider": "openai",
                        "is_user_service": True,
                        "service_id": service_b.id,
                        "prompt": "Say OK",
                    },
                )

        assert resp.status_code == 200
        assert build_user_client.called
        assert build_user_client.call_args.kwargs["model_id"] == service_b.model_id
        assert resp.json()["response"] == "OK"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_admin_reset_my_data_clears_all_user_data(db_session, mock_user):
    """POST /api/admin/reset-my-data clears user data, keeps user row, resets onboarding."""
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

    user2 = User(
        email="other@reset-test.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(user2)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user2.id))
    db_session.add(UserProfile(user_id=user2.id, full_name="Other User"))

    # --- user 1 fixture data ---
    email_1 = Email(gmail_id="reset-u1-1", sender="s@a.com", sender_domain="a.com", subject="Buy", user_id=uid_1)
    email_1b = Email(gmail_id="reset-u1-2", sender="s@a.com", sender_domain="a.com", subject="Buy2", user_id=uid_1)
    db_session.add_all([email_1, email_1b])
    await db_session.flush()

    txn = Transaction(
        email_id=email_1.id,
        label=Label.expense.value,
        amount=100,
        merchant="Test",
        category="Food",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    txn_b = Transaction(
        email_id=email_1b.id,
        label=Label.expense.value,
        amount=200,
        merchant="Test2",
        category="Food",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    db_session.add_all([txn, txn_b])
    await db_session.flush()

    budget = Budget(user_id=uid_1, category="Food", monthly_limit=5000)
    ca = ConnectedAccount(user_id=uid_1, provider="gmail", account_email="u1@gmail.com")
    sess = Session(user_id=uid_1, token=b"u1" * 16, expires_at=datetime.now(UTC) + timedelta(hours=1))
    cl = ClassificationLog(email_id=email_1.id, sender_domain="test.com", provider="openai")
    dp = DuplicatePair(primary_tx_id=txn.id, duplicate_tx_id=txn_b.id, rule_source="amount_date")
    tc = TransactionCorrection(transaction_id=txn.id, user_id=uid_1)
    debt = Debt(user_id=uid_1, name="Test Debt", total_amount=5000)
    re = RecurringExpense(user_id=uid_1, name="Netflix", amount=500, frequency="monthly")
    sr = SenderRule(user_id=uid_1, sender_domain="newsletter.com", label="ignore")
    fr = FilterRule(user_id=uid_1, rule_type="blocklist_domain", value="spam.com", source="user")
    umo = UserMerchantOverride(user_id=uid_1, merchant="TestMerchant", category="Food")
    uas = UserAIService(
        user_id=uid_1, provider="openai", display_name="Test", model_id="gpt-4", encrypted_api_key="enc"
    )
    uc = UserCategory(user_id=uid_1, name="TestCat", kind="expense")
    ss = SyncState(user_id=uid_1, last_history_id="123")
    sp = SyncProgress(user_id=uid_1, running=False)
    lst = LLMSpendTracker(user_id=uid_1, date=date.today(), provider="openai", model="gpt-4")
    al = AuditLog(user_id=uid_1, action="test")
    dt = DeviceToken(user_id=uid_1, token="device-tok-1", platform="ios")
    rtb = RefreshTokenBlacklist(user_id=uid_1, jti="jti-test-1")
    goal = Goal(user_id=uid_1, name="Test Goal", target_amount=10000)
    db_session.add_all(
        [
            budget,
            cl,
            dp,
            tc,
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
            sp,
            lst,
            al,
            dt,
            rtb,
            goal,
        ]
    )
    await db_session.flush()
    gc = GoalContribution(goal_id=goal.id, user_id=uid_1, amount=1000)
    ma = MerchantAlias(user_id=uid_1, raw="RAW MERCH", canonical="canonical")
    ma_ent = MerchantEntityAlias(user_id=uid_1, canonical_name="Canon", alias_name="Alias")
    db_session.add_all([gc, ma, ma_ent])

    # --- user 2 fixture data (isolation) ---
    email_2 = Email(gmail_id="reset-u2-1", sender="s@b.com", sender_domain="b.com", subject="Buy", user_id=user2.id)
    db_session.add(email_2)
    await db_session.flush()

    txn2 = Transaction(
        email_id=email_2.id,
        label=Label.expense.value,
        amount=200,
        merchant="Other",
        category="Food",
        status=TransactionStatus.auto.value,
        classifier_method=ClassifierMethod.llm.value,
    )
    db_session.add(txn2)
    budget2 = Budget(user_id=user2.id, category="Transport", monthly_limit=3000)
    ca2 = ConnectedAccount(user_id=user2.id, provider="gmail", account_email="u2@gmail.com")
    sess2 = Session(user_id=user2.id, token=b"u2" * 16, expires_at=datetime.now(UTC) + timedelta(hours=1))
    cl_u2 = ClassificationLog(email_id=email_2.id, sender_domain="iso.com", provider="openai")
    ss_u2 = SyncState(user_id=user2.id, last_history_id="456")
    sp_u2 = SyncProgress(user_id=user2.id, running=False)
    fr_u2 = FilterRule(user_id=user2.id, rule_type="blocklist_domain", value="spam2.com", source="user")
    sr_u2 = SenderRule(user_id=user2.id, sender_domain="spam2.com", label="ignore")
    goal_u2 = Goal(user_id=user2.id, name="U2 Goal", target_amount=5000)
    debt_u2 = Debt(user_id=user2.id, name="U2 Debt", total_amount=1000)
    re_u2 = RecurringExpense(user_id=user2.id, name="U2 Sub", amount=100, frequency="monthly")
    uas_u2 = UserAIService(
        user_id=user2.id, provider="openai", display_name="U2 AI", model_id="gpt-4", encrypted_api_key="enc-u2"
    )
    uc_u2 = UserCategory(user_id=user2.id, name="U2Cat", kind="expense")
    umo_u2 = UserMerchantOverride(user_id=user2.id, merchant="U2Merch", category="Food")
    ma_u2 = MerchantAlias(user_id=user2.id, raw="U2 RAW", canonical="u2-canon")
    ma_ent_u2 = MerchantEntityAlias(user_id=user2.id, canonical_name="U2Canon", alias_name="U2Alias")
    lst_u2 = LLMSpendTracker(user_id=user2.id, date=date.today(), provider="openai", model="gpt-4")
    al_u2 = AuditLog(user_id=user2.id, action="test-u2")
    dt_u2 = DeviceToken(user_id=user2.id, token="device-tok-u2", platform="ios")
    rtb_u2 = RefreshTokenBlacklist(user_id=user2.id, jti="jti-u2")
    db_session.add_all(
        [
            budget2,
            ca2,
            sess2,
            cl_u2,
            ss_u2,
            sp_u2,
            fr_u2,
            sr_u2,
            goal_u2,
            debt_u2,
            re_u2,
            uas_u2,
            uc_u2,
            umo_u2,
            ma_u2,
            ma_ent_u2,
            lst_u2,
            al_u2,
            dt_u2,
            rtb_u2,
        ]
    )
    await db_session.flush()
    gc_u2 = GoalContribution(goal_id=goal_u2.id, user_id=user2.id, amount=500)
    db_session.add(gc_u2)

    await db_session.commit()
    await db_session.refresh(mock_user)

    # verify data exists before reset
    assert (
        await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == uid_1))
    ).scalar() == 2
    assert (
        await db_session.execute(select(func.count()).select_from(Budget).where(Budget.user_id == uid_1))
    ).scalar() == 1

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/admin/reset-my-data")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["ok"] is True

    # --- user 1 data cleared ---
    assert (
        await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(Transaction).where(Transaction.id == txn.id))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(Budget).where(Budget.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(ClassificationLog).where(ClassificationLog.email_id == email_1.id)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(DuplicatePair).where(DuplicatePair.primary_tx_id == txn.id)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(TransactionCorrection).where(TransactionCorrection.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(ConnectedAccount).where(ConnectedAccount.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(Session).where(Session.user_id == uid_1))
    ).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(Debt).where(Debt.user_id == uid_1))).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(RecurringExpense).where(RecurringExpense.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(UserMerchantOverride).where(UserMerchantOverride.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(UserAIService).where(UserAIService.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(UserCategory).where(UserCategory.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(SyncState).where(SyncState.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(SyncProgress).where(SyncProgress.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(LLMSpendTracker).where(LLMSpendTracker.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(AuditLog).where(AuditLog.id == al.id))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(DeviceToken).where(DeviceToken.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(RefreshTokenBlacklist).where(RefreshTokenBlacklist.user_id == uid_1)
        )
    ).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(Goal).where(Goal.user_id == uid_1))).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(GoalContribution).where(GoalContribution.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(MerchantAlias).where(MerchantAlias.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(
            select(func.count()).select_from(MerchantEntityAlias).where(MerchantEntityAlias.user_id == uid_1)
        )
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(SenderRule).where(SenderRule.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(FilterRule).where(FilterRule.user_id == uid_1))
    ).scalar() == 0
    assert (
        await db_session.execute(select(func.count()).select_from(UserProfile).where(UserProfile.user_id == uid_1))
    ).scalar() == 0

    # --- user 1 row still exists, onboarding reset ---
    await db_session.refresh(mock_user)
    assert mock_user is not None, "User row should be kept"
    assert mock_user.onboarding_complete is False, "Onboarding should be reset"

    # --- user settings still exists ---
    us = (await db_session.execute(select(UserSettings).where(UserSettings.user_id == uid_1))).scalar_one_or_none()
    assert us is not None, "UserSettings should be kept"

    # --- user settings reset to defaults ---
    assert us.active_ai_service_id is None
    assert us.monthly_ai_budget is None
    assert us.auto_categorize is True
    assert us.use_rule_engine is True
    assert us.show_confidence is False
    assert us.daily_digest is False
    assert us.low_confidence_alerts is False
    assert us.sound_effects is False
    assert us.two_factor_enabled is False
    assert us.confidence_threshold == 70
    assert us.digest_hour == 9
    assert us.allowed_emails is None
    assert us.starting_balance is None
    assert us.starting_balance_date is None

    # --- user 2 data untouched ---
    assert (
        await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(Transaction).where(Transaction.id == txn2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(Budget).where(Budget.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(ConnectedAccount).where(ConnectedAccount.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(ClassificationLog).where(ClassificationLog.email_id == email_2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(SyncState).where(SyncState.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(SyncProgress).where(SyncProgress.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(FilterRule).where(FilterRule.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(SenderRule).where(SenderRule.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(Goal).where(Goal.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(GoalContribution).where(GoalContribution.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(Debt).where(Debt.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(RecurringExpense).where(RecurringExpense.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(UserMerchantOverride).where(UserMerchantOverride.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(UserAIService).where(UserAIService.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(UserCategory).where(UserCategory.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(MerchantAlias).where(MerchantAlias.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(MerchantEntityAlias).where(MerchantEntityAlias.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(LLMSpendTracker).where(LLMSpendTracker.user_id == user2.id)
        )
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(AuditLog).where(AuditLog.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(select(func.count()).select_from(DeviceToken).where(DeviceToken.user_id == user2.id))
    ).scalar() == 1
    assert (
        await db_session.execute(
            select(func.count()).select_from(RefreshTokenBlacklist).where(RefreshTokenBlacklist.user_id == user2.id)
        )
    ).scalar() == 1
    user2_row = (await db_session.execute(select(User).where(User.id == user2.id))).scalar_one_or_none()
    assert user2_row is not None
    assert user2_row.onboarding_complete is True
