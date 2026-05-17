import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

from app.main import app
from app.database import get_db
from app.auth_deps import get_current_user
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
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content="OK"))]
        )
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
        with patch("app.classifier.llm_client.MultiLLMClient", return_value=MagicMock(_providers=[provider], _ranked_providers=lambda: [provider])), patch("app.crypto.decrypt_ai_secret", return_value="secret"), patch("app.classifier.llm_client.build_user_client", return_value=user_client) as build_user_client:
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
