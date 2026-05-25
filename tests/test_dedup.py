import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DomainPairRule, DuplicatePair


def test_models_importable():
    assert DuplicatePair.__tablename__ == "duplicate_pairs"
    assert DomainPairRule.__tablename__ == "domain_pair_rules"


from app.dedup.service import _sorted_domains, detect_and_record_duplicates


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

    from app.models import Email, Transaction

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
async def test_duplicates_api_list():
    """GET /api/duplicates returns list (may be empty)."""
    import os

    from httpx import ASGITransport, AsyncClient

    from app.database import get_db

    os.environ["TESTING"] = "1"
    from app.main import app

    async def override_get_db():
        db = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=mock_result)
        yield db

    from unittest.mock import MagicMock as _MagicMock

    from app.auth_deps import get_current_user

    _user = _MagicMock()
    _user.id = "test-user-id"
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: _user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/duplicates")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_duplicates_api_resolve_validation():
    """PATCH /api/duplicates/{id} validates action field and returns 404 for missing pairs."""
    import os
    from unittest.mock import AsyncMock, MagicMock

    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

    os.environ["TESTING"] = "1"
    from app.database import get_db
    from app.main import app

    # Provide a mock DB session so tests never touch Postgres
    async def override_get_db():
        db = AsyncMock(spec=AsyncSession)
        # scalar_one_or_none returns None → triggers 404 for pair not found
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_result.one_or_none.return_value = None
        db.execute = AsyncMock(return_value=mock_result)
        yield db

    from unittest.mock import MagicMock as _MagicMock

    from app.auth_deps import get_current_user

    _user = _MagicMock()
    _user.id = "test-user-id"
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: _user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # invalid action → 422 (caught before DB)
            r = await client.patch("/api/duplicates/nonexistent-id", json={"action": "invalid", "primary_tx_id": "x"})
            assert r.status_code == 422

            # valid action, nonexistent pair → 404
            r = await client.patch(
                "/api/duplicates/00000000-0000-0000-0000-000000000000",
                json={"action": "confirmed", "primary_tx_id": "x"},
            )
            assert r.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


# ── Real-row integration tests (in-memory aiosqlite) ─────────────────────────


@pytest.mark.asyncio
async def test_detect_same_domain_creates_auto_resolved_pair(db_session, mock_user):
    """Strategy 1: same sender_domain + same amount + within 3 days → auto_resolved pair."""
    from app.models import Email, Transaction

    uid = str(mock_user.id)
    email1 = Email(
        id=str(uuid.uuid4()),
        gmail_id="sd-g1",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 4, 10, 10, 0, tzinfo=UTC),
    )
    tx1 = Transaction(
        id=str(uuid.uuid4()),
        email_id=email1.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 4, 10),
        status="auto",
    )
    email2 = Email(
        id=str(uuid.uuid4()),
        gmail_id="sd-g2",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 4, 11, 10, 0, tzinfo=UTC),
    )
    tx2 = Transaction(
        id=str(uuid.uuid4()),
        email_id=email2.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 4, 11),
        status="auto",
    )
    db_session.add_all([email1, tx1, email2, tx2])
    await db_session.flush()

    await detect_and_record_duplicates(tx2, email2, db_session)
    await db_session.flush()

    pairs = (await db_session.execute(select(DuplicatePair))).scalars().all()
    assert len(pairs) == 1
    assert pairs[0].rule_source == "same_domain_exact"
    assert pairs[0].status == "auto_resolved"
    assert pairs[0].confidence == 1.0


@pytest.mark.asyncio
async def test_user_isolation_no_cross_user_pair(db_session, mock_user):
    """Regression for a1ea4c7: User B's expense must not match User A's expense."""
    from app.models import Email, Transaction, User, UserRole, UserStatus

    uid_a = str(mock_user.id)
    email_a = Email(
        id=str(uuid.uuid4()),
        gmail_id="iso-ga",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid_a,
        received_at=datetime(2026, 4, 10, 10, 0, tzinfo=UTC),
    )
    tx_a = Transaction(
        id=str(uuid.uuid4()),
        email_id=email_a.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 4, 10),
        status="auto",
    )

    user_b = User(email="userb@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(user_b)
    await db_session.flush()
    uid_b = str(user_b.id)

    email_b = Email(
        id=str(uuid.uuid4()),
        gmail_id="iso-gb",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid_b,
        received_at=datetime(2026, 4, 10, 10, 0, tzinfo=UTC),
    )
    tx_b = Transaction(
        id=str(uuid.uuid4()),
        email_id=email_b.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 4, 10),
        status="auto",
    )

    db_session.add_all([email_a, tx_a, email_b, tx_b])
    await db_session.flush()

    await detect_and_record_duplicates(tx_b, email_b, db_session)
    await db_session.flush()

    pairs = (await db_session.execute(select(DuplicatePair))).scalars().all()
    assert len(pairs) == 0


@pytest.mark.asyncio
async def test_detect_cross_domain_with_rule_queues_pending(db_session, mock_user):
    """Strategy 2: different sender_domains + DomainPairRule (no auto_resolve) → pending pair."""
    from app.models import Email, Transaction

    uid = str(mock_user.id)
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="hdfcbank.com",
        domain_b="swiggy.in",
        confirmed_count=1,
        dismissed_count=0,
        confidence=0.5,
        auto_resolve=False,
    )
    email1 = Email(
        id=str(uuid.uuid4()),
        gmail_id="cd-g1",
        sender="alerts@hdfcbank.com",
        sender_domain="hdfcbank.com",
        user_id=uid,
        received_at=datetime(2026, 4, 10, 9, 0, tzinfo=UTC),
    )
    tx1 = Transaction(
        id=str(uuid.uuid4()),
        email_id=email1.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 4, 10),
        status="auto",
    )
    email2 = Email(
        id=str(uuid.uuid4()),
        gmail_id="cd-g2",
        sender="noreply@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 4, 10, 12, 0, tzinfo=UTC),
    )
    tx2 = Transaction(
        id=str(uuid.uuid4()),
        email_id=email2.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 4, 10),
        status="auto",
    )
    db_session.add_all([rule, email1, tx1, email2, tx2])
    await db_session.flush()

    await detect_and_record_duplicates(tx2, email2, db_session)
    await db_session.flush()

    pairs = (await db_session.execute(select(DuplicatePair))).scalars().all()
    assert len(pairs) == 1
    assert pairs[0].rule_source == "domain_pair"
    assert pairs[0].status == "pending"
