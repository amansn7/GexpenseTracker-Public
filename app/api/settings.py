import base64
import logging
import random
from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._account_helpers import (
    _account_dict,
    _ai_service_dict,
    _api_key_hint,
    _category_dict,
    _clean_email,
    _get_owned,
    _load_user_bundle,
    _profile_dict,
    _settings_dict,
)
from app.auth_deps import get_current_user
from app.config import settings
from app.crypto import decrypt_secret, encrypt_ai_secret, encrypt_secret
from app.database import get_db
from app.models import (
    ConnectedAccount,
    Email,
    LLMSpendTracker,
    User,
    UserAIService,
    UserCategory,
    UserProfile,
    UserSettings,
)
from app.services.category_service import CategoryService, get_canonical_map

router = APIRouter()
logger = logging.getLogger(__name__)


class SettingsPatch(BaseModel):
    daily_digest: bool | None = None
    low_confidence_alerts: bool | None = None
    auto_categorize: bool | None = None
    show_confidence: bool | None = None
    sound_effects: bool | None = None
    two_factor_enabled: bool | None = None
    confidence_threshold: int | None = Field(default=None, ge=50, le=95)
    monthly_ai_budget: float | None = Field(default=None, ge=0)
    active_ai_service_id: str | None = None
    digest_hour: int | None = Field(default=None, ge=0, le=23)
    use_rule_engine: bool | None = None
    starting_balance: float | None = Field(default=None, ge=0, le=999_999_999)
    starting_balance_date: date | None = None

    @field_validator("starting_balance_date")
    @classmethod
    def _date_not_future(cls, v: date | None) -> date | None:
        if v is not None and v > date.today():
            raise ValueError("starting_balance_date cannot be in the future")
        return v


class ConnectedAccountBody(BaseModel):
    provider: str
    account_email: str
    status: str = "disconnected"
    external_id: str | None = None


class ConnectedAccountPatch(BaseModel):
    status: str | None = None
    external_id: str | None = None
    last_synced_at: datetime | None = None


class CategoryBody(BaseModel):
    name: str
    color: str = "#dcd5c3"
    icon: str | None = None
    kind: str = "expense"
    active: bool = True
    sort_order: int = 0


class CategoryPatch(BaseModel):
    name: str | None = None
    color: str | None = None
    icon: str | None = None
    kind: str | None = None
    active: bool | None = None
    sort_order: int | None = None


class AIServiceBody(BaseModel):
    provider: str
    display_name: str
    model_id: str
    base_url: str | None = None
    auth_header: str = "bearer"
    api_key: str | None = None
    enabled: bool = True


class AIServicePatch(BaseModel):
    provider: str | None = None
    display_name: str | None = None
    model_id: str | None = None
    base_url: str | None = None
    auth_header: str | None = None
    api_key: str | None = None
    enabled: bool | None = None


class AIServiceValidateBody(BaseModel):
    provider: str
    api_key: str
    model_id: str
    base_url: str


class TotpVerifyBody(BaseModel):
    code: str


class ProfilePatch(BaseModel):
    full_name: str | None = None
    display_name: str | None = None
    phone: str | None = None
    location: str | None = None
    avatar_url: str | None = None
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = None


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


@router.get("/categories/canonical-map")
async def get_categories_canonical_map(response: Response):
    """Return the canonical DB-category-value → canonical-key alias map.

    Static config; no auth required. Single source of truth shared between
    backend and frontend (see `static/src/data.jsx`).
    """
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"map": get_canonical_map()}


