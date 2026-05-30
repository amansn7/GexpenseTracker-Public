import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app


@pytest.fixture
def override_db(db_session):
    async def _override():
        yield db_session
    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_links_empty(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/budgets/links")
    assert resp.status_code == 200
    assert resp.json() == {"links": []}


@pytest.mark.asyncio
async def test_create_link(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["source_category"] == "Rent"
    assert body["target_category"] == "Maintenance"
    assert body["split_amount"] == 2000.0
    assert "id" in body


@pytest.mark.asyncio
async def test_create_link_duplicate_returns_409(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
        )
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 3000},
        )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_link_same_category_returns_422(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Rent", "split_amount": 1000},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_link_zero_amount_returns_422(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/budgets/links",
            json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 0},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_link(override_db, db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        created = (
            await client.post(
                "/api/budgets/links",
                json={"source_category": "Rent", "target_category": "Maintenance", "split_amount": 2000},
            )
        ).json()
        resp = await client.delete(f"/api/budgets/links/{created['id']}")
        assert resp.status_code == 200
        listing = await client.get("/api/budgets/links")
        assert listing.json()["links"] == []
