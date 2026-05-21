"""Centralized LLM client building for user-specific AI services."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.llm_client import MultiLLMClient, build_user_client
from app.crypto import decrypt_ai_secret
from app.models import UserSettings
from app.models.user import UserAIService

logger = logging.getLogger(__name__)


async def get_user_llm_client(user_id: str, db: AsyncSession) -> MultiLLMClient | None:
    """Build a user-specific LLM client from their active AI service config.

    Returns None if the user has no active AI service or if building fails.
    """
    user_settings = (
        await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    ).scalar_one_or_none()

    if not (user_settings and user_settings.active_ai_service_id):
        return None

    ai_svc = (
        await db.execute(
            select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
        )
    ).scalar_one_or_none()

    if not (ai_svc and ai_svc.enabled and ai_svc.encrypted_api_key):
        return None

    try:
        decrypted_key = decrypt_ai_secret(ai_svc.encrypted_api_key)
        return build_user_client(
            user_id=user_id,
            provider=ai_svc.provider,
            base_url=ai_svc.base_url,
            api_key=decrypted_key,
            model_id=ai_svc.model_id,
        )
    except Exception as exc:
        logger.error(
            "Failed to build user LLM client for %s (provider=%s model=%s): %s",
            user_id, ai_svc.provider, ai_svc.model_id, exc,
        )
        return None
