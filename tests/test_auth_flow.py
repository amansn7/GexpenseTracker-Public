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
