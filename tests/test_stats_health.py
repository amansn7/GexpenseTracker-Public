import pytest
import os
os.environ["TESTING"] = "1"
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db


@pytest.mark.asyncio
async def test_settings_patch_accepts_starting_balance(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        # First create a user + settings via onboarding
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/account/onboarding", json={
                "email": "test@example.com",
                "full_name": "Test User",
            })
            r = await client.patch("/api/account/settings", json={
                "starting_balance": 100000,
                "starting_balance_date": "2026-01-01",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["settings"]["starting_balance"] == 100000.0
        assert data["settings"]["starting_balance_date"] == "2026-01-01"
    finally:
        app.dependency_overrides.pop(get_db, None)
