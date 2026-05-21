"""Shared helpers for account-related API modules."""

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ConnectedAccount,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserSettings,
)
from app.services.category_service import CategoryService

DEFAULT_CATEGORIES = [
    ("Food & Dining", "#e8d5b7", "expense"),
    ("Groceries", "#ddd2ba", "expense"),
    ("Rent", "#cdd8d1", "expense"),
    ("Transport", "#d4dde5", "expense"),
    ("Travel", "#b8cce4", "expense"),
    ("Shopping", "#e5d1d9", "expense"),
    ("Entertainment", "#dccfe0", "expense"),
    ("Healthcare", "#f0d9d9", "expense"),
    ("Education", "#dde4ef", "expense"),
    ("Subscriptions", "#c8b8d8", "expense"),
    ("Utilities", "#d9dbc9", "expense"),
    ("CC Payment", "#d4c4b7", "expense"),
    ("Transfers", "#d4d0b8", "expense"),
    ("Income", "#c9dcc8", "income"),
    ("Other", "#dcd5c3", "expense"),
]


def _clean_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
        raise HTTPException(status_code=422, detail="valid email is required")
    return cleaned


def _api_key_hint(api_key: str | None) -> str | None:
    if not api_key:
        return None
    suffix = api_key[-4:] if len(api_key) >= 4 else api_key
    return f"••{suffix}"


def _profile_dict(profile: UserProfile) -> dict:
    return {
        "full_name": profile.full_name,
        "display_name": profile.display_name,
        "phone": profile.phone,
        "location": profile.location,
        "avatar_url": profile.avatar_url,
        "default_currency": profile.default_currency,
        "timezone": profile.timezone,
    }


def _settings_dict(s: UserSettings) -> dict:
    return {
        "daily_digest": s.daily_digest,
        "low_confidence_alerts": s.low_confidence_alerts,
        "auto_categorize": s.auto_categorize,
        "show_confidence": s.show_confidence,
        "sound_effects": s.sound_effects,
        "two_factor_enabled": s.two_factor_enabled,
        "confidence_threshold": s.confidence_threshold,
        "monthly_ai_budget": float(s.monthly_ai_budget) if s.monthly_ai_budget is not None else None,
        "active_ai_service_id": s.active_ai_service_id,
        "digest_hour": s.digest_hour,
        "use_rule_engine": s.use_rule_engine,
        "starting_balance": float(s.starting_balance) if s.starting_balance is not None else None,
        "starting_balance_date": s.starting_balance_date.isoformat() if s.starting_balance_date else None,
    }


def _account_dict(account: ConnectedAccount) -> dict:
    return {
        "id": account.id,
        "provider": account.provider,
        "account_email": account.account_email,
        "status": account.status,
        "external_id": account.external_id,
        "last_synced_at": account.last_synced_at.isoformat() if account.last_synced_at else None,
    }


def _category_dict(category: UserCategory) -> dict:
    return {
        "id": category.id,
        "name": category.name,
        "color": category.color,
        "icon": category.icon,
        "kind": category.kind,
        "active": category.active,
        "sort_order": category.sort_order,
    }


def _ai_service_dict(service: UserAIService) -> dict:
    return {
        "id": service.id,
        "provider": service.provider,
        "display_name": service.display_name,
        "model_id": service.model_id,
        "base_url": service.base_url,
        "auth_header": service.auth_header,
        "api_key_hint": service.api_key_hint,
        "enabled": service.enabled,
        "rotation_enabled": getattr(service, "rotation_enabled", False),
        "last_rotated_at": service.last_rotated_at.isoformat() if service.last_rotated_at else None,
        "key_expires_at": service.key_expires_at.isoformat() if service.key_expires_at else None,
    }


async def _load_user_bundle(db: AsyncSession, user: User) -> dict:
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one()
    s = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
    accounts = (await db.execute(
        select(ConnectedAccount).where(ConnectedAccount.user_id == user.id).order_by(ConnectedAccount.provider, ConnectedAccount.account_email)
    )).scalars().all()
    categories = await CategoryService.get_list(db, str(user.id))
    services = (await db.execute(
        select(UserAIService).where(UserAIService.user_id == user.id).order_by(UserAIService.display_name)
    )).scalars().all()
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "status": user.status,
            "onboarding_complete": user.onboarding_complete,
            "totp_enabled": user.totp_enabled,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "profile": _profile_dict(profile),
        "settings": _settings_dict(s),
        "connected_accounts": [_account_dict(a) for a in accounts],
        "categories": categories,
        "ai_services": [_ai_service_dict(sv) for sv in services],
    }


async def _get_owned(db: AsyncSession, model, user_id: str, item_id: str):
    item = (await db.execute(
        select(model).where(model.id == item_id, model.user_id == user_id)
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item
