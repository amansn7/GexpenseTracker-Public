import re
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserCategory

# Maps DB category values to canonical keys (mirrors frontend _CAT_ALIAS)
_CANONICAL_MAP: Dict[str, str] = {
    "food": "food", "dining": "food", "food & dining": "food",
    "groceries": "food", "restaurant": "food",
    "rent": "rent", "rent & home": "rent", "home": "rent", "housing": "rent",
    "utilities": "util", "utility": "util", "util": "util",
    "electricity": "util", "internet": "util", "broadband": "util",
    "shopping": "shop", "shop": "shop", "retail": "shop",
    "travel": "travel", "transport": "travel", "commute": "travel",
    "flight": "travel", "fuel": "travel",
    "subscriptions": "sub", "subscription": "sub", "sub": "sub",
    "entertainment": "sub", "insurance": "sub", "emi": "sub",
    "income": "income", "salary": "income", "freelance": "income",
    "cc payment": "other", "cc": "other",
    "investment": "other", "refund": "other", "healthcare": "other",
    "cash": "other", "bank transfer": "other", "upi payment": "other",
    "other": "other",
}


def _category_dict(cat: UserCategory) -> dict:
    return {
        "id": cat.id,
        "name": cat.name,
        "color": cat.color,
        "icon": cat.icon,
        "kind": cat.kind,
        "active": cat.active,
        "sort_order": cat.sort_order,
    }


class CategoryService:
    """Centralized category operations for the backend."""

    @staticmethod
    def resolve(raw: Optional[str], is_income: bool = False) -> str:
        """Map a raw DB category value to a canonical key."""
        if is_income:
            return "income"
        if not raw:
            return "other"
        return _CANONICAL_MAP.get(raw.strip().lower(), "other")

    @staticmethod
    async def load_for_llm(
        session: Optional[AsyncSession], user_id: Optional[str]
    ) -> Optional[str]:
        """Return comma-separated active category names for the given user, or None."""
        if not session or not user_id:
            return None
        rows = (
            await session.execute(
                select(UserCategory.name)
                .where(
                    UserCategory.user_id == user_id,
                    UserCategory.active.is_(True),
                )
                .order_by(UserCategory.sort_order, UserCategory.name)
            )
        ).scalars().all()
        return ", ".join(rows) if rows else None

    @staticmethod
    async def get_list(
        session: AsyncSession, user_id: str
    ) -> List[dict]:
        """Return all user categories for the given user as dicts."""
        rows = (
            await session.execute(
                select(UserCategory)
                .where(UserCategory.user_id == user_id)
                .order_by(UserCategory.sort_order, UserCategory.name)
            )
        ).scalars().all()
        return [_category_dict(c) for c in rows]

    @staticmethod
    async def get_active_list(
        session: AsyncSession, user_id: str
    ) -> List[dict]:
        """Return only active user categories."""
        rows = (
            await session.execute(
                select(UserCategory)
                .where(
                    UserCategory.user_id == user_id,
                    UserCategory.active == True,
                )
                .order_by(UserCategory.sort_order, UserCategory.name)
            )
        ).scalars().all()
        return [_category_dict(c) for c in rows]
