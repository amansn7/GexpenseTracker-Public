import asyncio
import json
import logging
import os
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import TOTP_COOKIE_NAME, _sign_totp_token, get_current_user, is_owner
from app.config import settings
from app.crypto import decrypt_secret, encrypt_secret
from app.csrf import generate_csrf_token
from app.database import get_db
from app.gmail.auth import get_google_userinfo, get_oauth_flow
from app.jwt_utils import TokenType, create_token_pair, decode_token
from app.models import (
    ConnectedAccount,
    DeviceToken,
    Email,
    OAuthState,
    RefreshTokenBlacklist,
    Session,
    User,
    UserAIService,
    UserProfile,
    UserRole,
    UserSettings,
    UserStatus,
)

router = APIRouter()


class _RefreshBody(BaseModel):
    refresh_token: str


class _DeviceTokenBody(BaseModel):
    token: str
    platform: Literal["ios", "android"]


class _DeleteDeviceTokenBody(BaseModel):
    token: str


class _LogoutBearerBody(BaseModel):
    refresh_token: str | None = None


def require_dev(request: Request):
    """Hardened DEV_MODE gate — only allows localhost requests in dev mode."""
    if not settings.DEV_MODE:
        raise HTTPException(status_code=404, detail="Not found")
    client_host = request.client.host if request.client else ""
    if client_host not in ("127.0.0.1", "localhost", "::1"):
        logging.getLogger(__name__).warning("require_dev blocked non-local request from %s", client_host)
        raise HTTPException(status_code=403, detail="DEV endpoints only accessible from localhost")


SESSION_DAYS = 30
OAUTH_STATE_MINUTES = 10
COOKIE_NAME = "session"


