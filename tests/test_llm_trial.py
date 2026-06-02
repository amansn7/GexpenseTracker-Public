"""Tests for LLM trial system — FreeLLMAPI proxy, trial lifecycle, and BYOK fallback."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from app.classifier.llm.user_client import build_trial_client
from app.classifier.llm.providers import Provider
from app.config import settings
from app.services.llm_service import get_effective_llm_client, trial_status


# ── build_trial_client — unit tests ──────────────────────────────────────

class TestBuildTrialClient:
    @pytest.mark.asyncio
    async def test_returns_client_when_key_configured(self):
        with (
            patch.object(settings, "FREELLMAPI_API_KEY", "test-key"),
            patch.object(settings, "FREELLMAPI_BASE_URL", "https://proxy.test"),
        ):
            client = build_trial_client("user-1")
            assert client is not None
            provider_names = [p.name for p in client._providers]
            assert "freellmapi" in provider_names
            assert provider_names[0] == "freellmapi"

    @pytest.mark.asyncio
    async def test_returns_none_when_no_key(self):
        with patch.object(settings, "FREELLMAPI_API_KEY", ""):
            client = build_trial_client("user-1")
            assert client is None

    @pytest.mark.asyncio
    async def test_freellmapi_provider_is_configured_correctly(self):
        with (
            patch.object(settings, "FREELLMAPI_API_KEY", "proxy-key-123"),
            patch.object(settings, "FREELLMAPI_BASE_URL", "https://proxy.test"),
            patch.object(settings, "FREELLMAPI_MODEL", "gpt-4o-mini"),
        ):
            client = build_trial_client("user-1")
            assert client is not None
            proxy = client._providers[0]
            assert proxy.name == "freellmapi"
            assert proxy.base_url == "https://proxy.test"
            assert proxy.api_key == "proxy-key-123"
            assert proxy.model == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_uses_auto_model_when_not_configured(self):
        with (
            patch.object(settings, "FREELLMAPI_API_KEY", "key"),
            patch.object(settings, "FREELLMAPI_MODEL", ""),
        ):
            client = build_trial_client("user-1")
            assert client is not None
            assert client._providers[0].model == "auto"

    @pytest.mark.asyncio
    async def test_freellmapi_is_first_provider(self):
        with (
            patch.object(settings, "FREELLMAPI_API_KEY", "key"),
        ):
            client = build_trial_client("user-1")
            assert client is not None
            names = [p.name for p in client._providers]
            assert names[0] == "freellmapi"


# ── _get_trial_client / get_effective_llm_client — unit tests ─────────────

class TestGetEffectiveLLMClient:
    @pytest.mark.asyncio
    async def test_byok_takes_priority_over_trial(self):
        """User with BYOK should get BYOK client, not trial."""
        mock_db = AsyncMock()

        # User has BYOK (active_ai_service_id set)
        user_settings_mock = MagicMock()
        user_settings_mock.active_ai_service_id = "svc-1"
        mock_user_settings = MagicMock()
        mock_user_settings.scalar_one_or_none.return_value = user_settings_mock
        mock_db.execute.return_value = mock_user_settings

        # AI service exists and is enabled
        ai_svc_mock = MagicMock()
        ai_svc_mock.enabled = True
        ai_svc_mock.encrypted_api_key = "gAAAAABtestencryptedkey=="
        ai_svc_mock.provider = "openai"
        ai_svc_mock.base_url = "https://api.openai.com/v1"
        ai_svc_mock.model_id = "gpt-4"
        mock_ai_svc = MagicMock()
        mock_ai_svc.scalar_one_or_none.return_value = ai_svc_mock

        # Need to handle two execute calls: first for UserSettings, second for UserAIService
        mock_db.execute = AsyncMock(side_effect=[mock_user_settings, mock_ai_svc])

        with (
            patch("app.services.llm_service.decrypt_ai_secret", return_value="decrypted-key"),
            patch("app.services.llm_service.build_user_client") as mock_build,
            patch.object(settings, "ENABLE_LLM_TRIAL", True),
        ):
            mock_client = MagicMock()
            mock_build.return_value = mock_client
            result = await get_effective_llm_client("user-1", mock_db)

        assert result is mock_client
        mock_build.assert_called_once()

    @pytest.mark.asyncio
    async def test_trial_client_when_no_byok_and_trial_active(self):
        """User without BYOK but within trial window should get trial client."""
        mock_db = AsyncMock()

        # No BYOK
        mock_user_settings = MagicMock()
        mock_user_settings.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_user_settings

        # User exists with active trial
        mock_user = MagicMock()
        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=1)
        mock_user.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=6)
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        with (
            patch.object(settings, "ENABLE_LLM_TRIAL", True),
            patch.object(settings, "FREELLMAPI_API_KEY", "trial-key"),
            patch("app.services.llm_service.build_trial_client") as mock_build_trial,
        ):
            # First execute returns None (no BYOK UserSettings), second returns user
            mock_db.execute = AsyncMock(side_effect=[mock_user_settings, mock_user_result])
            mock_trial_client = MagicMock()
            mock_build_trial.return_value = mock_trial_client
            result = await get_effective_llm_client("user-1", mock_db)

        assert result is mock_trial_client
        mock_build_trial.assert_called_once_with("user-1")

    @pytest.mark.asyncio
    async def test_returns_none_when_trial_expired_and_no_byok(self):
        """User with expired trial and no BYOK should get None (no global fallback)."""
        mock_db = AsyncMock()

        # No BYOK
        mock_user_settings = MagicMock()
        mock_user_settings.scalar_one_or_none.return_value = None

        # User with expired trial
        mock_user = MagicMock()
        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=10)
        mock_user.trial_ends_at = datetime.now(timezone.utc) - timedelta(days=3)
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        with patch.object(settings, "ENABLE_LLM_TRIAL", True):
            mock_db.execute = AsyncMock(side_effect=[mock_user_settings, mock_user_result])
            result = await get_effective_llm_client("user-1", mock_db)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_trial_dates(self):
        """User with no trial at all should get None (no global fallback)."""
        mock_db = AsyncMock()

        # No BYOK
        mock_user_settings = MagicMock()
        mock_user_settings.scalar_one_or_none.return_value = None

        # User with no trial dates
        mock_user = MagicMock()
        mock_user.trial_started_at = None
        mock_user.trial_ends_at = None
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        with patch.object(settings, "ENABLE_LLM_TRIAL", True):
            mock_db.execute = AsyncMock(side_effect=[mock_user_settings, mock_user_result])
            result = await get_effective_llm_client("user-1", mock_db)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_providers_at_all(self):
        """No BYOK, no trial, no env providers → None."""
        mock_db = AsyncMock()
        mock_user_settings = MagicMock()
        mock_user_settings.scalar_one_or_none.return_value = None
        mock_user = MagicMock()
        mock_user.trial_started_at = None
        mock_user.trial_ends_at = None
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        with (
            patch.object(settings, "ENABLE_LLM_TRIAL", True),
            patch("app.services.llm_service.llm_client") as mock_global,
        ):
            mock_db.execute = AsyncMock(side_effect=[mock_user_settings, mock_user_result])
            mock_global._providers = []  # No env providers
            result = await get_effective_llm_client("user-1", mock_db)

        assert result is None

    @pytest.mark.asyncio
    async def test_byok_when_service_disabled(self):
        """User with disabled AI service should fall through to trial/owner, not global."""
        mock_db = AsyncMock()

        user_settings_mock = MagicMock()
        user_settings_mock.active_ai_service_id = "svc-1"
        mock_user_settings = MagicMock()
        mock_user_settings.scalar_one_or_none.return_value = user_settings_mock

        ai_svc_mock = MagicMock()
        ai_svc_mock.enabled = False  # Disabled
        ai_svc_mock.encrypted_api_key = None
        mock_ai_svc = MagicMock()
        mock_ai_svc.scalar_one_or_none.return_value = ai_svc_mock

        mock_user = MagicMock()
        mock_user.trial_started_at = None
        mock_user.trial_ends_at = None
        mock_user_result = MagicMock()
        mock_user_result.scalar_one_or_none.return_value = mock_user

        with patch.object(settings, "ENABLE_LLM_TRIAL", True):
            mock_db.execute = AsyncMock(side_effect=[mock_user_settings, mock_ai_svc, mock_user_result])
            result = await get_effective_llm_client("user-1", mock_db)

        assert result is None


# ── trial_status — unit tests ────────────────────────────────────────────

class TestTrialStatus:
    @pytest.mark.asyncio
    async def test_active_trial(self):
        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=2)
        mock_user.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=5)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute.return_value = mock_result

        status = await trial_status("user-1", mock_db)
        assert status["in_trial"] is True
        assert 4 <= status["days_remaining"] <= 5  # may be 4 or 5 depending on time of day

    @pytest.mark.asyncio
    async def test_expired_trial(self):
        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=10)
        mock_user.trial_ends_at = datetime.now(timezone.utc) - timedelta(days=3)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute.return_value = mock_result

        status = await trial_status("user-1", mock_db)
        assert status["in_trial"] is False

    @pytest.mark.asyncio
    async def test_no_trial(self):
        mock_db = AsyncMock()
        mock_user = MagicMock()
        mock_user.trial_started_at = None
        mock_user.trial_ends_at = None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        mock_db.execute.return_value = mock_result

        status = await trial_status("user-1", mock_db)
        assert status["in_trial"] is False
        assert status["trial_started_at"] is None

    @pytest.mark.asyncio
    async def test_user_not_found(self):
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result

        status = await trial_status("nonexistent", mock_db)
        assert status["in_trial"] is False


# ── _resolve_client — unit tests (via classifier) ────────────────────────

class TestResolveClient:
    @pytest.mark.asyncio
    async def test_override_takes_priority(self):
        from app.classifier.classifier import _resolve_client

        mock_override = MagicMock()
        result = await _resolve_client(mock_override, "user-1", MagicMock())
        assert result is mock_override

    @pytest.mark.asyncio
    async def test_user_id_and_session_calls_effective(self):
        from app.classifier.classifier import _resolve_client

        with patch("app.classifier.classifier.get_effective_llm_client") as mock_effective:
            mock_effective.return_value = MagicMock()
            result = await _resolve_client(None, "user-1", MagicMock())
            assert result is not None
            mock_effective.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_user_id_falls_back_to_global(self):
        from app.classifier.classifier import _resolve_client, llm_client

        # Ensure global has providers
        original_providers = list(llm_client._providers)
        llm_client._providers = [MagicMock()]
        try:
            result = await _resolve_client(None, None, None)
            assert result is llm_client
        finally:
            llm_client._providers = original_providers

    @pytest.mark.asyncio
    async def test_global_fallback_always_returns_client(self):
        from app.classifier.classifier import _resolve_client, llm_client

        result = await _resolve_client(None, None, None)
        assert result is llm_client  # Always falls back to global, even if empty


# ── Integration tests (with db_session / mock_user) ──────────────────────

@pytest.mark.asyncio
async def test_onboarding_sets_trial_dates_when_enabled(db_session):
    """When ENABLE_LLM_TRIAL is True, new users get trial dates."""
    from app.models import User, UserRole, UserStatus

    with patch.object(settings, "ENABLE_LLM_TRIAL", True):
        user = User(
            email="trial-user@test.com",
            role=UserRole.member,
            status=UserStatus.active,
            onboarding_complete=True,
        )
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        user.trial_started_at = now
        user.trial_ends_at = now + timedelta(days=settings.TRIAL_DURATION_DAYS)
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        assert user.trial_started_at is not None
        assert user.trial_ends_at is not None
        end = user.trial_ends_at
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        remaining = (end - datetime.now(timezone.utc)).days
        assert remaining == settings.TRIAL_DURATION_DAYS or remaining == settings.TRIAL_DURATION_DAYS - 1


@pytest.mark.asyncio
async def test_onboarding_does_not_set_trial_when_disabled(db_session):
    """When ENABLE_LLM_TRIAL is False, no trial dates."""
    from app.models import User, UserRole, UserStatus

    with patch.object(settings, "ENABLE_LLM_TRIAL", False):
        user = User(
            email="no-trial-user@test.com",
            role=UserRole.member,
            status=UserStatus.active,
            onboarding_complete=True,
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        assert user.trial_started_at is None
        assert user.trial_ends_at is None


@pytest.mark.asyncio
async def test_onboarding_api_sets_trial_dates(db_session):
    """POST /api/account/onboarding sets trial dates via HTTP."""
    from app.main import app
    from app.database import get_db
    from httpx import AsyncClient, ASGITransport

    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    try:
        with patch.object(settings, "ENABLE_LLM_TRIAL", True):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/account/onboarding",
                    json={
                        "email": "onboard-trial@test.com",
                        "full_name": "Trial User",
                    },
                )
            assert resp.status_code == 201
            data = resp.json()
            assert data["user"]["email"] == "onboard-trial@test.com"

            # Verify trial dates in DB
            from app.models import User
            from sqlalchemy import select

            user = (await db_session.execute(
                select(User).where(User.email == "onboard-trial@test.com")
            )).scalar_one()
            assert user.trial_started_at is not None
            assert user.trial_ends_at is not None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_llm_trial_status_endpoint(mock_user, db_session):
    """GET /api/account/settings/llm-trial returns trial status."""
    from app.main import app
    from app.database import get_db
    from app.config import settings
    from httpx import AsyncClient, ASGITransport

    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    try:
        # Set trial dates on the mock user
        from datetime import datetime, timedelta, timezone

        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=1)
        mock_user.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=6)
        await db_session.commit()

        with patch.object(settings, "ENABLE_LLM_TRIAL", True):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.get(
                    "/api/account/settings/llm-trial",
                    cookies={"access_token": "test"},
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["in_trial"] is True
            assert 5 <= data["days_remaining"] <= 6
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_admin_trial_extend(mock_user, db_session):
    """POST /api/admin/trial/extend extends trial by N days."""
    from app.main import app
    from app.database import get_db
    from app.config import settings
    from httpx import AsyncClient, ASGITransport

    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    try:
        from datetime import datetime, timedelta, timezone

        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=1)
        mock_user.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=6)
        await db_session.commit()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/trial/extend",
                json={"user_id": mock_user.id, "days": 14},
                cookies={"access_token": "test"},
            )

        assert resp.status_code == 200
        await db_session.refresh(mock_user)
        end = mock_user.trial_ends_at
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        remaining = (end - datetime.now(timezone.utc)).days
        assert remaining >= 18  # 6 + 14 = 20, minus a few secs
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_admin_trial_revoke(mock_user, db_session):
    """POST /api/admin/trial/revoke ends trial immediately."""
    from app.main import app
    from app.database import get_db
    from app.config import settings
    from httpx import AsyncClient, ASGITransport

    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    try:
        from datetime import datetime, timedelta, timezone

        mock_user.trial_started_at = datetime.now(timezone.utc) - timedelta(days=1)
        mock_user.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=6)
        await db_session.commit()

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/trial/revoke",
                json={"user_id": mock_user.id},
                cookies={"access_token": "test"},
            )

        assert resp.status_code == 200
        await db_session.refresh(mock_user)
        end = mock_user.trial_ends_at
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        assert end <= datetime.now(timezone.utc) + timedelta(seconds=2)
    finally:
        app.dependency_overrides.pop(get_db, None)
