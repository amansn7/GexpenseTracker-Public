from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models import (
    ConnectedAccount,
    User,
    UserCategory,
    UserProfile,
    UserRole,
    UserSettings,
    UserStatus,
)
from app.api._account_helpers import (
    DEFAULT_CATEGORIES,
    _clean_email,
    _load_user_bundle,
)

router = APIRouter()


class OnboardingBody(BaseModel):
    email: str
    full_name: str
    invite_code: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    default_currency: str = Field(default="INR", min_length=3, max_length=3)
    timezone: str = "Asia/Kolkata"
    role: str = UserRole.member.value


@router.post("/account/onboarding", status_code=201)
async def start_onboarding(body: OnboardingBody, db: AsyncSession = Depends(get_db)):
    email = _clean_email(body.email)
    if not body.full_name.strip():
        raise HTTPException(status_code=422, detail="full_name is required")
    if settings.INVITE_CODE and body.invite_code != settings.INVITE_CODE:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    user = User(email=email, role=body.role, status=UserStatus.active.value, onboarding_complete=True)
    db.add(user)
    await db.flush()
    db.add(UserProfile(
        user_id=user.id,
        full_name=body.full_name.strip(),
        display_name=(body.display_name or "").strip() or None,
        phone=(body.phone or "").strip() or None,
        location=(body.location or "").strip() or None,
        default_currency=body.default_currency.upper(),
        timezone=body.timezone.strip() or "Asia/Kolkata",
    ))
    db.add(UserSettings(user_id=user.id))
    db.add(ConnectedAccount(user_id=user.id, provider="gmail", account_email=email, status="disconnected"))
    for idx, (name, color, kind) in enumerate(DEFAULT_CATEGORIES):
        db.add(UserCategory(user_id=user.id, name=name, color=color, kind=kind, sort_order=idx))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="User already exists")
    await db.refresh(user)
    return await _load_user_bundle(db, user)