@router.get("/account/categories")
async def list_categories(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await CategoryService.get_active_list(db, str(user.id))
    return {"categories": rows}


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

    from app.models import Transaction

    try:
        rows = (
            (
                await db.execute(
                    select(Transaction.category)
                    .join(Email, Transaction.email_id == Email.id)
                    .where(
                        Email.user_id == user.id,
                        Transaction.category.isnot(None),
                        Transaction.category != "",
                    )
                    .group_by(Transaction.category)
                    .order_by(func.count().desc())
                )
            )
            .scalars()
            .all()
        )
    except Exception:
        rows = (
            (
                await db.execute(
                    select(Transaction.category)
                    .where(Transaction.category.isnot(None), Transaction.category != "")
                    .group_by(Transaction.category)
                    .order_by(func.count().desc())
                )
            )
            .scalars()
            .all()
        )

    _PALETTE = {
        "food": "#e8d5b7",
        "dining": "#e8d5b7",
        "restaurant": "#e8d5b7",
        "groceries": "#ddd2ba",
        "grocery": "#ddd2ba",
        "kirana": "#ddd2ba",
        "rent": "#cdd8d1",
        "housing": "#cdd8d1",
        "home": "#cdd8d1",
        "transport": "#d4dde5",
        "commute": "#d4dde5",
        "fuel": "#d4dde5",
        "travel": "#b8cce4",
        "flight": "#b8cce4",
        "hotel": "#b8cce4",
        "shopping": "#e5d1d9",
        "retail": "#e5d1d9",
        "clothing": "#e5d1d9",
        "entertainment": "#dccfe0",
        "movie": "#dccfe0",
        "cinema": "#dccfe0",
        "healthcare": "#f0d9d9",
        "medical": "#f0d9d9",
        "health": "#f0d9d9",
        "education": "#dde4ef",
        "edu": "#dde4ef",
        "tuition": "#dde4ef",
        "subscriptions": "#c8b8d8",
        "subscription": "#c8b8d8",
        "utilities": "#d9dbc9",
        "electricity": "#d9dbc9",
        "internet": "#d9dbc9",
        "cc payment": "#d4c4b7",
        "cc": "#d4c4b7",
        "credit card": "#d4c4b7",
        "transfers": "#d4d0b8",
        "transfer": "#d4d0b8",
        "upi": "#d4d0b8",
        "income": "#c9dcc8",
        "salary": "#c9dcc8",
        "refund": "#c9dcc8",
        "emi": "#e8e0d5",
        "loan": "#e8e0d5",
    }

    existing = {
        c.name.lower()
        for c in (await db.execute(select(UserCategory).where(UserCategory.user_id == user.id))).scalars().all()
    }

    added = 0
    for cat_name in rows:
        name = cat_name.strip().title()
        if name.lower() in existing:
            continue
        color = _PALETTE.get(name.lower(), "#dcd5c3")
        kind = "income" if name.lower() in ("income", "salary", "refund", "cashback", "freelance") else "expense"
        db.add(
            UserCategory(
                user_id=user.id,
                name=name,
                color=color,
                kind=kind,
                sort_order=len(existing) + added,
            )
        )
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
        encrypted_api_key=encrypt_ai_secret(body.api_key),
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
        service.encrypted_api_key = encrypt_ai_secret(api_key)
        service.api_key_hint = _api_key_hint(api_key)
    for key, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        setattr(service, key, value)
    await db.commit()
    await db.refresh(service)
    from app.classifier.llm.client import MultiLLMClient

    MultiLLMClient.invalidate_user_client(str(user.id))
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


class RotateKeyBody(BaseModel):
    new_api_key: str
    expires_in_days: int | None = 90


@router.post("/account/ai-services/{service_id}/rotate-key")
async def rotate_api_key(
    service_id: str,
    body: RotateKeyBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rotate the API key for an AI service."""
    from datetime import UTC, datetime, timedelta

    from app.audit import log_audit

    service = await _get_owned(db, UserAIService, user.id, service_id)
    service.encrypted_api_key = encrypt_ai_secret(body.new_api_key)
    service.api_key_hint = _api_key_hint(body.new_api_key)
    service.last_rotated_at = datetime.now(UTC)
    if body.expires_in_days and body.expires_in_days > 0:
        service.key_expires_at = datetime.now(UTC) + timedelta(days=body.expires_in_days)
    service.rotation_enabled = True
    await db.commit()
    await db.refresh(service)

    await log_audit(
        db,
        action="rotate_api_key",
        user_id=str(user.id),
        resource_type="ai_service",
        resource_id=service_id,
        details=f"provider={service.provider} model={service.model_id}",
    )

    from app.classifier.llm.client import MultiLLMClient

    MultiLLMClient.invalidate_user_client(str(user.id))
    return {"ai_service": _ai_service_dict(service)}


@router.get("/account/ai-services/expiring")
async def list_expiring_ai_keys(
    days: int = 30,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List AI services with keys expiring within N days."""
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    threshold = datetime.now(UTC) + timedelta(days=days)
    rows = (
        (
            await db.execute(
                select(UserAIService).where(
                    UserAIService.user_id == user.id,
                    UserAIService.key_expires_at.isnot(None),
                    UserAIService.key_expires_at <= threshold,
                )
            )
        )
        .scalars()
        .all()
    )
    return {
        "expiring": [
            {
                "id": s.id,
                "provider": s.provider,
                "display_name": s.display_name,
                "key_expires_at": s.key_expires_at.isoformat() if s.key_expires_at else None,
            }
            for s in rows
        ],
    }


@router.post("/account/2fa/setup")
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import io

    import pyotp
    import qrcode

    secret = pyotp.random_base32()
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    user_row.totp_secret_pending = encrypt_secret(secret)
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
    pending_plain = decrypt_secret(user_row.totp_secret_pending)
    valid = pyotp.TOTP(pending_plain).verify(body.code, valid_window=1)
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


async def _delete_user_data(db: AsyncSession, uid: str):
    """Full deletion pipeline — used by scheduled cleanup and admin reset."""
    # Step 1: Duplicate pairs (FK to transactions)
    await db.execute(
        text("""
        DELETE FROM duplicate_pairs WHERE
            primary_tx_id IN (SELECT t.id FROM transactions t JOIN emails e ON t.email_id = e.id WHERE e.user_id = :uid)
            OR duplicate_tx_id IN (SELECT t.id FROM transactions t JOIN emails e ON t.email_id = e.id WHERE e.user_id = :uid)
    """),
        {"uid": uid},
    )

    # Step 2: Personal data
    for table in [
        "connected_accounts",
        "sessions",
        "user_settings",
        "user_profiles",
        "user_categories",
        "user_ai_services",
        "budgets",
        "debts",
        "recurring_expenses",
        "user_merchant_overrides",
        "sender_rules",
        # Tables with FK to users.id but no ondelete="CASCADE"
        "filter_rules",
        "sync_state",
        "transaction_corrections",
        # Tables with no FK (plain String column) — explicit DELETE required
        "sync_progress",
        "llm_spend_tracker",
        # Audit logs: policy decision to delete on account removal.
        "audit_logs",
    ]:
        await db.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": uid})

    # Step 2b: Tables with FK to users.id (CASCADE-backed — explicit for robustness)
    for table in [
        "goals",
        "goal_contributions",
        "merchant_aliases",
        "merchant_entity_aliases",
        "device_tokens",
        "refresh_token_blacklist",
    ]:
        await db.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": uid})

    # Step 3: Classification logs (FK to emails)
    await db.execute(
        text("DELETE FROM classification_log WHERE email_id IN (SELECT id FROM emails WHERE user_id = :uid)"),
        {"uid": uid},
    )

    # Step 4: Transactions (FK to emails)
    await db.execute(
        text("DELETE FROM transactions WHERE email_id IN (SELECT id FROM emails WHERE user_id = :uid)"), {"uid": uid}
    )

    # Step 5: Emails (FK to users)
    await db.execute(text("DELETE FROM emails WHERE user_id = :uid"), {"uid": uid})

    # Step 6: User row
    await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})


