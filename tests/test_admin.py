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
    from datetime import date, datetime, timedelta, timezone
    from sqlalchemy import select, func

    from app.models import (
        Budget, ConnectedAccount, Email, Session, Transaction,
        TransactionStatus, User, UserProfile, UserRole, UserSettings,
        UserStatus, Label, ClassifierMethod,
    )

    uid_1 = mock_user.id

    user2 = User(
        email="other@reset-test.com", role=UserRole.owner, status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(user2)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user2.id))
    db_session.add(UserProfile(user_id=user2.id, full_name="Other User"))

    # --- user 1 fixture data ---
    email_1 = Email(gmail_id="reset-u1-1", sender="s@a.com", sender_domain="a.com", subject="Buy", user_id=uid_1)
    db_session.add(email_1)
    await db_session.flush()

    txn = Transaction(email_id=email_1.id, label=Label.expense.value, amount=100,
                       merchant="Test", category="Food", status=TransactionStatus.auto.value,
                       classifier_method=ClassifierMethod.llm.value)
    db_session.add(txn)
    budget = Budget(user_id=uid_1, category="Food", monthly_limit=5000)
    db_session.add(budget)
    ca = ConnectedAccount(user_id=uid_1, provider="gmail", account_email="u1@gmail.com")
    db_session.add(ca)
    sess = Session(user_id=uid_1, token=b"u1" * 16, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db_session.add(sess)

    # --- user 2 fixture data (isolation) ---
    email_2 = Email(gmail_id="reset-u2-1", sender="s@b.com", sender_domain="b.com", subject="Buy", user_id=user2.id)
    db_session.add(email_2)
    await db_session.flush()

    txn2 = Transaction(email_id=email_2.id, label=Label.expense.value, amount=200,
                        merchant="Other", category="Food", status=TransactionStatus.auto.value,
                        classifier_method=ClassifierMethod.llm.value)
    db_session.add(txn2)
    budget2 = Budget(user_id=user2.id, category="Transport", monthly_limit=3000)
    db_session.add(budget2)
    ca2 = ConnectedAccount(user_id=user2.id, provider="gmail", account_email="u2@gmail.com")
    db_session.add(ca2)
    sess2 = Session(user_id=user2.id, token=b"u2" * 16, expires_at=datetime.now(timezone.utc) + timedelta(hours=1))
    db_session.add(sess2)

    await db_session.commit()
    await db_session.refresh(mock_user)

    # verify data exists before reset
    assert (await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == uid_1))).scalar() == 1
    assert (await db_session.execute(select(func.count()).select_from(Budget).where(Budget.user_id == uid_1))).scalar() == 1

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/admin/reset-my-data")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert data["ok"] is True

    # --- user 1 data cleared ---
    assert (await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == uid_1))).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(Transaction).where(Transaction.id == txn.id))).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(Budget).where(Budget.user_id == uid_1))).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(ConnectedAccount).where(ConnectedAccount.user_id == uid_1))).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(Session).where(Session.user_id == uid_1))).scalar() == 0
    assert (await db_session.execute(select(func.count()).select_from(UserProfile).where(UserProfile.user_id == uid_1))).scalar() == 0

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
    assert (await db_session.execute(select(func.count()).select_from(Email).where(Email.user_id == user2.id))).scalar() == 1
    assert (await db_session.execute(select(func.count()).select_from(Budget).where(Budget.user_id == user2.id))).scalar() == 1
    assert (await db_session.execute(select(func.count()).select_from(ConnectedAccount).where(ConnectedAccount.user_id == user2.id))).scalar() == 1
    user2_row = (await db_session.execute(select(User).where(User.id == user2.id))).scalar_one_or_none()
    assert user2_row is not None
    assert user2_row.onboarding_complete is True
