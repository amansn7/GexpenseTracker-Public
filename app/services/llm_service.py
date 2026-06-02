"""Centralized LLM client building — BYOK, trial FreeLLMAPI, and global fallback."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.llm.user_client import build_trial_client, build_user_client
from app.classifier.llm_client import MultiLLMClient, llm_client
from app.config import settings
from app.crypto import decrypt_ai_secret
from app.models import UserSettings
from app.models.user import User, UserAIService, UserRole

logger = logging.getLogger(__name__)


async def get_user_llm_client(user_id: str, db: AsyncSession) -> MultiLLMClient | None:
    """[DEPRECATED] Prefer get_effective_llm_client. Only checks BYOK, no trial."""
    return await _get_byok_client(user_id, db)


async def get_effective_llm_client(user_id: str, db: AsyncSession) -> MultiLLMClient | None:
    """Return the most appropriate LLM client for *user_id*.

    Resolution order:
      1. BYOK — user has a configured AI service
      2. Trial — user is within their trial window → FreeLLMAPI proxy
      3. Owner — if *user_id* matches ``settings.OWNER_EMAIL`` → FreeLLMAPI proxy

    Returns ``None`` if no LLM providers are configured at all.
    Built-in env-var providers are not used — all providers come from BYOK or FreeLLMAPI.
    """
    # 1. BYOK
    byok = await _get_byok_client(user_id, db)
    if byok:
        return byok

    # 2. Trial
    if settings.ENABLE_LLM_TRIAL:
        trial = await _get_trial_client(user_id, db)
        if trial:
            return trial

    # 3. Owner FreeLLMAPI fallback — always available for the app owner
    if settings.OWNER_EMAIL and settings.FREELLMAPI_API_KEY:
        owner = await _get_owner_client(user_id, db)
        if owner:
            return owner

    return None


async def _get_byok_client(user_id: str, db: AsyncSession) -> MultiLLMClient | None:
    """Check the user's active AI service and build a BYOK client."""
    user_settings = (
        await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    ).scalar_one_or_none()

    if not (user_settings and user_settings.active_ai_service_id):
        return None

    ai_svc = (
        await db.execute(select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id))
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
            user_id,
            ai_svc.provider,
            ai_svc.model_id,
            exc,
        )
        return None


async def _get_trial_client(user_id: str, db: AsyncSession) -> MultiLLMClient | None:
    """Check trial window and build a FreeLLMAPI client if active."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.trial_started_at or not user.trial_ends_at:
        return None

    now = datetime.now(timezone.utc)
    if now >= user.trial_ends_at:
        return None

    return build_trial_client(user_id)


async def _get_owner_client(user_id: str, db: AsyncSession) -> MultiLLMClient | None:
    """Return a FreeLLMAPI client if *user_id* matches the configured owner email and role."""
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if not user or user.email != settings.OWNER_EMAIL or user.role != UserRole.owner:
        return None
    return build_trial_client(user_id)


async def trial_status(user_id: str, db: AsyncSession) -> dict:
    """Return the trial status dict for a user."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.trial_started_at or not user.trial_ends_at:
        return {"in_trial": False, "trial_started_at": None, "trial_ends_at": None}

    now = datetime.now(timezone.utc)
    active = user.trial_started_at <= now < user.trial_ends_at
    return {
        "in_trial": active,
        "trial_started_at": user.trial_started_at.isoformat() if user.trial_started_at else None,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "days_remaining": (user.trial_ends_at - now).days if active else 0,
    }
