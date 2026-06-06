import uuid
from datetime import UTC, date, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth_deps import get_current_user
from app.database import get_db
from app.main import app


@pytest.mark.asyncio
async def test_resolve_duplicate_confirmed_enqueues_recompute(db_session, mock_user, monkeypatch):
    """resolve_duplicate(confirmed) must call enqueue_recompute for the discard_tx's month."""
    from app.dedup.service import resolve_duplicate
    from app.models import DuplicatePair, Email, Transaction

    uid = str(mock_user.id)
    recompute_calls = []

    async def _fake_enqueue(user_id, months):
        recompute_calls.append((user_id, months))

    monkeypatch.setattr("app.dedup.service.enqueue_recompute", _fake_enqueue)

    email = Email(
        id=str(uuid.uuid4()),
        gmail_id="rd-g1",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 5, 15, 10, 0, tzinfo=UTC),
    )
    dup_email = Email(
        id=str(uuid.uuid4()),
        gmail_id="rd-g2",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 5, 16, 10, 0, tzinfo=UTC),
    )
    primary_tx = Transaction(
        id=str(uuid.uuid4()),
        email_id=email.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 5, 15),
        status="auto",
    )
    dup_tx = Transaction(
        id=str(uuid.uuid4()),
        email_id=dup_email.id,
        label="ignore",
        amount=500.0,
        txn_date=date(2026, 5, 16),
        status="auto",
    )
    pair = DuplicatePair(
        id=str(uuid.uuid4()),
        primary_tx_id=primary_tx.id,
        duplicate_tx_id=dup_tx.id,
        status="auto_resolved",
        confidence=1.0,
        rule_source="same_domain_exact",
    )
    db_session.add_all([email, dup_email, primary_tx, dup_tx, pair])
    await db_session.commit()

    await resolve_duplicate(pair, "confirmed", db_session,
                            primary_email=email, discard_tx_id=dup_tx.id)
    await db_session.commit()

    assert len(recompute_calls) == 1
    assert recompute_calls[0][0] == uid
    assert (2026, 5) in recompute_calls[0][1]


@pytest.mark.asyncio
async def test_batch_action_enqueues_recompute(db_session, mock_user, monkeypatch):
    """POST /api/review/batch must call enqueue_recompute for affected months."""
    from app.models import Email, Transaction, TransactionStatus

    uid = str(mock_user.id)
    recompute_calls = []

    async def _fake_enqueue(user_id, months):
        recompute_calls.append((user_id, months))

    monkeypatch.setattr("app.api.review.enqueue_recompute", _fake_enqueue)

    for i in range(2):
        txn_date = date(2026, 5, 10 + i)
        email = Email(
            id=str(uuid.uuid4()),
            gmail_id=f"br-g{i}",
            sender="noreply@bank.com",
            sender_domain="bank.com",
            user_id=uid,
            received_at=datetime(2026, 5, 10 + i, 10, 0, tzinfo=UTC),
            body_snippet=f"Rs {i+1}00",
        )
        tx = Transaction(
            id=str(uuid.uuid4()),
            email_id=email.id,
            label="expense",
            amount=float((i + 1) * 100),
            txn_date=txn_date,
            status=TransactionStatus.needs_review.value,
        )
        db_session.add_all([email, tx])
    await db_session.commit()

    async def override_get_db():
        yield db_session

    async def override_get_current_user():
        return mock_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/review/batch",
                json={"action": "expense_domain", "domain": "bank.com"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] == 2
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert len(recompute_calls) == 1
    assert recompute_calls[0][0] == uid
    assert (2026, 5) in recompute_calls[0][1]


@pytest.mark.asyncio
async def test_resolve_duplicate_dismissed_does_not_enqueue_recompute(db_session, mock_user, monkeypatch):
    """Dismissed duplicate resolution must NOT call enqueue_recompute (no data changed)."""
    from app.dedup.service import resolve_duplicate
    from app.models import DuplicatePair, Email, Transaction

    uid = str(mock_user.id)
    recompute_calls = []

    async def _fake_enqueue(user_id, months):
        recompute_calls.append((user_id, months))

    monkeypatch.setattr("app.dedup.service.enqueue_recompute", _fake_enqueue)

    email1 = Email(
        id=str(uuid.uuid4()),
        gmail_id="rdd-g1",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 5, 15, 10, 0, tzinfo=UTC),
    )
    email2 = Email(
        id=str(uuid.uuid4()),
        gmail_id="rdd-g2",
        sender="bills@swiggy.in",
        sender_domain="swiggy.in",
        user_id=uid,
        received_at=datetime(2026, 5, 15, 11, 0, tzinfo=UTC),
    )
    tx = Transaction(
        id=str(uuid.uuid4()),
        email_id=email1.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 5, 15),
        status="auto",
    )
    dup_tx = Transaction(
        id=str(uuid.uuid4()),
        email_id=email2.id,
        label="expense",
        amount=500.0,
        txn_date=date(2026, 5, 15),
        status="auto",
    )
    pair = DuplicatePair(
        id=str(uuid.uuid4()),
        primary_tx_id=tx.id,
        duplicate_tx_id=dup_tx.id,
        status="pending",
        confidence=0.65,
        rule_source="amount_date",
    )
    db_session.add_all([email1, email2, tx, dup_tx, pair])
    await db_session.commit()

    await resolve_duplicate(pair, "dismissed", db_session, primary_email=email1)
    await db_session.commit()

    assert len(recompute_calls) == 0
