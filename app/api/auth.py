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

from app.auth_deps import (
    PASSKEY_COOKIE_NAME,
    TOTP_COOKIE_NAME,
    _sign_passkey_token,
    _sign_totp_token,
    get_current_user,
    is_owner,
    require_totp_or_recent_auth,
)
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
    Invitation,
    OAuthState,
    RefreshTokenBlacklist,
    Session,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserRole,
    UserSettings,
    UserStatus,
    WebAuthnCredential,
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
    # If user already exists, just update profile and return — skip all role/invite logic
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user is not None:
        profile_row = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one_or_none()
        if profile_row and picture:
            profile_row.avatar_url = picture
        await db.commit()
        await db.refresh(user)
        return user

    # New user: determine role and check invitations for non-owner users
    existing_count = (await db.scalar(select(func.count(User.id)).where(User.email != settings.SEED_USER_EMAIL))) or 0

    if existing_count == 0:
        role = UserRole.owner
    else:
        owner = (
            await db.execute(select(User).where(User.role == UserRole.owner, User.email != settings.SEED_USER_EMAIL))
        ).scalar_one_or_none()
        if owner is None:
            role = UserRole.owner
        else:
            invite = (
                await db.execute(select(Invitation).where(Invitation.email == email, Invitation.status == "pending"))
            ).scalar_one_or_none()
            if not invite:
                raise HTTPException(status_code=403, detail="access_denied")
            invite.status = "accepted"
            role = UserRole.member

    user = User(email=email, role=role, status=UserStatus.active, onboarding_complete=False)
    if settings.ENABLE_LLM_TRIAL:
        now = datetime.now(UTC)
        user.trial_started_at = now
        user.trial_ends_at = now + timedelta(days=settings.TRIAL_DURATION_DAYS)
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
async def start_google_auth(
    redirect: str | None = None,
    db: AsyncSession = Depends(get_db),
):
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
            redirect_uri=redirect,
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

    # Mobile clients via Capacitor browser plugin: redirect to the stored
    # redirect_uri (an HTTP endpoint on the same origin) with JWT tokens as
    # query params. The Capacitor bridge captures the token from the
    # browserPageLoaded event, closes the browser, and continues in the WebView.
    if state_row.redirect_uri:
        pair = _jwt_response_for_user(user)
        sep = "&" if "?" in state_row.redirect_uri else "?"
        return RedirectResponse(
            f"{state_row.redirect_uri}{sep}access_token={pair['access_token']}&refresh_token={pair['refresh_token']}",
            status_code=302,
        )

    # Mobile clients (direct API call): return JWT pair as JSON.
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
    response.delete_cookie(PASSKEY_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/auth/me")
async def auth_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(select(User).where(User.email == settings.SEED_USER_EMAIL))).scalar_one_or_none()
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

    connected = (await db.execute(select(ConnectedAccount).where(ConnectedAccount.user_id == user.id))).scalars().all()

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "name": profile.full_name if profile else user.email,
        "avatar_url": profile.avatar_url if profile else None,
        "has_seed_data": has_seed_data,
        "onboarding_complete": user.onboarding_complete,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "connected_accounts": [
            {
                "provider": c.provider,
                "account_email": c.account_email,
                "status": c.status,
                "last_synced_at": c.last_synced_at.isoformat() if c.last_synced_at else None,
            }
            for c in connected
        ],
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
    seed_row = (await db.execute(select(User).where(User.email == settings.SEED_USER_EMAIL))).scalar_one_or_none()
    if not seed_row:
        return {"transferred": 0}
    result = await db.execute(update(Email).where(Email.user_id == seed_row.id).values(user_id=user.id))
    await db.commit()
    return {"transferred": result.rowcount}


@router.get("/auth/check-mode")
async def check_mode():
    """Return 200 if LOCAL_MODE is enabled, 404 otherwise.
    Used by the login page to conditionally show the local login button.
    """
    if not settings.LOCAL_MODE:
        raise HTTPException(status_code=404, detail="Local mode not enabled")
    return {"local_mode": True}


@router.get("/auth/status")
async def auth_status():
    return {"authenticated": True}


