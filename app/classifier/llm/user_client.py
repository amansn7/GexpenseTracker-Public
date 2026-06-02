"""User client factory — build_user_client and helpers."""

import logging

from app.classifier.llm.client import MultiLLMClient
from app.classifier.llm.providers import _KNOWN_BASE_URLS, Provider
from app.config import settings

logger = logging.getLogger(__name__)


def build_user_client(
    user_id: str,
    provider: str,
    base_url: str | None,
    api_key: str,
    model_id: str,
) -> MultiLLMClient:
    """Return a MultiLLMClient with only the user's DB-configured provider.
    No built-in fallbacks are appended — users bring their own keys exclusively."""
    if not api_key:
        logger.warning("No API key for provider %r - skipping user provider", provider)
        from app.classifier.llm.client import llm_client

        return llm_client

    provider_str = str(provider) if provider else ""
    resolved_url = str(base_url) if base_url else None
    if not resolved_url:
        resolved_url = _KNOWN_BASE_URLS.get(provider_str)
    # For Cloudflare, substitute account_id from env if user didn't provide custom URL
    if provider_str == "cloudflare" and not base_url and settings.CLOUDFLARE_ACCOUNT_ID:
        resolved_url = f"https://api.cloudflare.com/client/v4/accounts/{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1/run"
    if not resolved_url:
        logger.warning("No base_url for provider %r and not in known list", provider_str)
        return None

    client = MultiLLMClient(user_id=user_id)
    user_provider = Provider(name=provider_str, base_url=str(resolved_url), api_key=str(api_key), model=str(model_id))
    client._providers = [user_provider]
    return client


def build_trial_client(user_id: str) -> MultiLLMClient | None:
    """Build a client with the FreeLLMAPI proxy as the sole provider.

    Returns None if the FreeLLMAPI proxy is not configured.
    """
    if not settings.FREELLMAPI_API_KEY:
        logger.warning("FREELLMAPI_API_KEY not configured — cannot build trial client")
        return None

    client = MultiLLMClient(user_id=user_id)
    model = settings.FREELLMAPI_MODEL or "auto"
    trial_provider = Provider(
        name="freellmapi",
        base_url=settings.FREELLMAPI_BASE_URL,
        api_key=settings.FREELLMAPI_API_KEY,
        model=model,
    )
    client._providers = [trial_provider]
    return client


def get_user_client(user_id: str) -> MultiLLMClient | None:
    """Convenience wrapper — get cached user client or build one from DB."""
    from app.classifier.llm.client import MultiLLMClient

    return MultiLLMClient().get_user_client(user_id) if user_id else None
