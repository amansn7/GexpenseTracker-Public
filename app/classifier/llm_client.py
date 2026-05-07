"""
Multi-provider LLM client with automatic rate-limit fallback.

Priority order (best error-rate first, then configured order):
  OpenRouter - Google Gemini - Grok (xAI) - Scaleway

When a provider returns 429 it is marked rate-limited for `Retry-After`
seconds (default 60 s).  The next available provider is tried automatically.
If all providers are exhausted, an alert is added and an exception is raised.
"""
import json
import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a financial email classifier for an Indian user. "
    "Respond ONLY with a single valid JSON object. No explanation, no markdown, no code blocks."
)

# Full classify + extract - used during initial sync / reclassify
_PRE_EXTRACTION_BLOCK = """
PRE-EXTRACTED FACTS (regex-based - verify against email; override if contradicted):
{lines}
"""


def _build_pre_extraction_block(pre: dict) -> str:
    lines = []
    if pre.get("amount") is not None:
        lines.append(f"- Amount: {pre['amount']} INR")
    if pre.get("date"):
        lines.append(f"- Date: {pre['date']}")
    return "\n".join(lines)
    if pre.get("direction") not in (None, "unknown"):
        lines.append(f"- Direction: {pre['direction']}")
    if pre.get("mode") not in (None, "unknown"):
        lines.append(f"- Mode: {pre['mode']}")
    if pre.get("merchant"):
        lines.append(f"- Merchant: {pre['merchant']}")
    if pre.get("category_hint"):
        lines.append(f"- Category hint: {pre['category_hint']}")
    if not lines:
        return ""
    return _PRE_EXTRACTION_BLOCK.format(lines="\n".join(lines))


_USER_TEMPLATE = """Classify this financial email and extract transaction details.

CLASSIFICATION RULES:
- "expense"  = money going OUT: debited, charged, paid, purchase, bill payment, subscription, EMI, fee
- "income"   = money coming IN: credited, received, salary, cashback, refund, reversal, reward points redeemed
- "ignore"   = no real transaction: OTP, login alert, low-balance warning, statement ready, promotional offer,
               delivery/shipment status, password reset, newsletter, KYC reminder

REFUND / REVERSAL - always "income" (money returning to you)

From: {sender}
Subject: {subject}
Body: {body_snippet}

EXTRACTION RULES:
- amount    : INR number, no currency symbols or commas. Found in subject ("Rs.488.00") or body. null if absent.
- merchant  : payee / store / service - NOT the bank itself. Clean raw merchant codes:
              "WWW SWIGGY IN" - "Swiggy", "AMZN MKTP IN" - "Amazon", "ZOMATO*ORDER" - "Zomato",
              "NETFLIX.COM" - "Netflix", "SPOTIFY" - "Spotify". null if no identifiable payee.
- category: one of - {categories}
- txn_date  : actual payment date from body (YYYY-MM-DD). NOT the email received date. null if absent.
- confidence: 0.9–1.0 for clear bank/UPI alerts · 0.7–0.9 for merchant emails · 0.5–0.7 for ambiguous

COMMON INDIAN BANK PATTERNS:
  "Rs.X debited from your account/card ... towards MERCHANT" - expense
  "INR X credited to your account" - income
  "Rs.X refunded / reversed to your account" - income, category=Refund
  "You have paid Rs.X to MERCHANT via UPI" - expense, category=UPI Payment
  "X debited from a/c XXXX" - expense (find merchant in body)
  "Cashback of Rs.X credited" - income, category=Income

JSON only: {{"label":"expense|income|ignore","amount":0.00,"merchant":"name or null","category":"category or null","txn_date":"YYYY-MM-DD or null","confidence":0.0}}"""


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class LLMClassification:
    label: str
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    txn_date: Optional[str]
    confidence: float


@dataclass
class _Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    extra_headers: dict = field(default_factory=dict)
    rate_limited_until: float = field(default=0.0)
    rate_limit_count: int = field(default=0)   # cumulative hits - used for persistent demotion
    success_count: int = field(default=0)
    fail_count: int = field(default=0)

    @property
    def available(self) -> bool:
        return bool(self.api_key) and time.time() >= self.rate_limited_until

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


# ── Parser ────────────────────────────────────────────────────────────────────

import re


