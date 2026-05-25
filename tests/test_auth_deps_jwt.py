"""Test get_current_user with Bearer JWT auth."""

import os
import secrets
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-chars!!")

from app.database import get_db
from app.main import app
from app.models import Base, Session, User, UserRole, UserSettings, UserStatus

TEST_DB = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def user_and_db(db_session):
    u = User(email="jwt@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(u)
    await db_session.flush()
    db_session.add(UserSettings(user_id=u.id))
    await db_session.commit()
    await db_session.refresh(u)
    return u, db_session


def _db_override(db_session):
    async def override():
        yield db_session

    return override


@pytest.mark.asyncio
async def test_get_current_user_via_bearer_jwt(user_and_db):
    """Bearer access JWT → 200 on /api/auth/me."""
    from app.jwt_utils import create_access_token

    user, db = user_and_db
    app.dependency_overrides[get_db] = _db_override(db)
    try:
        token = create_access_token(user_id=user.id, email=user.email)
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {token}"},
        ) as client:
            resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == "jwt@test.com"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bearer_expired_returns_401(user_and_db):
    """Expired Bearer access JWT → 401."""
    import time

    import jwt as pyjwt

    user, db = user_and_db
    app.dependency_overrides[get_db] = _db_override(db)
    try:
        now = int(time.time())
        payload = {
            "sub": user.id,
            "email": user.email,
            "type": "access",
            "iat": now - 7200,
            "exp": now - 3600,
        }
        expired_token = pyjwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {expired_token}"},
        ) as client:
            resp = await client.get("/api/auth/me")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_bearer_refresh_token_rejected(user_and_db):
    """Sending a refresh token as Bearer → 401 (wrong type)."""
    from app.jwt_utils import create_refresh_token

    user, db = user_and_db
    app.dependency_overrides[get_db] = _db_override(db)
    try:
        refresh = create_refresh_token(user_id=user.id, email=user.email)
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {refresh}"},
        ) as client:
            resp = await client.get("/api/auth/me")
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_no_auth_returns_401():
    """No cookie, no Bearer → 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_cookie_auth_still_works(user_and_db):
    """Existing session cookie auth must continue working after JWT changes."""
    user, db = user_and_db
    app.dependency_overrides[get_db] = _db_override(db)
    try:
        token = secrets.token_bytes(32)
        db.add(
            Session(
                user_id=user.id,
                token=token,
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        )
        await db.commit()
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            cookies={"session": token.hex()},
        ) as client:
            resp = await client.get("/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == "jwt@test.com"
    finally:
        app.dependency_overrides.pop(get_db, None)
