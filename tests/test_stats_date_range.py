import pytest
import os
os.environ["TESTING"] = "1"
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db


@pytest.mark.asyncio
async def test_summary_accepts_date_from_date_to(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/summary?date_from=2026-01-01&date_to=2026-04-30")
        assert r.status_code == 200
        data = r.json()
        assert "total_expenses" in data
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_category_breakdown_accepts_date_range(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/category-breakdown?date_from=2026-01-01&date_to=2026-04-30")
        assert r.status_code == 200
        assert "categories" in r.json()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_period_still_works(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/summary?period=3m")
        assert r.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_monthly_trend_accepts_date_range(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/monthly-trend?date_from=2026-01-01&date_to=2026-04-30")
        assert r.status_code == 200
        assert "months" in r.json()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_top_merchants_accepts_date_range(db_session, mock_user):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/stats/top-merchants?date_from=2026-01-01&date_to=2026-04-30")
        assert r.status_code == 200
        assert "merchants" in r.json()
    finally:
        app.dependency_overrides.pop(get_db, None)
