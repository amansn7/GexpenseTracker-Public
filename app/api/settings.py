import base64
from datetime import datetime, date
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import (
    ConnectedAccount,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserSettings,
)
from app.api._account_helpers import (
    _clean_email,
    _api_key_hint,
    _encrypt_secret,
    _settings_dict,
    _account_dict,
    _category_dict,
    _ai_service_dict,
    _get_owned,
    _profile_dict,
    _load_user_bundle,
)

router = APIRouter()


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


class AIServiceValidateBody(BaseModel):
    provider: str
    api_key: str
    model_id: str
    base_url: str


class TotpVerifyBody(BaseModel):
    code: str


class ProfilePatch(BaseModel):
    full_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    avatar_url: Optional[str] = None
    default_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = None


@router.patch("/account/settings")
async def update_settings(
    patch: SettingsPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    s = (await db.execute(select(UserSettings).where(UserSettings.user_id == user.id))).scalar_one()
    for key, value in patch.model_dump(exclude_unset=True).items():
        setattr(s, key, value)
    await db.commit()
    await db.refresh(s)
    return {"settings": _settings_dict(s)}


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
    provider = body.provider.strip().lower()
    model_id = body.model_id.strip()
    existing = await db.execute(
        select(UserAIService).where(
            UserAIService.user_id == user.id,
            UserAIService.provider == provider,
            UserAIService.model_id == model_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="AI service with this provider and model already exists")
    service = UserAIService(
        user_id=user.id,
        provider=provider,
        display_name=body.display_name.strip(),
        model_id=model_id,
        base_url=body.base_url,
        auth_header=body.auth_header,
        api_key_hint=_api_key_hint(body.api_key),
        encrypted_api_key=_encrypt_secret(body.api_key),
        enabled=body.enabled,
    )
    db.add(service)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="AI service with this provider and model already exists")
    await db.refresh(service)
    return {"ai_service": _ai_service_dict(service)}


@router.post("/account/ai-services/validate")
async def validate_ai_service(
    body: AIServiceValidateBody,
    user: User = Depends(get_current_user),
):
    headers = {
        "Authorization": f"Bearer {body.api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Cloudflare uses /run/{model}, others use /chat/completions
            if body.provider == "cloudflare":
                url = f"{body.base_url}/run/{body.model_id}"
                payload = {
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1,
                }
            else:
                url = f"{body.base_url}/chat/completions"
                payload = {
                    "model": body.model_id,
                    "messages": [{"role": "user", "content": "hi"}],
                    "max_tokens": 1,
                }
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        truncated = exc.response.text[:200]
        return {"ok": False, "error": f"HTTP {exc.response.status_code}: {truncated}"}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


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


@router.post("/account/2fa/setup")
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io, qrcode, pyotp
    secret = pyotp.random_base32()
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    user_row.totp_secret_pending = secret
    await db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(user.email, issuer_name="GexpenseTracker")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "qr_url": qr_url}


@router.post("/account/2fa/verify")
async def verify_2fa(
    body: TotpVerifyBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import pyotp
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    if not user_row.totp_secret_pending:
        raise HTTPException(status_code=400, detail="No pending 2FA setup")
    valid = pyotp.TOTP(user_row.totp_secret_pending).verify(body.code, valid_window=1)
    if not valid:
        return {"ok": False, "error": "Invalid code"}
    user_row.totp_secret = user_row.totp_secret_pending
    user_row.totp_secret_pending = None
    user_row.totp_enabled = True
    await db.commit()
    return {"ok": True}


@router.delete("/account/2fa")
async def disable_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    user_row.totp_enabled = False
    user_row.totp_secret = None
    user_row.totp_secret_pending = None
    await db.commit()
    return {"ok": True}


@router.delete("/account")
async def delete_account(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    await db.delete(user_row)
    await db.commit()
    response.delete_cookie("session", path="/")
    return {"deleted": True}


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
