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


@pytest.mark.asyncio
async def test_health_returns_expected_fields(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        assert "current_balance" in data
        assert "savings_rate" in data
        assert "runway_months" in data
        assert "monthly_net" in data
        assert "balance_mode" in data
        assert data["balance_mode"] == "computed"
        assert isinstance(data["monthly_net"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_rejects_invalid_months(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/health?months=7")
        assert r.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_accepts_months_3_and_12(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r3 = await client.get("/api/stats/health?months=3")
            r12 = await client.get("/api/stats/health?months=12")
        assert r3.status_code == 200
        assert r12.status_code == 200
        for r in [r3, r12]:
            data = r.json()
            assert "monthly_net" in data
            for entry in data["monthly_net"]:
                assert "month" in entry
                assert "income" in entry
                assert "expenses" in entry
                assert "net" in entry
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_health_anchored_balance_mode(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Create user + settings, set starting_balance
            await client.post("/api/account/onboarding", json={
                "email": "test2@example.com",
                "full_name": "Test User 2",
            })
            await client.patch("/api/account/settings", json={
                "starting_balance": 50000,
                "starting_balance_date": "2026-01-01",
            })
            r = await client.get("/api/stats/health?months=6")
        assert r.status_code == 200
        data = r.json()
        assert data["balance_mode"] == "anchored"
        assert data["starting_balance"] == 50000.0
    finally:
        app.dependency_overrides.pop(get_db, None)
