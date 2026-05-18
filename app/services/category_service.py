from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserCategory

# Maps DB category values to canonical keys (mirrors frontend _CAT_ALIAS)
_CANONICAL_MAP: Dict[str, str] = {
    "food": "food", "dining": "food", "food & dining": "food",
    "restaurant": "food", "meal": "food", "cafe": "food", "eat": "food",
    "groceries": "groceries", "grocery": "groceries", "kirana": "groceries",
    "rent": "rent", "rent & home": "rent", "home": "rent", "housing": "rent",
    "transport": "transport", "commute": "transport", "cab": "transport",
    "ride": "transport", "taxi": "transport", "auto": "transport",
    "metro": "transport", "parking": "transport", "toll": "transport",
    "fuel": "transport", "petrol": "transport", "diesel": "transport",
    "travel": "travel", "flight": "travel", "hotel": "travel", "trip": "travel",
    "shopping": "shop", "shop": "shop", "retail": "shop", "clothing": "shop",
    "entertainment": "entertainment", "movie": "entertainment",
    "cinema": "entertainment", "concert": "entertainment", "game": "entertainment",
    "healthcare": "health", "health": "health", "medical": "health",
    "hospital": "health", "pharmacy": "health", "medicine": "health",
    "doctor": "health", "clinic": "health",
    "education": "edu", "edu": "edu", "tuition": "edu", "course": "edu",
    "training": "edu", "school": "edu", "college": "edu", "university": "edu",
    "subscriptions": "sub", "subscription": "sub", "sub": "sub",
    "membership": "sub", "premium": "sub", "insurance": "sub", "emi": "sub",
    "utilities": "util", "utility": "util", "util": "util",
    "electricity": "util", "internet": "util", "broadband": "util",
    "water": "util", "recharge": "util",
    "cc payment": "card", "cc": "card", "credit card": "card",
    "transfers": "transfer", "transfer": "transfer",
    "bank transfer": "transfer", "upi payment": "transfer",
    "upi": "transfer", "neft": "transfer", "imps": "transfer",
    "income": "income", "salary": "income", "freelance": "income",
    "refund": "income", "cashback": "income", "reward": "income",
    "investment": "other", "cash": "other",
    "other": "other",
}


def get_canonical_map() -> Dict[str, str]:
    """Return a copy of the canonical category alias map.

    Public accessor for `_CANONICAL_MAP` so external callers (e.g. the
    `/api/categories/canonical-map` endpoint) can expose the mapping without
    relying on a private symbol. Returns a shallow copy to prevent mutation.
    """
    return dict(_CANONICAL_MAP)


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
                    UserCategory.active.is_(True),
                )
                .order_by(UserCategory.sort_order, UserCategory.name)
            )
        ).scalars().all()
        return [_category_dict(c) for c in rows]
