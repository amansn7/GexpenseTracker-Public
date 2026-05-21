import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.main import app
from app.models import User, UserAIService, UserCategory, UserSettings


async def _client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_onboarding_creates_user_profile_settings_and_defaults(db_session):
    client = await _client(db_session)
    try:
        async with client:
            resp = await client.post("/api/account/onboarding", json={
                "email": "USER@Example.COM",
                "full_name": "Aman Saini",
                "location": "Bengaluru, IN",
                "default_currency": "INR",
                "timezone": "Asia/Kolkata",
                "role": "owner",
            })
        assert resp.status_code == 201
        data = resp.json()
        assert data["user"]["email"] == "aman@example.com"
        assert data["user"]["role"] == "owner"
        assert data["user"]["onboarding_complete"] is True
        assert data["profile"]["full_name"] == "Aman Saini"
        assert data["settings"]["daily_digest"] is True
        assert len(data["connected_accounts"]) == 1
        assert data["connected_accounts"][0]["provider"] == "gmail"
        assert len(data["categories"]) >= 8

        user = (await db_session.execute(select(User).where(User.email == "aman@example.com"))).scalar_one()
        settings_obj = (await db_session.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
        assert settings_obj.confidence_threshold == 70
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_account_profile_and_settings_update(db_session, mock_user):
    client = await _client(db_session)
    try:
        async with client:
            profile = await client.patch("/api/account/profile", json={
                "display_name": "Owner",
                "phone": "+91 99999 99999",
                "default_currency": "usd",
            })
            assert profile.status_code == 200
            assert profile.json()["profile"]["display_name"] == "Owner"
            assert profile.json()["profile"]["default_currency"] == "USD"

            settings_resp = await client.patch("/api/account/settings", json={
                "daily_digest": False,
                "confidence_threshold": 82,
                "monthly_ai_budget": 500,
            })
            assert settings_resp.status_code == 200
            payload = settings_resp.json()["settings"]
            assert payload["daily_digest"] is False
            assert payload["confidence_threshold"] == 82
            assert payload["monthly_ai_budget"] == 500.0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_account_associated_items_are_user_owned(db_session):

    client = await _client(db_session)
    try:
        async with client:
            # Create user A and B via onboarding
            user_a_data = (await client.post("/api/account/onboarding", json={
                "email": "a@example.com",
                "full_name": "User A",
            })).json()["user"]
            user_b_data = (await client.post("/api/account/onboarding", json={
                "email": "b@example.com",
                "full_name": "User B",
            })).json()["user"]

            # Load actual User objects from db
            user_a = (await db_session.execute(select(User).where(User.id == user_a_data["id"]))).scalar_one()
            user_b = (await db_session.execute(select(User).where(User.id == user_b_data["id"]))).scalar_one()

            # Auth as user A — create a category
            async def auth_a():
                return user_a
            app.dependency_overrides[get_current_user] = auth_a

            category_resp = await client.post("/api/account/categories", json={
                "name": "Investing",
                "color": "#cdd8d1",
                "kind": "expense",
            })
            assert category_resp.status_code == 201
            category_id = category_resp.json()["category"]["id"]

            # Auth as user B — patch user A's category should 404
            async def auth_b():
                return user_b
            app.dependency_overrides[get_current_user] = auth_b

            wrong_user = await client.patch(
                f"/api/account/categories/{category_id}",
                json={"name": "Stolen"},
            )
            assert wrong_user.status_code == 404

            # Auth as user A — create AI service
            app.dependency_overrides[get_current_user] = auth_a

            ai_resp = await client.post("/api/account/ai-services", json={
                "provider": "openrouter",
                "display_name": "OpenRouter",
                "model_id": "google/gemini-2.0-flash-exp:free",
                "base_url": "https://openrouter.ai/api/v1",
                "api_key": "sk-test-secret",
            })
            assert ai_resp.status_code == 201
            ai_service = ai_resp.json()["ai_service"]
            assert ai_service["api_key_hint"] == "••cret"
            assert "encrypted_api_key" not in ai_service

        categories = (await db_session.execute(select(UserCategory).where(UserCategory.user_id == user_a.id))).scalars().all()
        services = (await db_session.execute(select(UserAIService).where(UserAIService.user_id == user_a.id))).scalars().all()
        assert any(c.name == "Investing" for c in categories)
        assert services[0].encrypted_api_key != "sk-test-secret"
        assert services[0].encrypted_api_key.startswith("gAAAA")
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_onboarding_invite_code_gate(db_session, monkeypatch):
    monkeypatch.setattr(settings, "INVITE_CODE", "private-beta")
    client = await _client(db_session)
    try:
        async with client:
            denied = await client.post("/api/account/onboarding", json={
                "email": "blocked@example.com",
                "full_name": "Blocked User",
                "invite_code": "wrong",
            })
            assert denied.status_code == 403

            allowed = await client.post("/api/account/onboarding", json={
                "email": "allowed@example.com",
                "full_name": "Allowed User",
                "invite_code": "private-beta",
            })
            assert allowed.status_code == 201
    finally:
        app.dependency_overrides.pop(get_db, None)
