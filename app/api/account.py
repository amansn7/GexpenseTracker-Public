import base64
import hashlib
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models import (
    ConnectedAccount,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserRole,
    UserSettings,
    UserStatus,
)

router = APIRouter()

DEFAULT_CATEGORIES = [
    ("Food", "#e8d5b7", "expense"),
    ("Rent", "#cdd8d1", "expense"),
    ("Shopping", "#e5d1d9", "expense"),
    ("Travel", "#d4dde5", "expense"),
    ("Subscriptions", "#dccfe0", "expense"),
    ("Utilities", "#d9dbc9", "expense"),
    ("Income", "#c9dcc8", "income"),
    ("Other", "#dcd5c3", "expense"),
]


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


class ProfilePatch(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    avatar_url: Optional[str] = None
    default_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = None


class SettingsPatch(BaseModel):
    daily_digest: Optional[bool] = None
    low_confidence_alerts: Optional[bool] = None
    auto_categorize: Optional[bool] = None
    show_confidence: Optional[bool] = None
    sound_effects: Optional[bool] = None
    two_factor_enabled: Optional[bool] = None
    confidence_threshold: Optional[int] = Field(default=None, ge=50, le=95)
    monthly_ai_budget: Optional[float] = Field(default=None, ge=0)
    active_ai_service_id: Optional[str] = None
    digest_hour: Optional[int] = Field(default=None, ge=0, le=23)
    use_rule_engine: Optional[bool] = None
    starting_balance: Optional[float] = Field(default=None, ge=0, le=999_999_999)
    starting_balance_date: Optional[date] = None

    @field_validator("starting_balance_date")
    @classmethod
    def _date_not_future(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > date.today():
            raise ValueError("starting_balance_date cannot be in the future")
        return v


class ConnectedAccountBody(BaseModel):
    provider: str
    account_email: str
    status: str = "disconnected"
    external_id: Optional[str] = None


class ConnectedAccountPatch(BaseModel):
    status: Optional[str] = None
    external_id: Optional[str] = None
    last_synced_at: Optional[datetime] = None


class CategoryBody(BaseModel):
    name: str
    color: str = "#dcd5c3"
    icon: Optional[str] = None
    kind: str = "expense"
    active: bool = True
    sort_order: int = 0


class CategoryPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    kind: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class AIServiceBody(BaseModel):
    provider: str
    display_name: str
    model_id: str
    base_url: Optional[str] = None
    auth_header: str = "bearer"
    api_key: Optional[str] = None
    enabled: bool = True


class AIServicePatch(BaseModel):
    provider: Optional[str] = None
    display_name: Optional[str] = None
    model_id: Optional[str] = None
    base_url: Optional[str] = None
    auth_header: Optional[str] = None
    api_key: Optional[str] = None
    enabled: Optional[bool] = None


def _clean_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
        raise HTTPException(status_code=422, detail="valid email is required")
    return cleaned


def _api_key_hint(api_key: Optional[str]) -> Optional[str]:
    if not api_key:
        return None
    suffix = api_key[-4:] if len(api_key) >= 4 else api_key
    return f"••{suffix}"


def _encrypt_secret(secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None
    from cryptography.fernet import Fernet

    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
    return Fernet(key).encrypt(secret.encode("utf-8")).decode("utf-8")



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


def _settings_dict(settings: UserSettings) -> dict:
    return {
        "daily_digest": settings.daily_digest,
        "low_confidence_alerts": settings.low_confidence_alerts,
        "auto_categorize": settings.auto_categorize,
        "show_confidence": settings.show_confidence,
        "sound_effects": settings.sound_effects,
        "two_factor_enabled": settings.two_factor_enabled,
        "confidence_threshold": settings.confidence_threshold,
        "monthly_ai_budget": float(settings.monthly_ai_budget) if settings.monthly_ai_budget is not None else None,
        "active_ai_service_id": settings.active_ai_service_id,
        "digest_hour": settings.digest_hour,
        "use_rule_engine": settings.use_rule_engine,
        "starting_balance": float(settings.starting_balance) if settings.starting_balance is not None else None,
        "starting_balance_date": settings.starting_balance_date.isoformat() if settings.starting_balance_date else None,
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
    }


async def _load_user_bundle(db: AsyncSession, user: User) -> dict:
    profile = (await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))).scalar_one()
    settings = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
    accounts = (await db.execute(
        select(ConnectedAccount).where(ConnectedAccount.user_id == user.id).order_by(ConnectedAccount.provider, ConnectedAccount.account_email)
    )).scalars().all()
    categories = (await db.execute(
        select(UserCategory).where(UserCategory.user_id == user.id).order_by(UserCategory.sort_order, UserCategory.name)
    )).scalars().all()
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
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        "profile": _profile_dict(profile),
        "settings": _settings_dict(settings),
        "connected_accounts": [_account_dict(a) for a in accounts],
        "categories": [_category_dict(c) for c in categories],
        "ai_services": [_ai_service_dict(s) for s in services],
    }


