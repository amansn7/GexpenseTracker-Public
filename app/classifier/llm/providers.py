"""Provider registry, priority scoring, and rate limiter registry."""
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    extra_headers: dict = field(default_factory=dict)
    rate_limited_until: float = field(default=0.0)
    rate_limit_count: int = field(default=0)
    success_count: int = field(default=0)
    fail_count: int = field(default=0)

    @property
    def available(self) -> bool:
        return bool(self.api_key) and time.time() >= self.rate_limited_until

    def is_rate_limited(self) -> bool:
        return time.time() < self.rate_limited_until

    def mark_rate_limited(self, retry_after: int = 60) -> None:
        self.rate_limit_count += 1
        self.rate_limited_until = time.time() + retry_after
        logger.warning(
            "LLM provider '%s' rate limited (hit #%d) - backing off %ds",
            self.name, self.rate_limit_count, retry_after,
        )
        from app.alerts import add_alert
        add_alert(
            "warning",
            f"LLM provider '{self.name}' hit rate limit (#{self.rate_limit_count}). "
            f"Priority lowered. Switching to next provider for {retry_after}s.",
            source="llm",
        )

    @property
    def priority_score(self) -> float:
        """Lower score = higher priority.
        Each rate-limit hit adds 0.25 to the score, persistently demoting the provider.
        Ties broken by error rate.
        """
        return self.rate_limit_count * 0.25 + self.error_rate

    @property
    def error_rate(self) -> float:
        total = self.success_count + self.fail_count
        return self.fail_count / total if total > 0 else 0.0


def build_default_providers() -> List[Provider]:
    """Register providers in default priority order (lowest score = tried first)."""
    providers: List[Provider] = []
    if settings.GOOGLE_AI_API_KEY:
        providers.append(Provider(
            name="google",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            api_key=settings.GOOGLE_AI_API_KEY,
            model="gemini-2.0-flash-exp",
        ))
    if settings.GROK_API_KEY:
        providers.append(Provider(
            name="grok",
            base_url="https://api.x.ai/v1",
            api_key=settings.GROK_API_KEY,
            model="grok-3-mini",
        ))
    if settings.GROQ_API_KEY:
        providers.append(Provider(
            name="groq",
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.GROQ_API_KEY,
            model="llama-3.3-70b-versatile",
        ))
    if settings.SCALEWAY_API_KEY:
        providers.append(Provider(
            name="scaleway",
            base_url="https://api.scaleway.ai/v1",
            api_key=settings.SCALEWAY_API_KEY,
            model="llama-3.3-70b-instruct",
        ))
    if settings.OPENROUTER_API_KEY:
        providers.append(Provider(
            name="openrouter",
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.OPENROUTER_API_KEY,
            model=settings.LLM_MODEL,
            extra_headers={
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Expense Tracker",
            },
        ))
    if settings.CLOUDFLARE_API_TOKEN and settings.CLOUDFLARE_ACCOUNT_ID:
        account_id_str = str(settings.CLOUDFLARE_ACCOUNT_ID)
        api_token_str = str(settings.CLOUDFLARE_API_TOKEN)
        providers.append(Provider(
            name="cloudflare",
            base_url=f"https://api.cloudflare.com/client/v4/accounts/{account_id_str}/ai/v1/run",
            api_key=api_token_str,
            model="@cf/meta/llama-3.1-8b-instruct",
        ))
    return providers


def rank_providers(providers: List[Provider]) -> List[Provider]:
    """Available providers sorted by priority_score ascending (best first)."""
    return sorted(
        [p for p in providers if p.available],
        key=lambda p: p.priority_score,
    )


def provider_status_dict(p: Provider, now: float) -> dict:
    return {
        "name": p.name,
        "available": p.available,
        "rate_limited_secs": max(0, round(p.rate_limited_until - now)) if p.rate_limited_until > now else 0,
        "rate_limit_count": p.rate_limit_count,
        "priority_score": round(p.priority_score, 3),
        "success": p.success_count,
        "fail": p.fail_count,
        "error_rate": round(p.error_rate, 3),
    }


# Rate limiter registry for Groq
_groq_limiters: Dict[str, object] = {}


def get_groq_limiter(user_id: Optional[str], api_key: str):
    """Get or create a Groq rate limiter for the given user/api_key."""
    key = f"{user_id or 'default'}:{api_key[:8]}"
    if key not in _groq_limiters:
        try:
            from app.classifier.groq_rate_limiter import get_groq_limiter as _get
            _groq_limiters[key] = _get(user_id=user_id, api_key=api_key)
        except Exception:
            return None
    return _groq_limiters[key]


_KNOWN_BASE_URLS: Dict[str, str] = {
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "grok": "https://api.x.ai/v1",
    "groq": "https://api.groq.com/openai/v1",
    "scaleway": "https://api.scaleway.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/run",
}
