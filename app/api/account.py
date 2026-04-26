from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import User, UserProfile
from app.api._account_helpers import (
    _profile_dict,
    _load_user_bundle,
)

router = APIRouter()


class ProfilePatch(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    avatar_url: Optional[str] = None
    default_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = None


@router.get("/account/me")
async def get_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _load_user_bundle(db, user)


@router.patch("/account/profile")
async def update_profile(
    patch: ProfilePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one()
    for key, value in patch.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip()
            if key == "default_currency":
                value = value.upper()
        if key in {"default_currency", "timezone"}:
            setattr(profile, key, value)
        else:
            setattr(profile, key, value or None)
    await db.commit()
    await db.refresh(profile)
    return {"profile": _profile_dict(profile)}
