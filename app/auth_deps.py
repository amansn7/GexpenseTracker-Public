from datetime import datetime, UTC, timedelta
from typing import Optional
from fastapi import Cookie, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.database import get_db
from app.models import Session, User

SESSION_ROTATION_DAYS = 7


async def get_current_user(
    session: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
    response: Response = None,
) -> User:
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        token_bytes = bytes.fromhex(session)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid session")

    row = (await db.execute(
        select(Session).where(Session.token == token_bytes)
    )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=401, detail="Session not found")

    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < datetime.now(UTC):
        await db.execute(delete(Session).where(Session.id == row.id))
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    should_rotate = (
        row.last_rotated_at is None or
        row.last_rotated_at < datetime.now(UTC) - timedelta(days=SESSION_ROTATION_DAYS)
    )
    if should_rotate and response is not None:
        new_token = __import__('secrets').token_bytes(32)
        row.token = new_token
        row.last_rotated_at = datetime.now(UTC)
        await db.commit()

        import os
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

    user = (await db.execute(
        select(User).where(User.id == row.user_id)
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if user.scheduled_deletion_at:
        sched = user.scheduled_deletion_at
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=UTC)
        if sched <= datetime.now(UTC):
            raise HTTPException(status_code=403, detail="Account deleted")

    return user