@router.post("/auth/local-login")
async def local_login(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Local mode login — creates a session for the default local user.

    Only available when LOCAL_MODE=true. No Google OAuth required.
    Creates the first user on first login if none exists.
    """
    if not settings.LOCAL_MODE:
        raise HTTPException(status_code=404, detail="Not found")

    email = "local@moneyflow.local"
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    if user is None:
        user = User(email=email, role=UserRole.owner, status=UserStatus.active, onboarding_complete=False)
        db.add(user)
        await db.flush()
        db.add(UserProfile(user_id=user.id, full_name="Local User"))
        db.add(UserSettings(user_id=user.id))
        db.add(
            ConnectedAccount(user_id=user.id, provider="gmail", account_email=email, status="disconnected")
        )
        from app.api._account_helpers import DEFAULT_CATEGORIES as _DEFAULT_CATEGORIES
        for idx, (name, color, kind) in enumerate(_DEFAULT_CATEGORIES):
            db.add(UserCategory(user_id=user.id, name=name, color=color, kind=kind, sort_order=idx))
        await db.commit()
        await db.refresh(user)
    elif user.scheduled_deletion_at:
        raise HTTPException(status_code=403, detail="Account scheduled for deletion")

    token = await _create_session(db, user)
    _set_session_cookie(response, token)

    accept = request.headers.get("Accept", "")
    if "application/json" in accept:
        from app.api._account_helpers import _load_user_bundle
        return JSONResponse(await _load_user_bundle(db, user))

    return RedirectResponse("/", status_code=302)


@router.get("/auth/invitations")
async def list_invitations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    invites = (
        (await db.execute(select(Invitation).where(Invitation.invited_by == user.id).order_by(Invitation.created_at.desc())))
        .scalars()
        .all()
    )
    members = (
        (await db.execute(select(User, UserProfile).join(UserProfile, UserProfile.user_id == User.id).where(User.role == UserRole.member)))
        .all()
    )
    return {
        "invitations": [
            {"id": i.id, "email": i.email, "status": i.status, "created_at": i.created_at.isoformat() if i.created_at else None}
            for i in invites
        ],
        "members": [
            {"id": m.User.id, "email": m.User.email, "name": m.UserProfile.full_name}
            for m in members
        ],
    }


@router.post("/auth/invitations")
async def create_invitation(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    email_to_add = (body.get("email") or "").strip().lower()
    if not email_to_add or "@" not in email_to_add:
        raise HTTPException(status_code=422, detail="Valid email required")
    existing = (
        await db.execute(select(Invitation).where(Invitation.email == email_to_add, Invitation.status == "pending"))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Already invited")
    invite = Invitation(email=email_to_add, invited_by=user.id, status="pending")
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return {"id": invite.id, "email": invite.email, "status": invite.status}


@router.delete("/auth/invitations/{invitation_id}")
async def revoke_invitation(
    invitation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Owner only")
    invite = (
        await db.execute(select(Invitation).where(Invitation.id == invitation_id, Invitation.status == "pending"))
    ).scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    invite.status = "revoked"
    await db.commit()
    return {"ok": True}


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


# ── Passkey (WebAuthn) endpoints ─────────────────────────────────────────


@router.post("/auth/passkey/register/begin")
async def passkey_register_begin(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate WebAuthn registration options for a new passkey."""
    from app.webauthn_utils import generate_registration_challenge

    result = generate_registration_challenge(user.id, user.email)
    return result


class PasskeyRegisterCompleteBody(BaseModel):
    credential: dict
    challenge_b64: str
    challenge_sig: str
    device_name: str


@router.post("/auth/passkey/register/complete")
async def passkey_register_complete(
    body: PasskeyRegisterCompleteBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify and store a new WebAuthn credential."""
    from app.webauthn_utils import verify_registration_credential

    cred_id, public_key, sign_count = verify_registration_credential(
        body.credential, body.challenge_b64, body.challenge_sig
    )

    existing = (
        await db.execute(select(WebAuthnCredential).where(WebAuthnCredential.credential_id == cred_id))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Credential already registered")

    db.add(WebAuthnCredential(
        user_id=user.id,
        credential_id=cred_id,
        public_key=public_key,
        sign_count=sign_count,
        device_name=body.device_name or "Passkey",
    ))

    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    user_row.passkeys_enabled = True
    await db.commit()
    return {"ok": True}


@router.post("/auth/passkey/assert/begin")
async def passkey_assert_begin(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Generate WebAuthn assertion options for passkey verification.

    Requires a valid session cookie (user is mid-login, after OAuth).
    """
    from app.webauthn_utils import generate_assertion_challenge

    user = await _resolve_user_from_session(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    result = generate_assertion_challenge()
    result["user_id"] = user.id
    result["user_email"] = user.email
    return result


class PasskeyAssertCompleteBody(BaseModel):
    credential: dict
    challenge_b64: str
    challenge_sig: str


@router.post("/auth/passkey/assert/complete")
async def passkey_assert_complete(
    body: PasskeyAssertCompleteBody,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Verify a WebAuthn assertion and set the passkey_verified cookie."""
    from app.webauthn_utils import verify_assertion_credential

    user = await _resolve_user_from_session(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    cred_id = body.credential.get("id")
    if not cred_id:
        raise HTTPException(status_code=422, detail="Credential ID required")

    stored = (
        await db.execute(
            select(WebAuthnCredential).where(
                WebAuthnCredential.credential_id == cred_id,
                WebAuthnCredential.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not stored:
        raise HTTPException(status_code=404, detail="Credential not found")

    new_sign_count = verify_assertion_credential(
        body.credential,
        body.challenge_b64,
        body.challenge_sig,
        stored.public_key,
        stored.sign_count,
    )

    stored.sign_count = new_sign_count
    await db.commit()

    session_hex = request.cookies.get("session", "")
    secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
    pk_token = _sign_passkey_token(session_hex)
    response.set_cookie(
        PASSKEY_COOKIE_NAME,
        value=pk_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=86400,
        path="/",
    )
    return {"ok": True}


@router.post("/auth/passkey/login/begin")
async def passkey_login_begin():
    """Generate WebAuthn assertion options for passkey-first login (no session required).

    Uses discoverable credentials (resident keys) so the platform authenticator
    can present available credentials without knowing the user upfront.
    """
    from app.webauthn_utils import generate_assertion_challenge

    result = generate_assertion_challenge()
    return result


@router.post("/auth/passkey/login/complete")
async def passkey_login_complete(
    body: PasskeyAssertCompleteBody,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Verify a WebAuthn assertion and create a session for passkey-first login.

    Looks up the user by credential_id (no prior session required).
    Sets both the session cookie and passkey_verified cookie.
    """
    from app.webauthn_utils import verify_assertion_credential

    cred_id = body.credential.get("id")
    if not cred_id:
        raise HTTPException(status_code=422, detail="Credential ID required")

    stored = (
        await db.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.credential_id == cred_id)
        )
    ).scalar_one_or_none()
    if not stored:
        raise HTTPException(status_code=404, detail="Credential not found")

    user = (
        await db.execute(select(User).where(User.id == stored.user_id))
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.scheduled_deletion_at:
        sched = user.scheduled_deletion_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=UTC)
        if sched <= datetime.now(UTC):
            raise HTTPException(status_code=403, detail="Account deleted")

    new_sign_count = verify_assertion_credential(
        body.credential,
        body.challenge_b64,
        body.challenge_sig,
        stored.public_key,
        stored.sign_count,
    )

    stored.sign_count = new_sign_count

    account = (
        await db.execute(
            select(ConnectedAccount).where(
                ConnectedAccount.user_id == user.id,
                ConnectedAccount.provider == "gmail",
            )
        )
    ).scalar_one_or_none()

    if account and account.status == "connected":
        token = await _create_session(db, user)
        _set_session_cookie(response, token)

        secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
        pk_token = _sign_passkey_token(token.hex())
        response.set_cookie(
            PASSKEY_COOKIE_NAME,
            value=pk_token,
            httponly=True,
            secure=secure,
            samesite="lax",
            max_age=86400,
            path="/",
        )
        return {"ok": True, "google_connected": True}
    else:
        return {"ok": True, "google_connected": False}


async def _resolve_user_from_session(request: Request, db: AsyncSession) -> User | None:
    """Resolve user from session cookie or Bearer token."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        raw_token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = decode_token(raw_token, expected_type=TokenType.ACCESS)
        except ValueError:
            return None
        uid = payload.get("sub")
        if not uid:
            return None
        return (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()

    session_hex = request.cookies.get("session")
    if not session_hex:
        return None
    try:
        token_bytes = bytes.fromhex(session_hex)
    except (ValueError, TypeError):
        return None
    row = (await db.execute(select(Session).where(Session.token == token_bytes))).scalar_one_or_none()
    if not row:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        return None
    return (await db.execute(select(User).where(User.id == row.user_id))).scalar_one_or_none()


@router.get("/auth/passkey/credentials")
async def list_passkey_credentials(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all registered passkey credentials for the current user."""
    rows = (
        await db.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id).order_by(WebAuthnCredential.created_at)
        )
    ).scalars().all()
    return {
        "credentials": [
            {
                "id": c.id,
                "device_name": c.device_name,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in rows
        ]
    }


@router.delete("/auth/passkey/credentials/{cred_id}")
async def delete_passkey_credential(
    cred_id: str,
    _: None = Depends(require_totp_or_recent_auth),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a single passkey credential."""
    row = (
        await db.execute(
            select(WebAuthnCredential).where(
                WebAuthnCredential.id == cred_id,
                WebAuthnCredential.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Credential not found")
    await db.delete(row)
    await db.flush()
    remaining = (
        await db.execute(
            select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
        )
    ).scalars().all()
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    if not remaining:
        user_row.passkeys_enabled = False
    await db.commit()
    return {"ok": True}


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
