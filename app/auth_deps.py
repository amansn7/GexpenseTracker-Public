from datetime import datetime, UTC
from typing import Optional
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.database import get_db
from app.models import Session, User


async def get_current_user(
    session: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
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

    user = (await db.execute(
        select(User).where(User.id == row.user_id)
    )).scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user
