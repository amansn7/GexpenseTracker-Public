"""
DB-backed merchant→category store.
Lookup priority: user override → global MerchantAlias.category → static MERCHANT_MAP.
"""
import logging
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.classifier.rules import MERCHANT_MAP

log = logging.getLogger(__name__)


def _normalize(merchant: str) -> str:
    return merchant.strip().lower()


class MerchantStore:
    async def get_category(
        self, session: AsyncSession, user_id: str, merchant: str
    ) -> Optional[str]:
        from app.models import UserMerchantOverride, MerchantAlias

        key = _normalize(merchant)

        # 1. User-specific override
        row = (await session.execute(
            select(UserMerchantOverride.category)
            .where(UserMerchantOverride.user_id == user_id, UserMerchantOverride.merchant == key)
        )).scalar_one_or_none()
        if row:
            return row

        # 2. Global MerchantAlias (canonical form)
        row = (await session.execute(
            select(MerchantAlias.category)
            .where(MerchantAlias.canonical == key, MerchantAlias.category.isnot(None))
        )).scalar_one_or_none()
        if row:
            return row

        # 3. Static MERCHANT_MAP fallback
        meta = MERCHANT_MAP.get(key)
        if meta:
            return meta.get("category")

        return None

    async def correct(
        self, session: AsyncSession, user_id: str, merchant: str, category: str
    ) -> None:
        from app.models import UserMerchantOverride, MerchantAlias

        key = _normalize(merchant)

        # Upsert user override
        existing = (await session.execute(
            select(UserMerchantOverride)
            .where(UserMerchantOverride.user_id == user_id, UserMerchantOverride.merchant == key)
        )).scalar_one_or_none()

        if existing:
            existing.category = category
        else:
            session.add(UserMerchantOverride(user_id=user_id, merchant=key, category=category))

        # Also propagate to global alias if it exists
        alias = (await session.execute(
            select(MerchantAlias).where(MerchantAlias.canonical == key)
        )).scalar_one_or_none()
        if alias:
            alias.category = category

        log.info("MerchantStore.correct user=%s merchant=%r → %r", user_id, key, category)

    async def record(
        self, session: AsyncSession, user_id: str, merchant: str, category: str
    ) -> None:
        from app.models import MerchantAlias

        key = _normalize(merchant)

        alias = (await session.execute(
            select(MerchantAlias).where(MerchantAlias.canonical == key)
        )).scalar_one_or_none()

        if alias:
            alias.hit_count += 1
            if not alias.category:
                alias.category = category
        else:
            session.add(MerchantAlias(
                raw=key,
                canonical=key,
                category=category,
                source="rule_engine",
                hit_count=1,
            ))


    async def seed_from_json(self, session: AsyncSession, json_path: str) -> int:
        """Load merchant→category mappings from ExpenseRuleEngine's merchant_db.json."""
        import json
        from pathlib import Path
        from app.models import MerchantAlias

        data = json.loads(Path(json_path).read_text())
        merchants = data.get("merchants", {})
        count = 0
        for raw, info in merchants.items():
            key = _normalize(raw)
            category = info.get("category")
            if not key or not category:
                continue
            existing = (await session.execute(
                select(MerchantAlias).where(MerchantAlias.canonical == key)
            )).scalar_one_or_none()
            if existing:
                existing.hit_count += info.get("count", 0)
                if not existing.category:
                    existing.category = category
            else:
                session.add(MerchantAlias(
                    raw=key,
                    canonical=key,
                    category=category,
                    source="seeded",
                    hit_count=info.get("count", 1),
                ))
            count += 1
        await session.commit()
        log.info("MerchantStore.seed_from_json: seeded %d merchants from %s", count, json_path)
        return count


merchant_store = MerchantStore()
