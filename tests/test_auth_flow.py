import pytest
import pytest_asyncio
from datetime import datetime, UTC, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db
from app.models import User, Session, UserSettings, UserStatus, UserRole
import secrets


@pytest_asyncio.fixture
async def authed_client(db_session):
    """HTTP client with a valid session cookie pre-set."""
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db

    # create user
    user = User(email="test@example.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    # create session
    token = secrets.token_bytes(32)
    sess = Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    db_session.add(sess)
    await db_session.commit()

    token_hex = token.hex()
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        cookies={"session": token_hex},
    ) as client:
        yield client, user

    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_me_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(authed_client):
    client, user = authed_client
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert "role" in data
    assert "has_seed_data" in data


@pytest.mark.asyncio
async def test_transactions_returns_401_without_session(db_session):
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/transactions")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_transactions_scoped_to_user(db_session):
    """User B sees only their own transactions, not user A's."""
    from app.models import Email as EmailModel, Transaction as TxnModel, Label, TransactionStatus
    import uuid
    from datetime import date as date_type

    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db

    # Create user A (owner) and user B (member)
    user_a = User(email="a@scope.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    user_b = User(email="b@scope.com", role=UserRole.member, status=UserStatus.active, onboarding_complete=True)
    db_session.add_all([user_a, user_b])
    await db_session.flush()
    db_session.add_all([UserSettings(user_id=user_a.id), UserSettings(user_id=user_b.id)])
    await db_session.flush()

    # Email owned by user A with a transaction
    email_a = EmailModel(
        id=str(uuid.uuid4()),
        gmail_id="gid_scope_a",
        subject="For A",
        body_text="",
        user_id=user_a.id,
    )
    db_session.add(email_a)
    await db_session.flush()
    txn = TxnModel(
        id=str(uuid.uuid4()),
        email_id=email_a.id,
        label=Label.expense,
        amount=500.0,
        status=TransactionStatus.auto,
        txn_date=date_type.today(),
    )
    db_session.add(txn)
    await db_session.commit()

    # Session for user B
    token_b = secrets.token_bytes(32)
    db_session.add(Session(
        user_id=user_b.id,
        token=token_b,
        expires_at=datetime.now(UTC) + timedelta(days=1),
    ))
    await db_session.commit()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            cookies={"session": token_b.hex()},
        ) as client:
            resp = await client.get("/api/transactions")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0  # user B sees nothing
    finally:
        app.dependency_overrides.pop(get_db, None)
