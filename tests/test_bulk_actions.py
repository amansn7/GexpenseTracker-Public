from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture(autouse=True)
def set_testing(monkeypatch):
    monkeypatch.setenv("TESTING", "1")


@pytest.fixture(autouse=True)
def override_auth():
    """Override get_current_user for all bulk action tests."""
    import uuid

    from app.auth_deps import get_current_user
    from app.main import app
    from app.models import User

    fake_user = MagicMock(spec=User)
    fake_user.id = str(uuid.uuid4())
    fake_user.email = "bulk-test@example.com"

    async def _override():
        return fake_user

    app.dependency_overrides[get_current_user] = _override
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_bulk_mark_read_sets_read_true():
    """POST /api/transactions/bulk action=mark_read sets read=True on all matched txns."""
    import uuid

    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Transaction

    txns = []
    for i in range(3):
        t = MagicMock(spec=Transaction)
        t.id = f"tx-{i}"
        t.read = False
        t.flagged = False
        t.email_id = str(uuid.uuid4())
        txns.append(t)

    async def override_get_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = txns
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"ids": ["tx-0", "tx-1", "tx-2"], "action": "mark_read"},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == 3
        for t in txns:
            assert t.read is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bulk_flag_sets_flagged_true():
    import uuid

    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Transaction

    t = MagicMock(spec=Transaction)
    t.id = "tx-1"
    t.read = False
    t.flagged = False
    t.email_id = str(uuid.uuid4())

    async def override_get_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [t]
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"ids": ["tx-1"], "action": "flag"},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == 1
        assert t.flagged is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bulk_delete_nulls_email_id_and_removes_email():
    """delete action: Email row deleted, Transaction.email_id set to None."""
    import uuid

    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Email, Transaction

    email_id = str(uuid.uuid4())
    t = MagicMock(spec=Transaction)
    t.id = "tx-1"
    t.email_id = email_id
    e = MagicMock(spec=Email)
    e.id = email_id

    execute_call_count = 0
    db_mock = None

    async def override_get_db():
        nonlocal execute_call_count, db_mock
        db = AsyncMock()
        db_mock = db

        def execute_side(q):
            nonlocal execute_call_count
            execute_call_count += 1
            result = MagicMock()
            if execute_call_count == 1:
                result.scalars.return_value.all.return_value = [t]
            else:
                result.scalar_one_or_none.return_value = e
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"ids": ["tx-1"], "action": "delete"},
            )
        assert r.status_code == 200
        assert t.email_id is None
        db_mock.delete.assert_called_once_with(e)
    finally:
        app.dependency_overrides.pop(get_db, None)
