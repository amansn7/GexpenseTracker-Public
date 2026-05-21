import os
import secrets
from datetime import UTC, datetime, timedelta

import pyotp
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.auth_deps import TOTP_COOKIE_NAME
from app.database import get_db
from app.main import app
from app.models import Session, User, UserRole, UserSettings, UserStatus

os.environ.setdefault("COOKIE_SECURE", "false")


async def _create_authed_client(db_session, user, cookies=None):
    """Helper to create an AsyncClient with a valid session cookie."""
    token = secrets.token_bytes(32)
    sess = Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=30),
    )
    db_session.add(sess)
    await db_session.commit()
    cookie_dict = {"session": token.hex()}
    if cookies:
        cookie_dict.update(cookies)
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        cookies=cookie_dict,
    ), token.hex()


@pytest_asyncio.fixture
async def db_override(db_session):
    async def _override():
        yield db_session
    app.dependency_overrides[get_db] = _override
    yield db_session
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_user_without_totp_normal_auth(db_override):
    """User without totp_enabled → normal auth flow, no 2FA prompt."""
    db_session = db_override
    user = User(email="no2fa@example.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    async with (await _create_authed_client(db_session, user))[0] as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == "no2fa@example.com"


@pytest.mark.asyncio
async def test_user_with_totp_no_cookie_returns_2fa_required(db_override):
    """User with totp_enabled, no totp_verified cookie → 401 with totp_pending=True."""
    db_session = db_override
    user = User(
        email="totp@example.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
        totp_enabled=True,
        totp_secret=pyotp.random_base32(),
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    async with (await _create_authed_client(db_session, user))[0] as client:
        resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
    data = resp.json()
    assert data["detail"]["detail"] == "2fa_required"
    assert data["detail"]["totp_pending"] is True


@pytest.mark.asyncio
async def test_valid_totp_code_sets_cookie(db_override):
    """Valid TOTP code → sets totp_verified cookie, subsequent requests succeed."""
    db_session = db_override
    secret = pyotp.random_base32()
    user = User(
        email="verify2fa@example.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    client, session_hex = await _create_authed_client(db_session, user)
    async with client:
        code = pyotp.TOTP(secret).now()
        resp = await client.post("/api/auth/verify-2fa", json={"code": code})
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        assert "set-cookie" in resp.headers
        cookie_header = resp.headers["set-cookie"]
        assert "totp_verified=" in cookie_header
        assert "httponly" in cookie_header.lower()
        assert "samesite=lax" in cookie_header.lower()

        totp_value = cookie_header.split("totp_verified=")[1].split(";")[0]
        client.cookies.set(TOTP_COOKIE_NAME, totp_value)

        resp_me = await client.get("/api/auth/me")
        assert resp_me.status_code == 200
        assert resp_me.json()["email"] == "verify2fa@example.com"


@pytest.mark.asyncio
async def test_invalid_totp_code_returns_401(db_override):
    """Invalid TOTP code → 401."""
    db_session = db_override
    secret = pyotp.random_base32()
    user = User(
        email="invalid2fa@example.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    async with (await _create_authed_client(db_session, user))[0] as client:
        resp = await client.post("/api/auth/verify-2fa", json={"code": "000000"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid TOTP code"


@pytest.mark.asyncio
async def test_totp_verified_cookie_allows_auth(db_override):
    """totp_verified cookie present → auth succeeds even with totp_enabled."""
    db_session = db_override
    secret = pyotp.random_base32()
    user = User(
        email="cookie2fa@example.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
        totp_enabled=True,
        totp_secret=secret,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    await db_session.commit()
    await db_session.refresh(user)

    client, session_hex = await _create_authed_client(db_session, user)
    async with client:
        code = pyotp.TOTP(secret).now()
        resp = await client.post("/api/auth/verify-2fa", json={"code": code})
        assert resp.status_code == 200

        totp_value = resp.headers["set-cookie"].split("totp_verified=")[1].split(";")[0]
        client.cookies.set(TOTP_COOKIE_NAME, totp_value)

        resp_me = await client.get("/api/auth/me")
        assert resp_me.status_code == 200
        assert resp_me.json()["email"] == "cookie2fa@example.com"
