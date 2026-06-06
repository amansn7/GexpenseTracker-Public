import base64
from datetime import UTC, datetime, date
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture(autouse=True)
def set_testing(monkeypatch):
    monkeypatch.setenv("TESTING", "1")


@pytest.fixture(autouse=True)
def override_auth():
    import uuid
    from unittest.mock import MagicMock

    from app.auth_deps import get_current_user
    from app.main import app
    from app.models import User

    fake_user = MagicMock(spec=User)
    fake_user.id = str(uuid.uuid4())
    fake_user.email = "pagination-test@example.com"

    async def _override():
        return fake_user

    app.dependency_overrides[get_current_user] = _override
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _make_row(txn_id: str, txn_date: date | None = None):
    from app.models import Email, Transaction

    t = MagicMock(spec=Transaction)
    t.id = txn_id
    t.label = "expense"
    t.amount = 100.0
    t.currency = "INR"
    t.merchant = "TestMerchant"
    t.category = "food"
    t.txn_date = txn_date
    t.confidence = 0.9
    t.status = "auto"
    t.classifier_method = "llm"
    t.user_notes = None
    t.read = False
    t.flagged = False
    t.created_at = datetime(2026, 4, 1, tzinfo=UTC)

    e = MagicMock(spec=Email)
    e.subject = "Debit alert"
    e.sender = "noreply@test.com"
    e.received_at = datetime(2026, 4, 1, tzinfo=UTC)
    e.gmail_link = "https://mail.google.com/mail/u/0/#inbox/abc"
    return t, e


@pytest.mark.asyncio
async def test_list_transactions_returns_paginated_shape():
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    rows = [_make_row(f"tx-{i}") for i in range(3)]
    execute_call = 0

    async def override_get_db():
        nonlocal execute_call
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call
            execute_call += 1
            result = MagicMock()
            if execute_call == 1:
                result.scalar_one.return_value = 3
            else:
                result.all.return_value = rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/transactions?offset=0&limit=2")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert "offset" in data
        assert "limit" in data
        assert data["total"] == 3
        assert data["offset"] == 0
        assert data["limit"] == 2
        assert isinstance(data["items"], list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_list_transactions_items_include_read_and_flagged():
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    rows = [_make_row("tx-1")]
    execute_call = 0

    async def override_get_db():
        nonlocal execute_call
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call
            execute_call += 1
            result = MagicMock()
            if execute_call == 1:
                result.scalar_one.return_value = 1
            else:
                result.all.return_value = rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/transactions")
        assert r.status_code == 200
        item = r.json()["items"][0]
        assert "read" in item
        assert "flagged" in item
        assert item["read"] is False
        assert item["flagged"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cursor_pagination_returns_next_cursor():
    """With cursor param, response includes next_cursor instead of offset/limit."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    rows = [_make_row(f"tx-{i}", txn_date=date(2026, 4, i + 1)) for i in range(5)]
    cursor_val = base64.b64encode(b"2026-04-03|tx-2").decode()
    filtered = [r for r in rows if (r[0].txn_date, r[0].id) < (date(2026, 4, 3), "tx-2")]
    data_rows = sorted(filtered, key=lambda r: (r[0].txn_date, r[0].id), reverse=True)[:3]
    execute_call = 0

    async def override_get_db():
        nonlocal execute_call
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call
            execute_call += 1
            result = MagicMock()
            if execute_call == 1:
                result.scalar_one.return_value = 5
            else:
                result.all.return_value = data_rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get(f"/api/transactions?cursor={cursor_val}&limit=3")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "next_cursor" in data
        assert "total" in data
        assert "offset" not in data
        assert "limit" not in data
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cursor_pagination_no_more_pages():
    """When fewer results than limit, next_cursor is null."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    rows = [_make_row("tx-last", txn_date=date(2026, 1, 1))]
    cursor_val = base64.b64encode(b"2026-06-01|tx-fake").decode()
    execute_call = 0

    async def override_get_db():
        nonlocal execute_call
        db = AsyncMock()

        def execute_side(q):
            nonlocal execute_call
            execute_call += 1
            result = MagicMock()
            if execute_call == 1:
                result.scalar_one.return_value = 1
            else:
                result.all.return_value = rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get(f"/api/transactions?cursor={cursor_val}&limit=2")
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 1
        assert data["next_cursor"] is None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cursor_pagination_invalid_cursor_returns_400():
    """Malformed cursor returns 400."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    async def override_get_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one.return_value = 0
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/transactions?cursor=!!!invalid-b64!!!")
        assert r.status_code == 400
        assert "Invalid cursor format" in r.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cursor_pagination_limit_max_capped():
    """limit over 100 returns 422."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    async def override_get_db():
        db = AsyncMock()
        db.execute = AsyncMock(return_value=MagicMock(scalar_one=MagicMock(return_value=0)))
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/transactions?limit=200")
        assert r.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_cursor_vs_offset_response_shape():
    """Cursor mode returns next_cursor; offset mode returns offset/limit."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app

    rows = [_make_row("tx-1", txn_date=date(2026, 4, 1))]
    cursor_val = base64.b64encode(b"2026-06-01|tx-fake").decode()

    async def make_db(call_count):
        db = AsyncMock()
        count = call_count

        def execute_side(q):
            nonlocal count
            count += 1
            result = MagicMock()
            if count == 1:
                result.scalar_one.return_value = 1
            else:
                result.all.return_value = rows
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        return db

    # Cursor mode
    db_for_cursor = await make_db(0)

    async def override_cursor():
        yield db_for_cursor

    app.dependency_overrides[get_db] = override_cursor
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get(f"/api/transactions?cursor={cursor_val}&limit=50")
    assert r.status_code == 200
    data = r.json()
    assert "next_cursor" in data
    assert "offset" not in data
    assert "limit" not in data
    app.dependency_overrides.pop(get_db, None)

    # Offset mode
    db_for_offset = await make_db(0)

    async def override_offset():
        yield db_for_offset

    app.dependency_overrides[get_db] = override_offset
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/api/transactions?offset=0&limit=50")
    assert r.status_code == 200
    data = r.json()
    assert "offset" in data
    assert "limit" in data
    assert "next_cursor" not in data
    app.dependency_overrides.pop(get_db, None)
