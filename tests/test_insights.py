from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.mark.asyncio
async def test_get_insights_empty_returns_list(mock_user, db_session):
    """No transactions → insights list is empty, not an error."""
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/insights")
    assert resp.status_code == 200
    data = resp.json()
    assert "insights" in data
    assert isinstance(data["insights"], list)


@pytest.mark.asyncio
async def test_get_insights_spending_spike(mock_user, db_session):
    """A >20 % spike in the last 30 days generates a spending_spike insight."""
    from app.main import app
    from app.models import Email, Transaction, TransactionStatus

    today = date.today()
    for i in range(10):
        email = Email(
            user_id=mock_user.id,
            gmail_id=f"test-gmail-id-spike-{i}",
            subject="stmt",
            sender="bank@test.com",
            body_text="",
            received_at=datetime.now(UTC),
        )
        db_session.add(email)
        await db_session.flush()
        db_session.add(
            Transaction(
                email_id=email.id,
                label="expense",
                amount=1000.0,
                txn_date=today - timedelta(days=i),
                status=TransactionStatus.confirmed,
                currency="INR",
            )
        )
    email = Email(
        user_id=mock_user.id,
        gmail_id="test-gmail-id-spike-old",
        subject="stmt",
        sender="bank@test.com",
        body_text="",
        received_at=datetime.now(UTC),
    )
    db_session.add(email)
    await db_session.flush()
    db_session.add(
        Transaction(
            email_id=email.id,
            label="expense",
            amount=1000.0,
            txn_date=today - timedelta(days=35),
            status=TransactionStatus.confirmed,
            currency="INR",
        )
    )
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/insights")
    assert resp.status_code == 200
    insights = resp.json()["insights"]
    types = [i["type"] for i in insights]
    assert "spending_spike" in types
    spike = next(i for i in insights if i["type"] == "spending_spike")
    assert "id" in spike
    assert "title" in spike
    assert "body" in spike
    assert "generated_at" in spike


@pytest.mark.asyncio
async def test_get_insights_saving_win(mock_user, db_session):
    """A >10 % drop generates a saving_win insight."""
    from app.main import app
    from app.models import Email, Transaction, TransactionStatus

    today = date.today()
    email = Email(
        user_id=mock_user.id,
        gmail_id="test-gmail-id-saving",
        subject="stmt",
        sender="bank@test.com",
        body_text="",
        received_at=datetime.now(UTC),
    )
    db_session.add(email)
    await db_session.flush()

    db_session.add(
        Transaction(
            email_id=email.id,
            label="expense",
            amount=1000.0,
            txn_date=today - timedelta(days=5),
            status=TransactionStatus.confirmed,
            currency="INR",
        )
    )
    for i in range(10):
        email_n = Email(
            user_id=mock_user.id,
            gmail_id=f"test-gmail-id-saving-{i}",
            subject="stmt",
            sender="bank@test.com",
            body_text="",
            received_at=datetime.now(UTC),
        )
        db_session.add(email_n)
        await db_session.flush()
        db_session.add(
            Transaction(
                email_id=email_n.id,
                label="expense",
                amount=1000.0,
                txn_date=today - timedelta(days=35 + i),
                status=TransactionStatus.confirmed,
                currency="INR",
            )
        )
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/insights")
    assert resp.status_code == 200
    types = [i["type"] for i in resp.json()["insights"]]
    assert "saving_win" in types


@pytest.mark.asyncio
async def test_get_insights_unauthenticated_returns_401(db_session):
    """No auth cookie/token → 401."""
    from app.auth_deps import get_current_user
    from app.main import app

    app.dependency_overrides.pop(get_current_user, None)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/insights")
        assert resp.status_code == 401
    finally:
        pass


@pytest.mark.asyncio
async def test_get_insights_patterns_returns_list(mock_user, db_session):
    """Patterns endpoint always returns a list (may be empty with no data)."""
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/insights/patterns")
    assert resp.status_code == 200
    data = resp.json()
    assert "patterns" in data
    assert isinstance(data["patterns"], list)


@pytest.mark.asyncio
async def test_get_insights_patterns_weekend_spender(mock_user, db_session):
    """Weekend spend >1.5× weekday daily avg → weekend_spender pattern returned."""
    from app.main import app
    from app.models import Email, Transaction, TransactionStatus

    today = date.today()
    eidx = 0
    days_added = 0
    d = today
    while days_added < 20:
        if d.weekday() >= 5:
            email = Email(
                user_id=mock_user.id,
                gmail_id=f"test-gmail-id-weekend-{eidx}",
                subject="stmt",
                sender="bank@test.com",
                body_text="",
                received_at=datetime.now(UTC),
            )
            db_session.add(email)
            await db_session.flush()
            db_session.add(
                Transaction(
                    email_id=email.id,
                    label="expense",
                    amount=1000.0,
                    txn_date=d,
                    status=TransactionStatus.confirmed,
                    currency="INR",
                )
            )
            days_added += 1
            eidx += 1
        d -= timedelta(days=1)

    days_added = 0
    d = today
    while days_added < 2:
        if d.weekday() < 5:
            email = Email(
                user_id=mock_user.id,
                gmail_id=f"test-gmail-id-weekend-{eidx}",
                subject="stmt",
                sender="bank@test.com",
                body_text="",
                received_at=datetime.now(UTC),
            )
            db_session.add(email)
            await db_session.flush()
            db_session.add(
                Transaction(
                    email_id=email.id,
                    label="expense",
                    amount=10.0,
                    txn_date=d,
                    status=TransactionStatus.confirmed,
                    currency="INR",
                )
            )
            days_added += 1
            eidx += 1
        d -= timedelta(days=1)

    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/insights/patterns")
    assert resp.status_code == 200
    patterns = resp.json()["patterns"]
    ids = [p["id"] for p in patterns]
    assert "weekend_spender" in ids
    wp = next(p for p in patterns if p["id"] == "weekend_spender")
    assert "label" in wp
    assert "description" in wp
    assert "delta_pct" in wp
    assert wp["delta_pct"] > 0
