from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import User
from app.models.financial import MerchantAlias

router = APIRouter()


class MerchantAliasBody(BaseModel):
    raw: str
    canonical: str
    category: str | None = None
    confidence: float | None = 1.0


class MerchantAliasPatch(BaseModel):
    canonical: str | None = None
    category: str | None = None


@router.get("/merchant-aliases")
async def list_merchant_aliases(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        (
            await db.execute(
                select(MerchantAlias)
                .where(MerchantAlias.user_id == current_user.id)
                .order_by(MerchantAlias.hit_count.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
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
    raw_key = body.raw.strip().lower()
    existing = (
        await db.execute(
            select(MerchantAlias).where(
                MerchantAlias.raw == raw_key,
                MerchantAlias.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.canonical = body.canonical
        existing.category = body.category
        existing.source = "user"
    else:
        db.add(
            MerchantAlias(
                user_id=current_user.id,
                raw=raw_key,
                canonical=body.canonical,
                category=body.category,
                confidence=body.confidence or 1.0,
                source="user",
            )
        )

    await db.commit()
    return {"raw": raw_key, "canonical": body.canonical, "category": body.category}


@router.patch("/merchant-aliases/{alias_id}")
async def patch_merchant_alias(
    alias_id: str,
    body: MerchantAliasPatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (
        await db.execute(
            select(MerchantAlias).where(
                MerchantAlias.id == alias_id,
                MerchantAlias.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
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
    row = (
        await db.execute(
            select(MerchantAlias).where(
                MerchantAlias.id == alias_id,
                MerchantAlias.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Merchant alias not found")

    await db.execute(
        delete(MerchantAlias).where(
            MerchantAlias.id == alias_id,
            MerchantAlias.user_id == current_user.id,
        )
    )
    await db.commit()
    return {"deleted": alias_id}
