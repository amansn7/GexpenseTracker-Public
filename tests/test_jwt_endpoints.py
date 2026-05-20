"""Integration tests for JWT auth endpoints.

Tests:
- POST /api/auth/token/refresh  — exchange refresh → new pair
- POST /api/auth/device-token   — register device token
- DELETE /api/auth/device-token — remove device token
- POST /api/auth/logout (Bearer) — blacklists refresh token
- GET  /api/auth/callback       — dual-issue: mobile client gets JSON, browser still redirects
"""
import os
import secrets
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-chars!!")

from app.database import get_db
from app.jwt_utils import create_access_token, create_refresh_token
from app.main import app
from app.models import Base, DeviceToken, RefreshTokenBlacklist, Session, User, UserRole, UserSettings, UserStatus

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
async def authed(db_session):
    """Returns (client, user, access_token, refresh_token) with Bearer auth."""
    from app.auth_deps import get_current_user

    u = User(email="mobile@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(u)
    await db_session.flush()
    db_session.add(UserSettings(user_id=u.id))
    await db_session.commit()
    await db_session.refresh(u)

    access = create_access_token(user_id=u.id, email=u.email)
    refresh = create_refresh_token(user_id=u.id, email=u.email)

    async def override_db():
        yield db_session

    async def override_user():
        return u

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {access}"},
    ) as client:
        yield client, u, access, refresh, db_session

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


# ── POST /api/auth/token/refresh ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_returns_new_token_pair(authed):
    client, user, _, refresh, db = authed
    resp = await client.post(
        "/api/auth/token/refresh",
        json={"refresh_token": refresh},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    # New tokens must be decodable
    from app.jwt_utils import TokenType, decode_token
    decode_token(data["access_token"], expected_type=TokenType.ACCESS)
    decode_token(data["refresh_token"], expected_type=TokenType.REFRESH)


@pytest.mark.asyncio
async def test_refresh_with_access_token_fails(authed):
    client, user, access, _, db = authed
    resp = await client.post(
        "/api/auth/token/refresh",
        json={"refresh_token": access},  # wrong: access token sent
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_blacklisted_token(authed):
    """A blacklisted refresh token must be rejected."""
    import time
    import jwt as pyjwt
    client, user, _, _, db = authed

    now = int(time.time())
    jti = "test-jti-blacklisted"
    payload = {
        "sub": user.id,
        "email": user.email,
        "type": "refresh",
        "iat": now,
        "exp": now + 30 * 86400,
        "jti": jti,
    }
    refresh_with_jti = pyjwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")

    # Blacklist it
    db.add(RefreshTokenBlacklist(user_id=user.id, jti=jti))
    await db.commit()

    resp = await client.post(
        "/api/auth/token/refresh",
        json={"refresh_token": refresh_with_jti},
    )
    assert resp.status_code == 401


# ── POST /api/auth/device-token ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_device_token(authed):
    client, user, _, _, db = authed
    resp = await client.post(
        "/api/auth/device-token",
        json={"token": "apns-xyz-789", "platform": "ios"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data

    # Confirm it's in DB
    row = (await db.execute(
        select(DeviceToken).where(DeviceToken.token == "apns-xyz-789")
    )).scalar_one_or_none()
    assert row is not None
    assert row.platform == "ios"
    assert row.user_id == user.id


@pytest.mark.asyncio
async def test_register_device_token_invalid_platform(authed):
    client, *_ = authed
    resp = await client.post(
        "/api/auth/device-token",
        json={"token": "some-token", "platform": "windows"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_register_device_token_upsert(authed):
    """Re-registering the same token (different user same token) is idempotent."""
    client, user, _, _, db = authed
    await client.post("/api/auth/device-token", json={"token": "shared-tok", "platform": "android"})
    # Same token again — should return existing or update, not 500
    resp = await client.post("/api/auth/device-token", json={"token": "shared-tok", "platform": "android"})
    assert resp.status_code == 200


# ── DELETE /api/auth/device-token ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_device_token(authed):
    client, user, _, _, db = authed
    # Register first
    db.add(DeviceToken(user_id=user.id, token="del-token-123", platform="ios"))
    await db.commit()

    import json as _json
    resp = await client.request(
        "DELETE",
        "/api/auth/device-token",
        content=_json.dumps({"token": "del-token-123"}),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}

    # Confirm gone
    row = (await db.execute(
        select(DeviceToken).where(DeviceToken.token == "del-token-123")
    )).scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_delete_nonexistent_device_token(authed):
    """Deleting a token that doesn't exist → 404."""
    import json as _json
    client, *_ = authed
    resp = await client.request(
        "DELETE",
        "/api/auth/device-token",
        content=_json.dumps({"token": "no-such-token"}),
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 404


# ── POST /api/auth/logout (Bearer) ────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_bearer_blacklists_refresh(authed):
    """Logout with Bearer + refresh_token body blacklists the jti."""
    import time
    import jwt as pyjwt
    client, user, _, _, db = authed

    jti = "logout-jti-abc"
    now = int(time.time())
    payload = {
        "sub": user.id,
        "email": user.email,
        "type": "refresh",
        "iat": now,
        "exp": now + 30 * 86400,
        "jti": jti,
    }
    refresh_with_jti = pyjwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")

    resp = await client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh_with_jti},
    )
    assert resp.status_code == 200

    # Confirm blacklisted
    row = (await db.execute(
        select(RefreshTokenBlacklist).where(RefreshTokenBlacklist.jti == jti)
    )).scalar_one_or_none()
    assert row is not None
