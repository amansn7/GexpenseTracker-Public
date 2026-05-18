import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.category_service import get_canonical_map


@pytest.mark.asyncio
async def test_canonical_map_endpoint_returns_known_keys():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/categories/canonical-map")
    assert resp.status_code == 200
    body = resp.json()
    assert "map" in body
    m = body["map"]
    assert isinstance(m, dict)
    assert len(m) > 0
    # Known aliases the frontend depends on.
    assert m.get("food") == "food"
    assert m.get("groceries") == "groceries"
    assert m.get("rent") == "rent"
    # Cache header should be present (1h).
    cc = resp.headers.get("cache-control", "")
    assert "max-age=3600" in cc


@pytest.mark.asyncio
async def test_canonical_map_endpoint_no_auth_required():
    # Endpoint is static config; should respond 200 without any user/session.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/categories/canonical-map")
    assert resp.status_code == 200


def test_get_canonical_map_returns_copy_not_reference():
    a = get_canonical_map()
    b = get_canonical_map()
    a["__sentinel__"] = "mutated"
    assert "__sentinel__" not in b