@router.patch("/account/schedule-deletion")
async def schedule_account_deletion(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Schedule account deletion in 24-48 hours. Signs user out immediately."""
    delay_hours = random.uniform(24, 48)
    deletion_at = datetime.now(UTC) + timedelta(hours=delay_hours)

    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    user_row.scheduled_deletion_at = deletion_at
    await db.commit()

    response.delete_cookie("session", path="/")
    return {
        "scheduled": True,
        "deletion_at": deletion_at.isoformat(),
        "message": "Your account will be permanently deleted within the next 24 to 48 hours. "
        "You have been signed out. If this was a mistake, sign back in and cancel "
        "from Settings before the deletion date.",
    }


@router.post("/account/cancel-deletion")
async def cancel_account_deletion(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel pending account deletion."""
    user_row = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    if not user_row.scheduled_deletion_at:
        raise HTTPException(status_code=404, detail="No deletion scheduled")
    user_row.scheduled_deletion_at = None
    await db.commit()
    return {"cancelled": True, "message": "Account deletion cancelled. Your data is safe."}


@router.delete("/account")
async def delete_account(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Immediate account deletion (kept for admin/compat) — schedules instead for normal users."""
    uid = str(user.id)
    await _delete_user_data(db, uid)
    response.delete_cookie("session", path="/")
    await db.commit()
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


@router.get("/account/settings/llm-usage")
async def get_llm_usage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    month_start = today.replace(day=1)

    today_result = await db.execute(
        select(
            func.coalesce(func.sum(LLMSpendTracker.calls), 0),
            func.coalesce(func.sum(LLMSpendTracker.tokens_in), 0),
            func.coalesce(func.sum(LLMSpendTracker.tokens_out), 0),
            func.coalesce(func.sum(LLMSpendTracker.estimated_cost), 0),
        ).where(
            LLMSpendTracker.user_id == user.id,
            LLMSpendTracker.date == today,
        )
    )
    today_calls, today_tokens_in, today_tokens_out, today_cost = today_result.one()

    month_result = await db.execute(
        select(
            func.coalesce(func.sum(LLMSpendTracker.calls), 0),
            func.coalesce(func.sum(LLMSpendTracker.estimated_cost), 0),
        ).where(
            LLMSpendTracker.user_id == user.id,
            LLMSpendTracker.date >= month_start,
        )
    )
    month_calls, month_cost = month_result.one()

    return {
        "today": {
            "calls": int(today_calls),
            "tokens_in": int(today_tokens_in),
            "tokens_out": int(today_tokens_out),
            "estimated_cost_usd": round(float(today_cost), 4),
        },
        "month": {
            "calls": int(month_calls),
            "estimated_cost_usd": round(float(month_cost), 4),
        },
        "budget": {
            "daily_limit_usd": settings.DAILY_LLM_BUDGET,
            "remaining_usd": round(max(0.0, settings.DAILY_LLM_BUDGET - float(today_cost)), 4),
            "exceeded": float(today_cost) >= settings.DAILY_LLM_BUDGET,
        },
    }
