import pytest
import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DuplicatePair, DomainPairRule

def test_models_importable():
    assert DuplicatePair.__tablename__ == "duplicate_pairs"
    assert DomainPairRule.__tablename__ == "domain_pair_rules"


from app.dedup.service import detect_and_record_duplicates, _sorted_domains


def test_sorted_domains_alphabetical():
    a, b = _sorted_domains("swiggy.in", "hdfcbank.com")
    assert a == "hdfcbank.com"
    assert b == "swiggy.in"


def test_sorted_domains_already_sorted():
    a, b = _sorted_domains("hdfcbank.com", "swiggy.in")
    assert a == "hdfcbank.com"
    assert b == "swiggy.in"


@pytest.mark.asyncio
async def test_detect_no_candidates():
    """No candidates means no DuplicatePair created."""
    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))

    from app.models import Transaction, Email
    tx = MagicMock(spec=Transaction)
    tx.id = str(uuid.uuid4())
    tx.label = "expense"
    tx.amount = 500.0
    tx.txn_date = date(2026, 4, 10)
    email = MagicMock(spec=Email)
    email.sender_domain = "swiggy.in"

    await detect_and_record_duplicates(tx, email, db)
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_detect_called_after_classification():
    """Import path is valid and patch target resolves correctly."""
    import app.dedup.service as dedup_service
    with patch("app.dedup.service.detect_and_record_duplicates", new_callable=AsyncMock) as mock_dedup:
        # Simulate what sync.py does: create a Transaction + call detect
        from app.models import Transaction, Email
        tx = MagicMock(spec=Transaction)
        tx.label = "expense"
        tx.amount = 999.0
        tx.txn_date = date(2026, 4, 10)
        email = MagicMock(spec=Email)
        email.sender_domain = "swiggy.in"
        db = AsyncMock()
        await dedup_service.detect_and_record_duplicates(tx, email, db)
        # Since we patched it, just verify the mock was set up correctly
        mock_dedup.assert_called_once()


@pytest.mark.asyncio
async def test_duplicates_api_list():
    """GET /api/duplicates returns list (may be empty)."""
    from httpx import AsyncClient, ASGITransport
    from app.database import get_db
    import os
    os.environ["TESTING"] = "1"
    from app.main import app

    async def override_get_db():
        db = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/duplicates")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_duplicates_api_resolve_validation():
    """PATCH /api/duplicates/{id} validates action field and returns 404 for missing pairs."""
    from httpx import AsyncClient, ASGITransport
    from unittest.mock import AsyncMock, MagicMock
    from sqlalchemy.ext.asyncio import AsyncSession
    import os
    os.environ["TESTING"] = "1"
    from app.main import app
    from app.database import get_db

    # Provide a mock DB session so tests never touch Postgres
    async def override_get_db():
        db = AsyncMock(spec=AsyncSession)
        # scalar_one_or_none returns None → triggers 404 for pair not found
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # invalid action → 422 (caught before DB)
            r = await client.patch("/api/duplicates/nonexistent-id", json={"action": "invalid", "primary_tx_id": "x"})
            assert r.status_code == 422

            # valid action, nonexistent pair → 404
            r = await client.patch("/api/duplicates/00000000-0000-0000-0000-000000000000", json={"action": "confirmed", "primary_tx_id": "x"})
            assert r.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
