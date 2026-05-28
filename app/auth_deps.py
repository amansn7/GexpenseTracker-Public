import hashlib
import hmac
import os
from datetime import UTC, datetime, timedelta

from fastapi import Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.jwt_utils import TokenType, decode_token
from app.models import Session, User, UserRole

SESSION_ROTATION_DAYS = 7
TOTP_COOKIE_NAME = "totp_verified"


def _sign_totp_token(session_hex: str) -> str:
    key = os.getenv("SECRET_KEY", "")
    if not key:
        raise RuntimeError("SECRET_KEY not configured")
    return hmac.new(key.encode(), session_hex.encode(), hashlib.sha256).hexdigest()


def _verify_totp_token(session_hex: str, token: str) -> bool:
    return hmac.compare_digest(_sign_totp_token(session_hex), token)


def is_owner(user: User | None) -> bool:
    if user is None:
        return False
    role = user.role
    if hasattr(role, "value"):
        role = role.value
    return role == UserRole.owner.value


async def get_current_user(
    session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
    response: Response = None,
    request: Request = None,
) -> User:
    # Bearer JWT path (mobile clients)
    if request is not None:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header.removeprefix("Bearer ").strip()
            try:
                payload = decode_token(raw_token, expected_type=TokenType.ACCESS)
            except ValueError as exc:
                raise HTTPException(status_code=401, detail=str(exc))
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token payload")
            user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            if user.scheduled_deletion_at:
                sched = user.scheduled_deletion_at
                if sched.tzinfo is None:
                    sched = sched.replace(tzinfo=UTC)
                if sched <= datetime.now(UTC):
                    raise HTTPException(status_code=403, detail="Account scheduled for deletion")
            if user.totp_enabled:
                totp_token = request.cookies.get(TOTP_COOKIE_NAME) if request else None
                if not totp_token or not _verify_totp_token(raw_token, totp_token):
                    raise HTTPException(
                        status_code=401,
                        detail={"detail": "2fa_required", "totp_pending": True},
                    )
            return user

    # Cookie / session path (web clients)
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        token_bytes = bytes.fromhex(session)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid session")

    row = (await db.execute(select(Session).where(Session.token == token_bytes))).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=401, detail="Session not found")

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        await db.execute(delete(Session).where(Session.id == row.id))
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    last_rotated = row.last_rotated_at
    if last_rotated is not None and last_rotated.tzinfo is None:
        last_rotated = last_rotated.replace(tzinfo=UTC)
    should_rotate = last_rotated is None or last_rotated < datetime.now(UTC) - timedelta(
        days=SESSION_ROTATION_DAYS
    )
    if should_rotate and response is not None:
        new_token = __import__("secrets").token_bytes(32)
        row.token = new_token
        row.last_rotated_at = datetime.now(UTC)
        await db.commit()

        secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
        response.set_cookie(
            "session",
            value=new_token.hex(),
            httponly=True,
            secure=secure,
            samesite="lax",
            max_age=30 * 86400,
            path="/",
        )

    user = (await db.execute(select(User).where(User.id == row.user_id))).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if user.scheduled_deletion_at:
        sched = user.scheduled_deletion_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=UTC)
        if sched <= datetime.now(UTC):
            raise HTTPException(status_code=403, detail="Account deleted")

    if user.totp_enabled:
        totp_token = request.cookies.get(TOTP_COOKIE_NAME) if request else None
        session_hex = session
        if not totp_token or not _verify_totp_token(session_hex, totp_token):
            raise HTTPException(
                status_code=401,
                detail={"detail": "2fa_required", "totp_pending": True},
            )

    return user


async def require_totp_or_recent_auth(
    request: Request,
    user: User = Depends(get_current_user),
):
    if os.getenv("TESTING"):
        return
    if user.totp_enabled:
        totp_token = request.cookies.get(TOTP_COOKIE_NAME)
        session_hex = request.cookies.get("session")
        if not totp_token or not session_hex or not _verify_totp_token(session_hex, totp_token):
            raise HTTPException(status_code=403, detail="TOTP verification required for this action")
