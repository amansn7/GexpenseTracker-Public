from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import User
from app.models.financial import MerchantAlias

router = APIRouter()


class MerchantAliasBody(BaseModel):
    raw: str
    canonical: str
    category: Optional[str] = None
    confidence: Optional[float] = 1.0


class MerchantAliasPatch(BaseModel):
    canonical: Optional[str] = None
    category: Optional[str] = None


@router.get("/merchant-aliases")
async def list_merchant_aliases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(MerchantAlias).order_by(MerchantAlias.hit_count.desc()).limit(200)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "raw": r.raw,
            "canonical": r.canonical,
            "category": r.category,
            "confidence": r.confidence,
            "source": r.source,
            "hit_count": r.hit_count,
        }
        for r in rows
    ]


@router.post("/merchant-aliases", status_code=201)
async def create_merchant_alias(
    body: MerchantAliasBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = (await db.execute(
        select(MerchantAlias).where(MerchantAlias.raw == body.raw.strip().lower())
    )).scalar_one_or_none()

    if existing:
        existing.canonical = body.canonical
        existing.category = body.category
        existing.source = "user"
    else:
        db.add(MerchantAlias(
            raw=body.raw.strip().lower(),
            canonical=body.canonical,
            category=body.category,
            confidence=body.confidence or 1.0,
            source="user",
        ))

    await db.commit()
    return {"raw": body.raw.strip().lower(), "canonical": body.canonical, "category": body.category}


@router.patch("/merchant-aliases/{alias_id}")
async def patch_merchant_alias(
    alias_id: str,
    body: MerchantAliasPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (await db.execute(select(MerchantAlias).where(MerchantAlias.id == alias_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Merchant alias not found")

    if body.canonical is not None:
        row.canonical = body.canonical
    if body.category is not None:
        row.category = body.category

    await db.commit()
    return {"id": row.id, "raw": row.raw, "canonical": row.canonical, "category": row.category}


@router.delete("/merchant-aliases/{alias_id}")
async def delete_merchant_alias(
    alias_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (await db.execute(select(MerchantAlias).where(MerchantAlias.id == alias_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Merchant alias not found")

    await db.execute(delete(MerchantAlias).where(MerchantAlias.id == alias_id))
    await db.commit()
    return {"deleted": alias_id}