def _set_session_cookie(response: Response, token: bytes) -> None:
    secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
    response.set_cookie(
        COOKIE_NAME,
        value=token.hex(),
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


async def _get_or_create_user(
    db: AsyncSession,
    email: str,
    name: str,
    picture: str | None,
) -> User:
    existing_count = (await db.scalar(select(func.count(User.id)).where(User.email != "service@localhost"))) or 0

    if existing_count == 0:
        role = UserRole.owner
    else:
        owner = (
            await db.execute(select(User).where(User.role == UserRole.owner, User.email != "service@localhost"))
        ).scalar_one_or_none()
        if owner is None:
            # No real owner yet — first real user becomes owner
            role = UserRole.owner
        else:
            raw = (
                await db.execute(select(UserSettings.allowed_emails).where(UserSettings.user_id == owner.id))
            ).scalar_one_or_none()
            allowed = json.loads(raw) if raw else []
            if email not in allowed:
                raise HTTPException(status_code=403, detail="access_denied")
            role = UserRole.member

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if user is None:
        user = User(email=email, role=role, status=UserStatus.active, onboarding_complete=True)
        db.add(user)
        await db.flush()
        db.add(
            UserProfile(
                user_id=user.id,
                full_name=name or email,
                avatar_url=picture,
            )
        )
        db.add(
            UserSettings(
                user_id=user.id,
                allowed_emails=json.dumps([email]) if role == UserRole.owner else None,
            )
        )
        db.add(
            ConnectedAccount(
                user_id=user.id,
                provider="gmail",
                account_email=email,
                status="connected",
            )
        )
    else:
        profile_row = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one_or_none()
        if profile_row and picture:
            profile_row.avatar_url = picture

    await db.commit()
    await db.refresh(user)
    return user


async def _create_session(db: AsyncSession, user: User) -> bytes:
    token = secrets.token_bytes(32)
    db.add(
        Session(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(UTC) + timedelta(days=SESSION_DAYS),
        )
    )
    await db.commit()
    return token


@router.get("/auth/csrf-token")
async def get_csrf_token(response: Response):
    """Generate and return a CSRF token via double-submit cookie pattern."""
    token = generate_csrf_token()
    secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
    response.set_cookie(
        "csrf_token",
        value=token,
        httponly=False,
        secure=secure,
        samesite="strict",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )
    return {"csrf_token": token}


@router.get("/auth/google")
async def start_google_auth(db: AsyncSession = Depends(get_db)):
    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    # Purge expired states, then persist new one
    await db.execute(sa_delete(OAuthState).where(OAuthState.expires_at < datetime.now(UTC)))
    db.add(
        OAuthState(
            state=state,
            expires_at=datetime.now(UTC) + timedelta(minutes=OAUTH_STATE_MINUTES),
        )
    )
    await db.commit()
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
async def google_callback(
    code: str,
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    state_row = (await db.execute(select(OAuthState).where(OAuthState.state == state))).scalar_one_or_none()
    if not state_row or state_row.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(status_code=400, detail="No pending auth flow")
    await db.delete(state_row)
    await db.commit()

    flow = get_oauth_flow()
    await asyncio.to_thread(flow.fetch_token, code=code)
    creds = flow.credentials

    userinfo = await asyncio.to_thread(get_google_userinfo, creds)
    email = userinfo.get("email", "").lower().strip()
    name = userinfo.get("name", email)
    picture = userinfo.get("picture")

    user = await _get_or_create_user(db, email, name, picture)

    account = (
        await db.execute(
            select(ConnectedAccount).where(
                ConnectedAccount.user_id == user.id,
                ConnectedAccount.provider == "gmail",
            )
        )
    ).scalar_one_or_none()
    if account is None:
        account = ConnectedAccount(
            user_id=user.id,
            provider="gmail",
            account_email=email,
            status="connected",
        )
        db.add(account)
    account.access_token = encrypt_secret(creds.token)
    if creds.refresh_token:
        account.refresh_token = encrypt_secret(creds.refresh_token)
    account.token_expiry = creds.expiry
    account.status = "connected"
    await db.commit()
    token = await _create_session(db, user)

    # Mobile clients send Accept: application/json — return JWT pair directly.
    # Browsers follow the redirect as before.
    accept = request.headers.get("Accept", "")
    if "application/json" in accept:
        return JSONResponse(_jwt_response_for_user(user))

    response = RedirectResponse("/", status_code=302)
    _set_session_cookie(response, token)
    return response


@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # ── Bearer path: blacklist provided refresh token ──────────────────────
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            body = await request.json()
        except Exception:
            body = {}
        refresh_raw = body.get("refresh_token") if isinstance(body, dict) else None
        if refresh_raw:
            try:
                payload = decode_token(refresh_raw, expected_type=TokenType.REFRESH)
                jti = payload.get("jti")
                if jti:
                    existing = (
                        await db.execute(select(RefreshTokenBlacklist).where(RefreshTokenBlacklist.jti == jti))
                    ).scalar_one_or_none()
                    if not existing:
                        db.add(RefreshTokenBlacklist(user_id=user.id, jti=jti))
                        await db.commit()
            except ValueError:
                pass  # Invalid refresh token — still OK to return 200
        return {"ok": True}

    # ── Cookie path: delete session row (unchanged) ────────────────────────
    raw_cookie = request.cookies.get(COOKIE_NAME)
    if raw_cookie:
        try:
            token_bytes = bytes.fromhex(raw_cookie)
            await db.execute(sa_delete(Session).where(Session.token == token_bytes))
            await db.commit()
        except Exception:
            pass
    _clear_session_cookie(response)
    response.delete_cookie("totp_verified", path="/")
    return {"ok": True}


@router.get("/auth/me")
async def auth_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(select(User).where(User.email == "service@localhost"))).scalar_one_or_none()
    has_seed_data = False
    if seed_row:
        try:
            seed_count = (await db.scalar(select(func.count(Email.id)).where(Email.user_id == seed_row.id))) or 0
            has_seed_data = seed_count > 0
        except Exception:
            pass

    # Eagerly fetch profile to avoid lazy-load in async context
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one_or_none()

    services = (await db.execute(select(UserAIService).where(UserAIService.user_id == user.id))).scalars().all()

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "name": profile.full_name if profile else user.email,
        "avatar_url": profile.avatar_url if profile else None,
        "has_seed_data": has_seed_data,
        "onboarding_complete": user.onboarding_complete,
        "ai_services": [
            {
                "id": s.id,
                "provider": s.provider,
                "display_name": s.display_name,
                "model_id": s.model_id,
                "base_url": s.base_url,
                "api_key_hint": s.api_key_hint,
                "enabled": s.enabled,
            }
            for s in services
        ],
    }


@router.post("/auth/claim-seed-data")
async def claim_seed_data(
    _: None = Depends(require_dev),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(select(User).where(User.email == "service@localhost"))).scalar_one_or_none()
    if not seed_row:
        return {"transferred": 0}
    result = await db.execute(update(Email).where(Email.user_id == seed_row.id).values(user_id=user.id))
    await db.commit()
    return {"transferred": result.rowcount}


@router.get("/auth/status")
async def auth_status():
    return {"authenticated": True}


