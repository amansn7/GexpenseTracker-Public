from unittest.mock import AsyncMock, MagicMock

import pytest


@pytest.fixture(autouse=True)
def set_testing(monkeypatch):
    monkeypatch.setenv("TESTING", "1")


@pytest.fixture(autouse=True)
def override_auth():
    """Override get_current_user for all bulk action cap tests."""
    import uuid

    from app.auth_deps import get_current_user
    from app.main import app
    from app.models import User

    fake_user = MagicMock(spec=User)
    fake_user.id = str(uuid.uuid4())
    fake_user.email = "bulk-cap-test@example.com"

    async def _override():
        return fake_user

    app.dependency_overrides[get_current_user] = _override
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_select_all_over_limit_returns_422():
    """select_all on user with 10K transactions returns 422 with helpful message."""
    from httpx import ASGITransport, AsyncClient

    from app.api.transactions import BULK_SELECT_ALL_MAX
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        db = AsyncMock()

        def execute_side(q):
            result = MagicMock()
            # First call is count query — return 10000
            result.scalar_one.return_value = 10000
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"action": "mark_read", "select_all": True},
            )
        assert r.status_code == 422
        body = r.json()
        assert "Too many transactions" in body["detail"]
        assert "10000" in body["detail"]
        assert str(BULK_SELECT_ALL_MAX) in body["detail"]
        assert "date range filter" in body["detail"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_select_all_processes_in_batches_returns_correct_count():
    """select_all on user with 3K transactions processes in batches, returns correct count."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Transaction

    total_transactions = 3000
    batch_size = 500
    expected_batches = total_transactions // batch_size  # 6

    # Create mock transactions
    all_txns = []
    for i in range(total_transactions):
        t = MagicMock(spec=Transaction)
        t.id = f"tx-{i}"
        t.read = False
        t.flagged = False
        t.email_id = f"email-{i}"
        all_txns.append(t)

    call_count = 0

    async def override_get_db():
        nonlocal call_count
        db = AsyncMock()

        def execute_side(q):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            if call_count == 1:
                # Count query
                result.scalar_one.return_value = total_transactions
            else:
                # Data queries — return batches of 500
                batch_index = call_count - 2
                start = batch_index * batch_size
                end = min(start + batch_size, total_transactions)
                result.scalars.return_value.all.return_value = all_txns[start:end]
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"action": "mark_read", "select_all": True},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == total_transactions
        # Verify all transactions were marked read
        for t in all_txns:
            assert t.read is True
        # Verify batching: 1 count + 6 data queries + 1 empty query to break loop
        assert call_count == 1 + expected_batches + 1
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_select_all_mark_read_marks_all_rows():
    """select_all with mark_read action marks all rows as read."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Transaction

    num_txns = 800
    batch_size = 500
    txns = []
    for i in range(num_txns):
        t = MagicMock(spec=Transaction)
        t.id = f"tx-{i}"
        t.read = False
        t.flagged = False
        t.email_id = f"email-{i}"
        txns.append(t)

    call_count = 0

    async def override_get_db():
        nonlocal call_count
        db = AsyncMock()

        def execute_side(q):
            nonlocal call_count
            call_count += 1
            result = MagicMock()
            if call_count == 1:
                result.scalar_one.return_value = num_txns
            else:
                batch_index = call_count - 2
                start = batch_index * batch_size
                end = min(start + batch_size, num_txns)
                result.scalars.return_value.all.return_value = txns[start:end]
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"action": "mark_read", "select_all": True},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == num_txns
        for t in txns:
            assert t.read is True
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_select_all_delete_deletes_all_rows():
    """select_all with delete action deletes all emails and nulls email_id."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Email, Transaction

    num_txns = 3
    email_ids = [f"email-{i}" for i in range(num_txns)]
    emails = [MagicMock(spec=Email, id=eid) for eid in email_ids]

    txns = []
    for i in range(num_txns):
        t = MagicMock(spec=Transaction)
        t.id = f"tx-{i}"
        t.email_id = email_ids[i]
        txns.append(t)

    call_count = 0
    email_lookup_idx = 0
    db_mock = None

    async def override_get_db():
        nonlocal call_count, email_lookup_idx, db_mock
        db = AsyncMock()
        db_mock = db

        def execute_side(q):
            nonlocal call_count, email_lookup_idx
            call_count += 1
            result = MagicMock()
            if call_count == 1:
                result.scalar_one.return_value = num_txns
            elif call_count == 2:
                result.scalars.return_value.all.return_value = txns
            else:
                # Email lookups for delete AND empty batch query
                if email_lookup_idx < num_txns:
                    result.scalar_one_or_none.return_value = emails[email_lookup_idx]
                    email_lookup_idx += 1
                # For the empty batch query (call 6), scalars().all() returns []
                result.scalars.return_value.all.return_value = []
            return result

        db.execute = AsyncMock(side_effect=execute_side)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/transactions/bulk",
                json={"action": "delete", "select_all": True},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == num_txns
        for t in txns:
            assert t.email_id is None
        assert db_mock.delete.call_count == num_txns
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_non_select_all_with_explicit_ids_unaffected():
    """non-select_all (explicit IDs) works as before, unaffected by the cap."""
    from httpx import ASGITransport, AsyncClient

    from app.database import get_db
    from app.main import app
    from app.models import Transaction

    txns = []
    for i in range(5):
        t = MagicMock(spec=Transaction)
        t.id = f"tx-{i}"
        t.read = False
        t.flagged = False
        t.email_id = f"email-{i}"
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
                json={"ids": ["tx-0", "tx-1", "tx-2", "tx-3", "tx-4"], "action": "flag", "select_all": False},
            )
        assert r.status_code == 200
        assert r.json()["updated"] == 5
        for t in txns:
            assert t.flagged is True
    finally:
        app.dependency_overrides.pop(get_db, None)
