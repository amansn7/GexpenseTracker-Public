"""Centralized classifier context loading for LLM prompts."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.rules import build_domain_rules
from app.models import UserSettings
from app.services.category_service import CategoryService


async def get_classifier_context(
    user_id: str,
    db: AsyncSession,
    include_rules: bool = True,
) -> dict:
    """Load classifier context for a user: rules and categories.

    Returns dict with keys:
      - rules: dict[str, tuple] from build_domain_rules (or {} if disabled)
      - categories: str — comma-separated active category names (or None)
    """
    user_settings = (await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))).scalar_one_or_none()

    rule_engine_enabled = user_settings.use_rule_engine if user_settings else True

    rules: dict = {}
    if include_rules and rule_engine_enabled:
        rules = await build_domain_rules(db)

    categories = await CategoryService.load_for_llm(db, user_id)

    return {
        "rules": rules,
        "categories": categories,
    }
