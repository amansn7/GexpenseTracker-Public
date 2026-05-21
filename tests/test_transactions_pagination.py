from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture(autouse=True)
def set_testing(monkeypatch):
    monkeypatch.setenv("TESTING", "1")


@pytest.fixture(autouse=True)
def override_auth():
    """Override get_current_user for all pagination tests."""
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


def _make_row(txn_id: str):
    from app.models import Email, Transaction
    t = MagicMock(spec=Transaction)
    t.id = txn_id
    t.label = "expense"
    t.amount = 100.0
    t.currency = "INR"
    t.merchant = "TestMerchant"
    t.category = "food"
    t.txn_date = None
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
    """GET /api/transactions returns {items, total, offset, limit}."""
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
                result.scalar_one.return_value = 3  # total count
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
    """Each item in response includes read and flagged fields."""
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