@router.get("/auth/allowlist")
async def get_allowlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    raw = (
        await db.execute(select(UserSettings.allowed_emails).where(UserSettings.user_id == user.id))
    ).scalar_one_or_none()
    return {"allowed_emails": json.loads(raw) if raw else [user.email]}


@router.post("/auth/allowlist")
async def add_to_allowlist(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    email_to_add = (body.get("email") or "").strip().lower()
    if not email_to_add or "@" not in email_to_add:
        raise HTTPException(status_code=422, detail="Valid email required")
    settings_row = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
    current = json.loads(settings_row.allowed_emails) if settings_row.allowed_emails else [user.email]
    if email_to_add not in current:
        current.append(email_to_add)
    settings_row.allowed_emails = json.dumps(current)
    await db.commit()
    return {"allowed_emails": current}


@router.delete("/auth/allowlist/{email}")
async def remove_from_allowlist(
    email: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    if email.lower() == user.email.lower():
        raise HTTPException(status_code=400, detail="Cannot remove owner email")
    settings_row = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
    current = json.loads(settings_row.allowed_emails) if settings_row.allowed_emails else [user.email]
    current = [e for e in current if e.lower() != email.lower()]
    settings_row.allowed_emails = json.dumps(current)
    await db.commit()
    return {"allowed_emails": current}


@router.post("/auth/verify-2fa")
async def verify_2fa(
    body: dict,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    session_hex = request.cookies.get(COOKIE_NAME)
    if not session_hex:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        token_bytes = bytes.fromhex(session_hex)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid session")

    row = (await db.execute(select(Session).where(Session.token == token_bytes))).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=401, detail="Session not found")

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        await db.execute(sa_delete(Session).where(Session.id == row.id))
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    user = (await db.execute(select(User).where(User.id == row.user_id))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA not enabled")

    code = body.get("code", "")
    if not code:
        raise HTTPException(status_code=422, detail="Code required")

    try:
        valid = pyotp.TOTP(decrypt_secret(user.totp_secret)).verify(code)
    except Exception:
        valid = False

    if not valid:
        raise HTTPException(status_code=401, detail="Invalid TOTP code")

    secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
    totp_token = _sign_totp_token(session_hex)
    response.set_cookie(
        TOTP_COOKIE_NAME,
        value=totp_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=86400,
        path="/",
    )
    return {"ok": True}


# ── Dual-issue helper ─────────────────────────────────────────────────────


def _jwt_response_for_user(user: User) -> dict:
    """Build the JSON payload returned to mobile clients after OAuth."""
    pair = create_token_pair(user_id=user.id, email=user.email)
    return {
        **pair,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role if isinstance(user.role, str) else user.role.value,
        },
    }


# ── POST /auth/token/refresh ──────────────────────────────────────────────


@router.post("/auth/token/refresh")
async def refresh_access_token(
    body: _RefreshBody,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a valid refresh JWT for a new access+refresh pair.

    If the token carries a `jti` claim, it is checked against the blacklist.
    """
    try:
        payload = decode_token(body.refresh_token, expected_type=TokenType.REFRESH)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    jti = payload.get("jti")
    if jti:
        blacklisted = (
            await db.execute(select(RefreshTokenBlacklist).where(RefreshTokenBlacklist.jti == jti))
        ).scalar_one_or_none()
        if blacklisted:
            raise HTTPException(status_code=401, detail="Token has been revoked")

    user_id = payload.get("sub")
    email = payload.get("email", "")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return create_token_pair(user_id=user_id, email=email)


# ── POST /auth/device-token ───────────────────────────────────────────────


@router.post("/auth/device-token")
async def register_device_token(
    body: _DeviceTokenBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register (or re-register) a mobile push-notification device token."""
    existing = (await db.execute(select(DeviceToken).where(DeviceToken.token == body.token))).scalar_one_or_none()

    if existing:
        # Update ownership if token was re-registered by this user
        existing.user_id = user.id
        existing.platform = body.platform
        await db.commit()
        return {"id": existing.id}

    dt = DeviceToken(user_id=user.id, token=body.token, platform=body.platform)
    db.add(dt)
    await db.commit()
    await db.refresh(dt)
    return {"id": dt.id}


# ── DELETE /auth/device-token ─────────────────────────────────────────────


@router.delete("/auth/device-token")
async def delete_device_token(
    body: _DeleteDeviceTokenBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a device token belonging to the current user."""
    row = (
        await db.execute(
            select(DeviceToken).where(
                DeviceToken.token == body.token,
                DeviceToken.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Device token not found")
    await db.delete(row)
    await db.commit()
    return {"deleted": True}