async def _get_owned(db: AsyncSession, model, user_id: str, item_id: str):
    item = (await db.execute(
        select(model).where(model.id == item_id, model.user_id == user_id)
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


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


@router.patch("/account/settings")
async def update_settings(
    patch: SettingsPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(settings, key, value)
    await db.commit()
    await db.refresh(settings)
    return {"settings": _settings_dict(settings)}


@router.post("/account/connected-accounts", status_code=201)
async def create_connected_account(
    body: ConnectedAccountBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = ConnectedAccount(
        user_id=user.id,
        provider=body.provider.strip().lower(),
        account_email=_clean_email(body.account_email),
        status=body.status,
        external_id=body.external_id,
    )
    db.add(account)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Connected account already exists")
    await db.refresh(account)
    return {"connected_account": _account_dict(account)}


@router.patch("/account/connected-accounts/{account_id}")
async def update_connected_account(
    account_id: str,
    patch: ConnectedAccountPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned(db, ConnectedAccount, user.id, account_id)
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(account, key, value)
    await db.commit()
    await db.refresh(account)
    return {"connected_account": _account_dict(account)}


@router.delete("/account/connected-accounts/{account_id}")
async def delete_connected_account(
    account_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_owned(db, ConnectedAccount, user.id, account_id)
    await db.delete(account)
    await db.commit()
    return {"deleted": account_id}


@router.get("/account/categories")
async def list_categories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(UserCategory)
        .where(UserCategory.user_id == user.id, UserCategory.active == True)
        .order_by(UserCategory.sort_order, UserCategory.name)
    )).scalars().all()
    return {"categories": [_category_dict(c) for c in rows]}


@router.post("/account/categories", status_code=201)
async def create_category(
    body: CategoryBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required")
    category = UserCategory(
        user_id=user.id,
        name=body.name.strip(),
        color=body.color,
        icon=body.icon,
        kind=body.kind,
        active=body.active,
        sort_order=body.sort_order,
    )
    db.add(category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Category already exists")
    await db.refresh(category)
    return {"category": _category_dict(category)}


@router.post("/account/categories/generate", status_code=200)
async def generate_categories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyse distinct category values in existing transactions and upsert user categories."""
    from sqlalchemy import func
    from app.models import Transaction, Email

    # Collect distinct non-null categories; try user-scoped first, fall back to all
    try:
        rows = (await db.execute(
            select(Transaction.category)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user.id,
                Transaction.category.isnot(None),
                Transaction.category != "",
            )
            .group_by(Transaction.category)
            .order_by(func.count().desc())
        )).scalars().all()
    except Exception:
        rows = (await db.execute(
            select(Transaction.category)
            .where(Transaction.category.isnot(None), Transaction.category != "")
            .group_by(Transaction.category)
            .order_by(func.count().desc())
        )).scalars().all()

    _PALETTE = {
        "food": "#e8d5b7", "groceries": "#e8d5b7", "dining": "#e8d5b7",
        "rent": "#cdd8d1", "housing": "#cdd8d1", "home": "#cdd8d1",
        "shopping": "#e5d1d9", "retail": "#e5d1d9",
        "travel": "#d4dde5", "transport": "#d4dde5",
        "subscriptions": "#dccfe0", "subscription": "#dccfe0", "entertainment": "#dccfe0",
        "utilities": "#d9dbc9", "electricity": "#d9dbc9", "internet": "#d9dbc9",
        "income": "#c9dcc8", "salary": "#c9dcc8", "refund": "#c9dcc8",
        "healthcare": "#f0d9d9", "medical": "#f0d9d9",
        "education": "#dde4ef",
        "emi": "#e8e0d5", "loan": "#e8e0d5",
    }

    existing = {c.name.lower() for c in (await db.execute(
        select(UserCategory).where(UserCategory.user_id == user.id)
    )).scalars().all()}

    added = 0
    for cat_name in rows:
        name = cat_name.strip().title()
        if name.lower() in existing:
            continue
        color = _PALETTE.get(name.lower(), "#dcd5c3")
        kind = "income" if name.lower() in ("income", "salary", "refund", "cashback", "freelance") else "expense"
        db.add(UserCategory(
            user_id=user.id,
            name=name,
            color=color,
            kind=kind,
            sort_order=len(existing) + added,
        ))
        existing.add(name.lower())
        added += 1

    if added:
        await db.commit()

    return {"generated": added}


@router.patch("/account/categories/{category_id}")
async def update_category(
    category_id: str,
    patch: CategoryPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_owned(db, UserCategory, user.id, category_id)
    for key, value in patch.model_dump(exclude_unset=True).items():
        if key == "name" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=422, detail="name is required")
        setattr(category, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Category already exists")
    await db.refresh(category)
    return {"category": _category_dict(category)}


@router.delete("/account/categories/{category_id}")
async def delete_category(
    category_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = await _get_owned(db, UserCategory, user.id, category_id)
    await db.delete(category)
    await db.commit()
    return {"deleted": category_id}


@router.post("/account/ai-services", status_code=201)
async def create_ai_service(
    body: AIServiceBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.display_name.strip() or not body.model_id.strip():
        raise HTTPException(status_code=422, detail="display_name and model_id are required")
    service = UserAIService(
        user_id=user.id,
        provider=body.provider.strip().lower(),
        display_name=body.display_name.strip(),
        model_id=body.model_id.strip(),
        base_url=body.base_url,
        auth_header=body.auth_header,
        api_key_hint=_api_key_hint(body.api_key),
        encrypted_api_key=_encrypt_secret(body.api_key),
        enabled=body.enabled,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return {"ai_service": _ai_service_dict(service)}


@router.patch("/account/ai-services/{service_id}")
async def update_ai_service(
    service_id: str,
    patch: AIServicePatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = await _get_owned(db, UserAIService, user.id, service_id)
    updates = patch.model_dump(exclude_unset=True)
    api_key = updates.pop("api_key", None)
    if api_key is not None:
        service.encrypted_api_key = _encrypt_secret(api_key)
        service.api_key_hint = _api_key_hint(api_key)
    for key, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(service, key, value)
    await db.commit()
    await db.refresh(service)
    return {"ai_service": _ai_service_dict(service)}


@router.delete("/account/ai-services/{service_id}")
async def delete_ai_service(
    service_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = await _get_owned(db, UserAIService, user.id, service_id)
    await db.delete(service)
    await db.commit()
    return {"deleted": service_id}
