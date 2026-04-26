import asyncio
import json
import secrets
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.gmail.auth import get_oauth_flow, get_google_userinfo
from app.models import (
    ConnectedAccount, Email, Session, User, UserProfile, UserRole,
    UserSettings, UserStatus,
)

router = APIRouter()
_pending: dict = {}

SESSION_DAYS = 30
COOKIE_NAME = "session"


def _set_session_cookie(response: Response, token: bytes) -> None:
    response.set_cookie(
        COOKIE_NAME,
        value=token.hex(),
        httponly=True,
        secure=False,
        samesite="strict",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


async def _get_or_create_user(
    db: AsyncSession,
    email: str,
    name: str,
    picture: Optional[str],
) -> User:
    existing_count = (await db.scalar(select(func.count(User.id)).where(
        User.email != "service@localhost"
    ))) or 0

    if existing_count == 0:
        role = UserRole.owner
    else:
        owner = (await db.execute(
            select(User).where(User.role == UserRole.owner)
        )).scalar_one_or_none()
        allowed = []
        if owner:
            raw = (await db.execute(
                select(UserSettings.allowed_emails).where(UserSettings.user_id == owner.id)
            )).scalar_one_or_none()
            allowed = json.loads(raw) if raw else []

        if email not in allowed:
            raise HTTPException(status_code=403, detail="access_denied")
        role = UserRole.member

    user = (await db.execute(
        select(User).where(User.email == email)
    )).scalar_one_or_none()

    if user is None:
        user = User(email=email, role=role, status=UserStatus.active, onboarding_complete=True)
        db.add(user)
        await db.flush()
        db.add(UserProfile(
            user_id=user.id,
            full_name=name or email,
            avatar_url=picture,
        ))
        db.add(UserSettings(
            user_id=user.id,
            allowed_emails=json.dumps([email]) if role == UserRole.owner else None,
        ))
        db.add(ConnectedAccount(
            user_id=user.id,
            provider="gmail",
            account_email=email,
            status="connected",
        ))
    else:
        if user.profile and picture:
            user.profile.avatar_url = picture

    await db.commit()
    await db.refresh(user)
    return user


async def _create_session(db: AsyncSession, user: User) -> bytes:
    token = secrets.token_bytes(32)
    db.add(Session(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(UTC) + timedelta(days=SESSION_DAYS),
    ))
    await db.commit()
    return token


@router.get("/auth/google")
async def start_google_auth():
    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    _pending["state"] = state
    _pending["flow"] = flow
    return RedirectResponse(auth_url)


@router.get("/auth/callback")
async def google_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    flow = _pending.get("flow")
    if not flow:
        raise HTTPException(status_code=400, detail="No pending auth flow")
    if state != _pending.get("state"):
        raise HTTPException(status_code=400, detail="State mismatch")

    await asyncio.to_thread(flow.fetch_token, code=code)
    creds = flow.credentials
    _pending.clear()

    userinfo = await asyncio.to_thread(get_google_userinfo, creds)
    email = userinfo.get("email", "").lower().strip()
    name = userinfo.get("name", email)
    picture = userinfo.get("picture")

    user = await _get_or_create_user(db, email, name, picture)

    account = (await db.execute(
        select(ConnectedAccount).where(
            ConnectedAccount.user_id == user.id,
            ConnectedAccount.provider == "gmail",
        )
    )).scalar_one_or_none()
    if account:
        account.access_token = creds.token
        account.refresh_token = creds.refresh_token
        account.token_expiry = creds.expiry
        account.status = "connected"
        await db.commit()

    token = await _create_session(db, user)

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
    from sqlalchemy import delete as sa_delete
    raw_cookie = request.cookies.get(COOKIE_NAME)
    if raw_cookie:
        try:
            token_bytes = bytes.fromhex(raw_cookie)
            await db.execute(sa_delete(Session).where(Session.token == token_bytes))
            await db.commit()
        except Exception:
            pass
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/auth/me")
async def auth_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(
        select(User).where(User.email == "service@localhost")
    )).scalar_one_or_none()
    has_seed_data = False
    if seed_row:
        try:
            seed_count = (await db.scalar(
                select(func.count()).where(Email.user_id == seed_row.id)
            )) or 0
            has_seed_data = seed_count > 0
        except Exception:
            pass

    # Eagerly fetch profile to avoid lazy-load in async context
    profile = (await db.execute(
        select(UserProfile).where(UserProfile.user_id == user.id)
    )).scalar_one_or_none()

    return {
        "id": user.id,
        "email": user.email,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
        "name": profile.full_name if profile else user.email,
        "avatar_url": profile.avatar_url if profile else None,
        "has_seed_data": has_seed_data,
    }


@router.post("/auth/claim-seed-data")
async def claim_seed_data(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seed_row = (await db.execute(
        select(User).where(User.email == "service@localhost")
    )).scalar_one_or_none()
    if not seed_row:
        return {"transferred": 0}
    from sqlalchemy import update
    result = await db.execute(
        update(Email).where(Email.user_id == seed_row.id).values(user_id=user.id)
    )
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
    if user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    raw = (await db.execute(
        select(UserSettings.allowed_emails).where(UserSettings.user_id == user.id)
    )).scalar_one_or_none()
    return {"allowed_emails": json.loads(raw) if raw else [user.email]}


@router.post("/auth/allowlist")
async def add_to_allowlist(
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    email_to_add = (body.get("email") or "").strip().lower()
    if not email_to_add or "@" not in email_to_add:
        raise HTTPException(status_code=422, detail="Valid email required")
    settings_row = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )).scalar_one()
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
    if user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    if email.lower() == user.email.lower():
        raise HTTPException(status_code=400, detail="Cannot remove owner email")
    settings_row = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )).scalar_one()
    current = json.loads(settings_row.allowed_emails) if settings_row.allowed_emails else [user.email]
    current = [e for e in current if e.lower() != email.lower()]
    settings_row.allowed_emails = json.dumps(current)
    await db.commit()
    return {"allowed_emails": current}