def _extract_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            elif text.startswith("xml"):
                text = text[3:]
    text = text.strip()
    text = re.sub(r"^```.*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    if text.startswith("'") and text.endswith("'"):
        text = text[1:-1]
    brace_open = text.find("{")
    brace_close = text.rfind("}")
    if brace_open >= 0 and brace_close > brace_open:
        text = text[brace_open : brace_close + 1]
    return text


def _parse_response(raw: str) -> LLMClassification:
    cleaned = _extract_json(raw)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse failed, attempting repair: %s", exc)
        fixed = re.sub(r",(\s*[}\]])", r"\1", cleaned)
        fixed = re.sub(r'([{,]\s*)"(\w+)":\s*"', r'\1"\2": "', fixed)
        try:
            data = json.loads(fixed)
        except json.JSONDecodeError:
            raise ValueError(f"Cannot parse response: {cleaned[:200]}")
    return LLMClassification(
        label=data.get("label", "ignore"),
        amount=float(data["amount"]) if data.get("amount") is not None else None,
        merchant=data.get("merchant"),
        category=data.get("category"),
        txn_date=data.get("txn_date"),
        confidence=float(data.get("confidence", 0.5)),
    )


# ── Multi-provider client ─────────────────────────────────────────────────────

class MultiLLMClient:
    def __init__(self, user_id: Optional[str] = None):
        self._providers: List[_Provider] = []
        self._user_id = user_id
        self._build_providers()

    def _build_providers(self) -> None:
        """
        Register providers in default priority order (lowest score = tried first).
        Default order: Google - Grok - Scaleway - OpenRouter.
        OpenRouter starts last because it has the tightest free-tier rate limits.
        At runtime _ranked_providers() re-sorts by priority_score so any provider
        that accumulates rate-limit hits falls further down automatically.
        """
        if settings.GOOGLE_AI_API_KEY:
            self._providers.append(_Provider(
                name="google",
                base_url="https://generativelanguage.googleapis.com/v1beta/openai",
                api_key=settings.GOOGLE_AI_API_KEY,
                model="gemini-2.0-flash-exp",
            ))
        if settings.GROK_API_KEY:
            self._providers.append(_Provider(
                name="grok",
                base_url="https://api.x.ai/v1",
                api_key=settings.GROK_API_KEY,
                model="grok-3-mini",
            ))
        if settings.GROQ_API_KEY:
            self._providers.append(_Provider(
                name="groq",
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
                model="llama-3.3-70b-versatile",
            ))
        if settings.SCALEWAY_API_KEY:
            self._providers.append(_Provider(
                name="scaleway",
                base_url="https://api.scaleway.ai/v1",
                api_key=settings.SCALEWAY_API_KEY,
                model="llama-3.3-70b-instruct",
            ))
        if settings.OPENROUTER_API_KEY:
            self._providers.append(_Provider(
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
            self._providers.append(_Provider(
                name="cloudflare",
                base_url=f"https://api.cloudflare.com/client/v4/accounts/{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1",
                api_key=settings.CLOUDFLARE_API_TOKEN,
                model="@cf/meta/llama-3.1-8b-instruct",
            ))

    def _ranked_providers(self) -> List[_Provider]:
        """
        Available providers sorted by priority_score ascending (best first).
        priority_score = (rate_limit_count * 0.25) + error_rate
        - each rate-limit hit persistently demotes the provider by 0.25 points.
        """
        return sorted(
            [p for p in self._providers if p.available],
            key=lambda p: p.priority_score,
        )

    def get_status(self) -> List[dict]:
        now = time.time()
        # Return sorted by current priority so UI shows actual dispatch order
        ranked_names = [p.name for p in self._ranked_providers()]
        all_providers = sorted(
            self._providers,
            key=lambda p: ranked_names.index(p.name) if p.name in ranked_names else 999,
        )
        return [
            {
                "name": p.name,
                "available": p.available,
                "rate_limited_secs": max(0, round(p.rate_limited_until - now)) if p.rate_limited_until > now else 0,
                "rate_limit_count": p.rate_limit_count,
                "priority_score": round(p.priority_score, 3),
                "success": p.success_count,
                "fail": p.fail_count,
                "error_rate": round(p.error_rate, 3),
            }
            for p in all_providers
        ]

    _DEFAULT_CATEGORIES = (
        "Food, Groceries, Shopping, Travel, Transport, Utilities, Entertainment, "
        "Healthcare, Education, UPI Payment, Bank Transfer, EMI, Rent, Refund, Income, Other"
    )

    async def classify(
        self, sender: str, subject: str, body_snippet: str,
        categories: Optional[str] = None,
        pre_extraction: Optional[dict] = None,
    ) -> LLMClassification:
        ranked = self._ranked_providers()
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
            sender=sender, subject=subject, body_snippet=body_snippet,
            categories=categories or self._DEFAULT_CATEGORIES,
        )
        if pre_extraction:
            prompt = _build_pre_extraction_block(pre_extraction) + prompt
        last_error: Optional[Exception] = None
        for provider in ranked:
            try:
                result = await self._call_provider_raw(provider, prompt)
                provider.success_count += 1
                return result
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    retry_after = int(exc.response.headers.get("Retry-After", "60"))
                    provider.mark_rate_limited(retry_after)
                    last_error = exc
                    continue
                provider.fail_count += 1
                logger.error(
                    "Provider '%s' HTTP %d: %s",
                    provider.name, exc.response.status_code, exc.response.text[:200],
                )
                last_error = exc
                continue
            except Exception as exc:
                provider.fail_count += 1
                logger.error("Provider '%s' error: %s", provider.name, exc)
                last_error = exc
                continue

        raise last_error or RuntimeError("All LLM providers failed")

    async def _call_provider_raw(
        self, provider: _Provider, user_prompt: str
    ) -> LLMClassification:
        result, _ = await self._call_provider_verbose(provider, user_prompt)
        return result

    async def _call_provider_verbose(
        self, provider: _Provider, user_prompt: str
    ) -> tuple:
        """Returns (LLMClassification, raw_response_str)."""
        if provider.name == "groq":
            try:
                from app.classifier.groq_rate_limiter import get_groq_limiter

                limiter = get_groq_limiter(user_id=self._user_id, api_key=provider.api_key)
                if limiter is not None and not await limiter.acquire(provider.model, estimated_tokens=150, timeout=30.0):
                    provider.mark_rate_limited(retry_after=60)
                    provider.fail_count += 1
                    raise httpx.HTTPStatusError(
                        "Groq rate limit exceeded",
                        request=httpx.Request("POST", provider.base_url or "https://api.groq.com/openai/v1/chat/completions"),
                        response=httpx.Response(429),
                    )
            except httpx.HTTPStatusError:
                raise
            except Exception as e:
                logger.warning("Groq rate limiter error: %s", e)

        payload = {
            "model": str(provider.model),
            "messages": [
                {"role": "system", "content": str(_SYSTEM)},
                {"role": "user", "content": str(user_prompt)},
            ],
            "temperature": 0.1,
            "max_tokens": 500,
        }
        # Ensure api_key is valid string for headers
        api_key_val = provider.api_key
        if hasattr(api_key_val, 'decode'):
            api_key_val = api_key_val.decode('utf-8')
        api_key_str = str(api_key_val) if api_key_val else ""
        
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
        async with httpx.AsyncClient(timeout=30.0, headers=headers) as client:
            response = await client.post(
                base_url + "/chat/completions",
                json=payload,
            )
            response.raise_for_status()

        raw = response.json()["choices"][0]["message"]["content"].strip()
        logger.debug("Raw LLM response: %s", raw[:500])
        return _parse_response(raw), raw

    async def classify_verbose(
        self, sender: str, subject: str, body_snippet: str,
        categories: Optional[str] = None,
        pre_extraction: Optional[dict] = None,
    ) -> dict:
        """Like classify() but also returns prompt, raw response, and provider name."""
        ranked = self._ranked_providers()
        if not ranked:
            raise RuntimeError("No LLM providers available")

        prompt = _USER_TEMPLATE.format(
            sender=sender, subject=subject, body_snippet=body_snippet,
            categories=categories or self._DEFAULT_CATEGORIES,
        )
        if pre_extraction:
            prompt = _build_pre_extraction_block(pre_extraction) + prompt
        last_error: Optional[Exception] = None
        for provider in ranked:
            try:
                result, raw = await self._call_provider_verbose(provider, prompt)
                provider.success_count += 1
                return {"result": result, "provider": provider.name, "model": provider.model,
                        "prompt": prompt, "raw_response": raw}
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    provider.mark_rate_limited(int(exc.response.headers.get("Retry-After", "60")))
                    last_error = exc
                    continue
                provider.fail_count += 1
                last_error = exc
                continue
            except Exception as exc:
                logger.warning("Provider %s failed: %s", provider.name, str(exc)[:200])
                provider.fail_count += 1
                last_error = exc
                continue
        raise last_error or RuntimeError("All LLM providers failed")


llm_client = MultiLLMClient()
LLMClient = MultiLLMClient


_KNOWN_BASE_URLS: dict[str, str] = {
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "grok": "https://api.x.ai/v1",
    "scaleway": "https://api.scaleway.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1",
}


def build_user_client(user_id: str, provider: str, base_url: Optional[str], api_key: str, model_id: str) -> MultiLLMClient:
    """Return a MultiLLMClient with the user's DB-configured provider first, env-var providers as fallback."""
    if not api_key:
        logger.warning("No API key for provider %r - skipping user provider", provider)
        return llm_client
    
    provider_str = str(provider) if provider else ""
    resolved_url = str(base_url) if base_url else None
    if not resolved_url:
        resolved_url = _KNOWN_BASE_URLS.get(provider_str)
    # For Cloudflare, substitute account_id from env if user didn't provide custom URL
    if provider_str == "cloudflare" and not base_url and settings.CLOUDFLARE_ACCOUNT_ID:
        resolved_url = f"https://api.cloudflare.com/client/v4/accounts/{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1"
    if not resolved_url:
        logger.warning("No base_url for provider %r and not in known list - using env-var client only", provider_str)
        return llm_client

    client = MultiLLMClient(user_id=user_id)
    user_provider = _Provider(name=provider_str, base_url=str(resolved_url), api_key=str(api_key), model=str(model_id))
    client._providers = [user_provider] + [p for p in client._providers if p.name != provider_str]
    return client
