"""LLMClient class with _call_provider, batch_classify, and chat."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.classifier.llm.parsing import LLMClassification, parse_batch_response, parse_response
from app.classifier.llm.prompts import (
    _BATCH_USER_TEMPLATE,
    _CORRECTION_BLOCK,
    _DEFAULT_CATEGORIES,
    _SYSTEM,
    _USER_TEMPLATE,
    build_pre_extraction_block,
)
from app.classifier.llm.providers import (
    Provider,
    build_default_providers,
    get_groq_limiter,
    provider_status_dict,
    rank_providers,
)
from app.config import settings

logger = logging.getLogger(__name__)


class LLMSpendTracker:
    """In-memory daily LLM spend tracker with per-user tracking.

    Tracks estimated spend per call against configurable budgets.
    Resets at midnight UTC. Not persisted across restarts.

    Uses asyncio.Lock for atomic increment to prevent race conditions.
    Supports both global and per-user spend tracking.
    """

    def __init__(self) -> None:
        self._date: str = ""
        self._spend: float = 0.0
        self._user_spend: dict[str, float] = {}
        self._lock: asyncio.Lock = asyncio.Lock()

    def _sync_date(self) -> None:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if self._date != today:
            self._date = today
            self._spend = 0.0
            self._user_spend.clear()

    @property
    def daily_spend(self) -> float:
        self._sync_date()
        return self._spend

    def user_daily_spend(self, user_id: str) -> float:
        self._sync_date()
        return self._user_spend.get(user_id, 0.0)

    async def add_call(self, estimated_cost: float = 0.0001, user_id: str | None = None) -> None:
        async with self._lock:
            self._sync_date()
            self._spend += estimated_cost
            if user_id:
                self._user_spend[user_id] = self._user_spend.get(user_id, 0.0) + estimated_cost

    def within_budget(self, budget: float) -> bool:
        self._sync_date()
        return self._spend < budget

    def user_within_budget(self, user_id: str, budget: float) -> bool:
        self._sync_date()
        return self._user_spend.get(user_id, 0.0) < budget


_llm_spend_tracker = LLMSpendTracker()


def _escape(s: str) -> str:
    """Escape curly braces in user-controlled strings before str.format() calls."""
    return s.replace("{", "{{").replace("}", "}}")


def _sanitize(s: str, max_length: int = 2000) -> str:
    """Sanitize user-controlled strings against prompt injection.

    Escapes curly braces, strips control characters, removes common injection
    patterns, and truncates to max_length.
    """
    s = _escape(s)
    result = []
    for c in s:
        if c == "\n" or c == "\t" or (ord(c) >= 32 and ord(c) != 127):
            result.append(c)
    s = "".join(result)
    injections = [
        "ignore all previous instructions",
        "forget your instructions",
        "system prompt:",
        "system:",
        "you are now",
        "new instructions:",
    ]
    lower = s.lower()
    for pattern in injections:
        while True:
            idx = lower.find(pattern)
            if idx == -1:
                break
            s = s[:idx] + "[redacted]" + s[idx + len(pattern):]
            lower = s.lower()
    if len(s) > max_length:
        s = s[:max_length] + "..."
    return s


class MultiLLMClient:
    _user_clients: dict[str, "MultiLLMClient"] = {}

    def __init__(self, user_id: str | None = None):
        self._providers: list[Provider] = []
        self._user_id = user_id
        self._build_providers()

    def _build_providers(self) -> None:
        self._providers = build_default_providers()

    def _ranked_providers(self) -> list[Provider]:
        return rank_providers(self._providers)

    def get_status(self) -> list[dict]:
        import time

        now = time.time()
        ranked_names = [p.name for p in self._ranked_providers()]
        all_providers = sorted(
            self._providers,
            key=lambda p: ranked_names.index(p.name) if p.name in ranked_names else 999,
        )
        return [provider_status_dict(p, now) for p in all_providers]

    @classmethod
    def invalidate_user_client(cls, user_id: str) -> None:
        """Remove a cached user client so it is rebuilt on next access (e.g. after key rotation)."""
        cls._user_clients.pop(user_id, None)

    async def get_user_client(self, user_id: str) -> Optional["MultiLLMClient"]:
        """Return user-specific LLM client from their DB config, or None if not configured."""
        if not user_id:
            return None
        cached = self._user_clients.get(user_id)
        if cached is not None:
            return cached

        from sqlalchemy import select

        from app.crypto import decrypt_ai_secret
        from app.database import AsyncSessionLocal
        from app.models import UserAIService

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(UserAIService).where(UserAIService.user_id == user_id).order_by(UserAIService.created_at)
            )
            services = result.scalars().all()
        config = next((s for s in services if s.enabled), services[0] if services else None)
        if not config:
            self._user_clients[user_id] = None
            return None

        decrypted_key = decrypt_ai_secret(config.encrypted_api_key) if config.encrypted_api_key else None
        from app.classifier.llm.user_client import build_user_client

        client = build_user_client(
            user_id=user_id,
            provider=config.provider,
            base_url=config.base_url,
            api_key=decrypted_key,
            model_id=config.model_id,
        )
        self._user_clients[user_id] = client
        return client

    async def classify(
        self,
        sender: str,
        subject: str,
        body_snippet: str,
        categories: str | None = None,
        pre_extraction: dict | None = None,
        correction_hint: str | None = None,
    ) -> LLMClassification:
        ranked = self._ranked_providers()
        if ranked and not _llm_spend_tracker.within_budget(settings.DAILY_LLM_BUDGET):
            logger.warning(
                "Daily LLM budget $%.2f exceeded (spent $%.4f). Skipping LLM call.",
                settings.DAILY_LLM_BUDGET,
                _llm_spend_tracker.daily_spend,
            )
            ranked = []
        if not ranked:
            from app.alerts import add_alert

            add_alert(
                "error",
                "All LLM providers unavailable (rate limited or unconfigured). "
                "Classification falling back to rules only.",
                source="llm",
            )
            raise RuntimeError("No LLM providers available")

        prompt = _USER_TEMPLATE.format(
            sender=_sanitize(sender),
            subject=_sanitize(subject, max_length=500),
            body_snippet=_sanitize(body_snippet),
            categories=categories or _DEFAULT_CATEGORIES,
        )
        if correction_hint:
            prompt += _CORRECTION_BLOCK.format(errors=_sanitize(correction_hint))
        if pre_extraction:
            prompt = build_pre_extraction_block(pre_extraction) + prompt
        last_error: Exception | None = None
        for provider in ranked:
            result, error = await self._call_with_retry(
                provider, lambda p: self._call_provider_verbose(p, prompt)
            )
            if error is None:
                llm_result, _, _, _ = result
                return llm_result
            last_error = error
        raise last_error or RuntimeError("No LLM providers available")

    async def _call_with_retry(
        self,
        provider: Provider,
        call_fn,
        provider_label: str = "",
    ) -> tuple[Any, Exception | None]:
        """Call a provider with one automatic retry on 429. Returns (result, error)."""
        try:
            result = await call_fn(provider)
            provider.success_count += 1
            provider.decrement_rate_limit_count()
            return result, None
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                retry_after = int(exc.response.headers.get("Retry-After", "60"))
                retry_delay = min(retry_after, 5)
                logger.info("Provider '%s'%s rate limited, retrying in %ds", provider.name, provider_label, retry_delay)
                await asyncio.sleep(retry_delay)
                try:
                    result = await call_fn(provider)
                    provider.success_count += 1
                    provider.decrement_rate_limit_count()
                    return result, None
                except httpx.HTTPStatusError as exc2:
                    if exc2.response.status_code == 429:
                        provider.mark_rate_limited(max(retry_after, 60))
                    else:
                        provider.fail_count += 1
                        logger.error("Provider '%s' HTTP %d: %s", provider.name, exc2.response.status_code, exc2.response.text[:200])
                    return None, exc2
                except Exception as exc2:
                    provider.fail_count += 1
                    logger.error("Provider '%s'%s error: %s", provider.name, provider_label, exc2)
                    return None, exc2
            provider.fail_count += 1
            logger.error("Provider '%s' HTTP %d: %s", provider.name, exc.response.status_code, exc.response.text[:200])
            return None, exc
        except Exception as exc:
            provider.fail_count += 1
            logger.error("Provider '%s'%s error: %s", provider.name, provider_label, exc)
            return None, exc

    async def _provider_http_call(
        self,
        provider: Provider,
        user_prompt: str,
        timeout: float = 30.0,
        max_tokens: int = 500,
        system_override: str | None = None,
        response_format: dict | None = None,
    ) -> tuple[str, int, int]:
        """Execute HTTP call to a provider and return (response_text, prompt_tokens, completion_tokens).

        Args:
            response_format: Optional JSON schema enforcement (e.g. {"type": "json_object"}).
                             Only applied to non-Cloudflare providers.
        """
        system = system_override or _SYSTEM
        if provider.name == "groq":
            try:
                limiter = get_groq_limiter(user_id=self._user_id, api_key=provider.api_key)
                if limiter is not None and not await limiter.acquire(
                    provider.model, estimated_tokens=max(50, len(user_prompt) // 4), timeout=30.0
                ):
                    provider.mark_rate_limited(retry_after=60)
                    provider.fail_count += 1
                    raise httpx.HTTPStatusError(
                        "Groq rate limit exceeded",
                        request=httpx.Request(
                            "POST", provider.base_url or "https://api.groq.com/openai/v1/chat/completions"
                        ),
                        response=httpx.Response(429),
                    )
            except httpx.HTTPStatusError:
                raise
            except Exception as e:
                logger.warning("Groq rate limiter error: %s", e)

        api_key_val = provider.api_key
        if hasattr(api_key_val, "decode"):
            api_key_val = api_key_val.decode("utf-8")
        api_key_str = str(api_key_val) if api_key_val else ""
        api_key_str = api_key_str.encode("ascii", "ignore").decode("ascii")

        logger.debug("LLM request: provider=%s model=%s base_url=%s", provider.name, provider.model, provider.base_url)

        headers: dict = {
            "Authorization": "Bearer " + api_key_str,
            "Content-Type": "application/json",
        }
        if provider.extra_headers:
            for k, v in provider.extra_headers.items():
                if v is not None:
                    headers[str(k)] = str(v)

        base_url = str(provider.base_url)

        if provider.name == "cloudflare":
            url = f"{base_url}/{provider.model}"
            payload = {
                "messages": [
                    {"role": "system", "content": str(system)},
                    {"role": "user", "content": str(user_prompt)},
                ],
                "temperature": 0.1,
                "max_tokens": max_tokens,
            }
        else:
            url = f"{base_url}/chat/completions"
            payload = {
                "model": str(provider.model),
                "messages": [
                    {"role": "system", "content": str(system)},
                    {"role": "user", "content": str(user_prompt)},
                ],
                "temperature": 0.1,
                "max_tokens": max_tokens,
            }
            if response_format is not None:
                payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()

        if provider.name == "cloudflare":
            raw = response.json()
            result = raw.get("result", {})
            text = result.get("response", "") if isinstance(result, dict) else str(result)
            return str(text).strip(), 0, 0

        usage = response.json().get("usage", {})
        tokens_in = usage.get("prompt_tokens", 0) if usage else 0
        tokens_out = usage.get("completion_tokens", 0) if usage else 0
        return response.json()["choices"][0]["message"]["content"].strip(), tokens_in, tokens_out

    async def _call_provider_verbose(self, provider: Provider, user_prompt: str) -> tuple:
        """Returns (LLMClassification, raw_response_str, tokens_in, tokens_out)."""
        raw, tokens_in, tokens_out = await self._provider_http_call(
            provider, user_prompt, response_format={"type": "json_object"}
        )
        logger.debug("Raw LLM response: %s", raw[:500])
        await _llm_spend_tracker.add_call(user_id=self._user_id)
        return parse_response(raw), raw, tokens_in, tokens_out

    async def classify_verbose(
        self,
        sender: str,
        subject: str,
        body_snippet: str,
        categories: str | None = None,
        pre_extraction: dict | None = None,
        correction_hint: str | None = None,
    ) -> dict:
        """Like classify() but also returns prompt, raw response, and provider name."""
        ranked = self._ranked_providers()
        logger.debug("classify_verbose: %d providers available: %s", len(ranked), [p.name for p in ranked])
        if ranked and not _llm_spend_tracker.within_budget(settings.DAILY_LLM_BUDGET):
            logger.warning(
                "Daily LLM budget $%.2f exceeded (spent $%.4f). Skipping LLM call.",
                settings.DAILY_LLM_BUDGET,
                _llm_spend_tracker.daily_spend,
            )
            ranked = []
        if not ranked:
            raise RuntimeError("No LLM providers available")

        prompt = _USER_TEMPLATE.format(
            sender=_sanitize(sender),
            subject=_sanitize(subject, max_length=500),
            body_snippet=_sanitize(body_snippet),
            categories=categories or _DEFAULT_CATEGORIES,
        )
        if correction_hint:
            prompt += _CORRECTION_BLOCK.format(errors=_sanitize(correction_hint))
        if pre_extraction:
            prompt = build_pre_extraction_block(pre_extraction) + prompt
        last_error: Exception | None = None
        logger.debug("classify_verbose: trying %d providers: %s", len(ranked), [p.name for p in ranked])
        for provider in ranked:
            logger.debug("  Trying provider: %s", provider.name)
            result, error = await self._call_with_retry(
                provider, lambda p: self._call_provider_verbose(p, prompt)
            )
            if error is None:
                llm_result, raw, tokens_in, tokens_out = result
                return {
                    "result": llm_result,
                    "provider": provider.name,
                    "model": provider.model,
                    "prompt": prompt,
                    "raw_response": raw,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                }
            last_error = error
        raise last_error or RuntimeError("All LLM providers failed")

    _MAX_BATCH_TOKENS = 2500

    async def batch_classify_verbose(
        self,
        email_list: list[tuple[str, str, str, dict | None]],
        categories: str | None = None,
    ) -> dict:
        """Classify multiple emails in one LLM call."""
        ranked = self._ranked_providers()
        logger.debug("batch_classify_verbose: %d providers available: %s", len(ranked), [p.name for p in ranked])
        if ranked and not _llm_spend_tracker.within_budget(settings.DAILY_LLM_BUDGET):
            logger.warning(
                "Daily LLM budget $%.2f exceeded (spent $%.4f). Skipping LLM batch call.",
                settings.DAILY_LLM_BUDGET,
                _llm_spend_tracker.daily_spend,
            )
            ranked = []
        if not ranked:
            raise RuntimeError("No LLM providers available")

        email_blocks: list[str] = []
        for i, (sender, subject, body, pre) in enumerate(email_list, 1):
            body = (body or "")[:600]
            block = f"Email {i}:\nFrom: {_sanitize(sender)}\nSubject: {_sanitize(subject, max_length=500)}\nBody: {_sanitize(body)}"
            if pre:
                pre_text = build_pre_extraction_block(pre)
                if pre_text:
                    block += "\n" + pre_text
            email_blocks.append(block)

        email_text = "\n---\n".join(email_blocks)

        prompt = _BATCH_USER_TEMPLATE.format(
            count=len(email_list),
            email_blocks=email_text,
            categories=categories or _DEFAULT_CATEGORIES,
        )

        last_error: Exception | None = None
        for provider in ranked:
            logger.debug("  Trying batch provider: %s", provider.name)
            result, error = await self._call_with_retry(
                provider,
                lambda p: self._provider_http_call(
                    p, prompt, timeout=60.0,
                    max_tokens=min(max(500, 500 * len(email_list)), self._MAX_BATCH_TOKENS),
                    response_format={"type": "json_object"},
                ),
                provider_label=" batch",
            )
            if error is None:
                raw, tokens_in, tokens_out = result
                await _llm_spend_tracker.add_call(user_id=self._user_id)
                results = parse_batch_response(raw, len(email_list))
                return {
                    "results": results,
                    "provider": provider.name,
                    "model": provider.model,
                    "raw_response": raw,
                    "prompt": prompt,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                }
            last_error = error
        raise last_error or RuntimeError("All LLM providers failed")

    async def batch_classify(
        self,
        email_list: list[tuple[str, str, str, dict | None]],
        categories: str | None = None,
    ) -> list[LLMClassification | None]:
        result = await self.batch_classify_verbose(email_list, categories=categories)
        return result["results"]

    async def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 1000,
        timeout: float = 45.0,
    ) -> tuple[str, str, str, int, int]:
        """Send a generic chat prompt to the best available provider.

        Returns (response_text, provider_name, model, tokens_in, tokens_out).
        """
        ranked = self._ranked_providers()
        if ranked and not _llm_spend_tracker.within_budget(settings.DAILY_LLM_BUDGET):
            logger.warning(
                "Daily LLM budget $%.2f exceeded (spent $%.4f). Skipping chat call.",
                settings.DAILY_LLM_BUDGET,
                _llm_spend_tracker.daily_spend,
            )
            ranked = []
        if not ranked:
            raise RuntimeError("No LLM providers available")
        last_error: Exception | None = None
        for provider in ranked:
            result, error = await self._call_with_retry(
                provider,
                lambda p: self._provider_http_call(
                    p, user_prompt, timeout=timeout, max_tokens=max_tokens, system_override=system_prompt
                ),
                provider_label=" chat",
            )
            if error is None:
                raw, tokens_in, tokens_out = result
                await _llm_spend_tracker.add_call(user_id=self._user_id)
                return raw, provider.name, provider.model, tokens_in, tokens_out
            last_error = error
        raise last_error or RuntimeError("All LLM providers failed")


LLMClient = MultiLLMClient

llm_client = MultiLLMClient()
