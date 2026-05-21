from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.classifier.merchant_entity import resolve_merchant
from app.database import get_db
from app.models import User
from app.models.merchant import MerchantAlias, MerchantEntity

router = APIRouter()


class MerchantResolveRequest(BaseModel):
    merchant: str


class MerchantResolveResponse(BaseModel):
    canonical: str
    parent: str | None
    confidence: float
    method: str


@router.post("/merchants/resolve", response_model=MerchantResolveResponse)
async def resolve_merchant_endpoint(
    body: MerchantResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve a raw merchant string to canonical entity info."""
    result = resolve_merchant(body.merchant)
    return result


@router.get("/merchants/aliases")
async def list_merchant_aliases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all aliases for current user + global aliases."""
    rows = (await db.execute(
        select(MerchantAlias)
        .where(
            (MerchantAlias.user_id == current_user.id)
            | (MerchantAlias.user_id.is_(None))
        )
        .order_by(MerchantAlias.canonical_name, MerchantAlias.alias_name)
    )).scalars().all()

    return [
        {
            "id": r.id,
            "canonical_name": r.canonical_name,
            "alias_name": r.alias_name,
            "user_id": r.user_id,
            "is_global": r.user_id is None,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/merchants/aliases", status_code=201)
async def create_merchant_alias(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new alias mapping for the current user."""
    canonical_name = body.get("canonical_name", "").strip()
    alias_name = body.get("alias_name", "").strip()

    if not canonical_name or not alias_name:
        raise HTTPException(status_code=400, detail="canonical_name and alias_name are required")

    existing = (await db.execute(
        select(MerchantAlias).where(
            MerchantAlias.alias_name == alias_name,
            MerchantAlias.user_id == current_user.id,
        )
    )).scalar_one_or_none()

    if existing:
        raise HTTPException(status_code=409, detail="Alias already exists for this user")

    alias = MerchantAlias(
        canonical_name=canonical_name,
        alias_name=alias_name,
        user_id=current_user.id,
    )
    db.add(alias)
    await db.commit()
    await db.refresh(alias)

    # Refresh the merchant entity cache so new alias is immediately available
    try:
        from app.classifier.merchant_entity import load_db_aliases
        await load_db_aliases(db)
    except Exception:
        pass  # Non-critical — cache will refresh on next startup

    return {
        "id": alias.id,
        "canonical_name": alias.canonical_name,
        "alias_name": alias.alias_name,
        "user_id": alias.user_id,
    }


@router.get("/merchants/entities")
async def list_merchant_entities(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all known merchant entities."""
    rows = (await db.execute(
        select(MerchantEntity).order_by(MerchantEntity.canonical_name)
    )).scalars().all()

    return [
        {
            "id": r.id,
            "canonical_name": r.canonical_name,
            "parent_entity": r.parent_entity,
            "category_hint": r.category_hint,
        }
        for r in rows
    ]
