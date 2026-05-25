"""
Token bucket rate limiter for Groq API.

Implements per-model RPM/TPM limits based on Groq's rate limits table.
"""

import asyncio
import logging
import threading
import time
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ModelLimits:
    """Rate limits for a specific model."""

    requests_per_minute: int
    tokens_per_minute: int
    requests_per_day: int = 0
    tokens_per_day: int = 0


GROQ_LIMITS: dict[str, ModelLimits] = {
    "allam-2-7b": ModelLimits(
        requests_per_minute=30, tokens_per_minute=6000, requests_per_day=7000, tokens_per_day=500000
    ),
    "groq/compound": ModelLimits(requests_per_minute=30, tokens_per_minute=70000),
    "groq/compound-mini": ModelLimits(requests_per_minute=30, tokens_per_minute=70000),
    "llama-3.1-8b-instant": ModelLimits(
        requests_per_minute=30, tokens_per_minute=6000, requests_per_day=14400, tokens_per_day=500000
    ),
    "llama-3.3-70b-versatile": ModelLimits(
        requests_per_minute=30, tokens_per_minute=12000, requests_per_day=1000, tokens_per_day=100000
    ),
    "meta-llama/llama-4-scout-17b-16e-instruct": ModelLimits(
        requests_per_minute=30, tokens_per_minute=30000, requests_per_day=1000, tokens_per_day=500000
    ),
    "meta-llama/llama-prompt-guard-2-22m": ModelLimits(
        requests_per_minute=30, tokens_per_minute=15000, requests_per_day=14400, tokens_per_day=500000
    ),
    "meta-llama/llama-prompt-guard-2-86m": ModelLimits(
        requests_per_minute=30, tokens_per_minute=15000, requests_per_day=14400, tokens_per_day=500000
    ),
    "openai/gpt-oss-120b": ModelLimits(
        requests_per_minute=30, tokens_per_minute=8000, requests_per_day=1000, tokens_per_day=200000
    ),
    "openai/gpt-oss-20b": ModelLimits(
        requests_per_minute=30, tokens_per_minute=8000, requests_per_day=1000, tokens_per_day=200000
    ),
    "openai/gpt-oss-safeguard-20b": ModelLimits(
        requests_per_minute=30, tokens_per_minute=8000, requests_per_day=1000, tokens_per_day=200000
    ),
    "qwen/qwen3-32b": ModelLimits(
        requests_per_minute=60, tokens_per_minute=6000, requests_per_day=1000, tokens_per_day=500000
    ),
    "llama-3.3-70b-instruct": ModelLimits(
        requests_per_minute=30, tokens_per_minute=12000, requests_per_day=1000, tokens_per_day=100000
    ),  # scaleway model fallback
    "llama-3.1-70b-versatile": ModelLimits(
        requests_per_minute=30, tokens_per_minute=12000, requests_per_day=1000, tokens_per_day=100000
    ),
    "llama-3.2-90b-instruct": ModelLimits(
        requests_per_minute=30, tokens_per_minute=12000, requests_per_day=1000, tokens_per_day=100000
    ),
}


class GroqRateLimiter:
    """
    Token bucket rate limiter for Groq API.

    Tracks RPM and TPM per-model with daily limits.
    Uses a sliding window approach with a background thread to reset buckets.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._lock = threading.Lock()
        self._buckets: dict[str, dict] = {}
        self._minute_start = time.time()
        self._day_start = time.time()
        self._stop_event = threading.Event()
        self._reset_thread: threading.Thread | None = None
        if api_key:
            self._start_reset_thread()

    def _start_reset_thread(self) -> None:
        self._reset_thread = threading.Thread(target=self._reset_loop, daemon=True)
        self._reset_thread.start()

    def _reset_loop(self) -> None:
        while not self._stop_event.is_set():
            time.sleep(30)
            self._maybe_reset_buckets()

    def _maybe_reset_buckets(self) -> None:
        now = time.time()
        with self._lock:
            if now - self._minute_start >= 60:
                for bucket in self._buckets.values():
                    bucket["rpm_used"] = 0
                    bucket["tpm_used"] = 0
                self._minute_start = now
            if now - self._day_start >= 86400:
                for bucket in self._buckets.values():
                    bucket["rpd_used"] = 0
                    bucket["tpd_used"] = 0
                self._day_start = now

    def _get_bucket(self, model: str) -> dict:
        if model not in self._buckets:
            limits = GROQ_LIMITS.get(model, ModelLimits(requests_per_minute=30, tokens_per_minute=6000))
            self._buckets[model] = {
                "limits": limits,
                "rpm_used": 0,
                "tpm_used": 0,
                "rpd_used": 0,
                "tpd_used": 0,
            }
        return self._buckets[model]

    async def acquire(
        self,
        model: str,
        estimated_tokens: int = 100,
        timeout: float = 30.0,
    ) -> bool:
        """
        Acquire permission to make a request.

        Args:
            model: Model identifier
            estimated_tokens: Estimated tokens for this request (for TPM tracking)
            timeout: Maximum seconds to wait for rate limit

        Returns:
            True if acquired, False if timeout
        """
        if not self.api_key:
            return False

        start_time = time.time()
        while True:
            with self._lock:
                bucket = self._get_bucket(model)
                limits = bucket["limits"]

                rpm_available = limits.requests_per_minute - bucket["rpm_used"]
                tpm_available = limits.tokens_per_minute - bucket["tpm_used"]

                rpd_ok = limits.requests_per_day == 0 or bucket["rpd_used"] < limits.requests_per_day
                tpd_ok = limits.tokens_per_day == 0 or bucket["tpd_used"] < limits.tokens_per_day

                if rpm_available > 0 and tpm_available >= estimated_tokens and rpd_ok and tpd_ok:
                    bucket["rpm_used"] += 1
                    bucket["tpm_used"] += estimated_tokens
                    if limits.requests_per_day > 0:
                        bucket["rpd_used"] += 1
                    if limits.tokens_per_day > 0:
                        bucket["tpd_used"] += estimated_tokens
                    logger.debug(
                        "Groq rate limit acquired for %s (rpm:%d/%d tpm:%d/%d)",
                        model,
                        bucket["rpm_used"],
                        limits.requests_per_minute,
                        bucket["tpm_used"],
                        limits.tokens_per_minute,
                    )
                    return True

            if time.time() - start_time >= timeout:
                bucket = self._get_bucket(model)
                limits = bucket["limits"]
                logger.warning(
                    "Groq rate limit timeout for %s (rpm:%d/%d tpm:%d/%d)",
                    model,
                    bucket["rpm_used"],
                    limits.requests_per_minute,
                    bucket["tpm_used"],
                    limits.tokens_per_minute,
                )
                return False

            wait_time = min(1.0, timeout - (time.time() - start_time))
            await asyncio.sleep(wait_time)

    def get_status(self, model: str) -> dict:
        bucket = self._get_bucket(model)
        limits = bucket["limits"]
        return {
            "model": model,
            "rpm_used": bucket["rpm_used"],
            "rpm_limit": limits.requests_per_minute,
            "tpm_used": bucket["tpm_used"],
            "tpm_limit": limits.tokens_per_minute,
            "rpd_used": bucket["rpd_used"],
            "rpd_limit": limits.requests_per_day,
            "tpd_used": bucket["tpd_used"],
            "tpd_limit": limits.tokens_per_day,
        }

    def get_available(self, model: str) -> dict:
        bucket = self._get_bucket(model)
        limits = bucket["limits"]
        return {
            "requests_per_minute": max(0, limits.requests_per_minute - bucket["rpm_used"]),
            "tokens_per_minute": max(0, limits.tokens_per_minute - bucket["tpm_used"]),
            "requests_per_day": max(0, limits.requests_per_day - bucket["rpd_used"])
            if limits.requests_per_day
            else None,
            "tokens_per_day": max(0, limits.tokens_per_day - bucket["tpd_used"]) if limits.tokens_per_day else None,
        }

    def stop(self) -> None:
        self._stop_event.set()
        if self._reset_thread:
            self._reset_thread.join(timeout=2.0)


_groq_limiter: GroqRateLimiter | None = None
_user_limiters: dict[str, GroqRateLimiter] = {}


def get_groq_limiter(user_id: str | None = None, api_key: str | None = None) -> GroqRateLimiter | None:
    """
    Get or create a GroqRateLimiter.

    If user_id provided: returns per-user limiter (creates one if api_key given, else None if not cached).
    If no user_id: returns global limiter from settings.GROQ_API_KEY.
    """
    if user_id:
        if user_id not in _user_limiters:
            if api_key:
                _user_limiters[user_id] = GroqRateLimiter(api_key)
            else:
                return None
        return _user_limiters[user_id]

    global _groq_limiter
    if _groq_limiter is None and settings.GROQ_API_KEY:
        _groq_limiter = GroqRateLimiter(settings.GROQ_API_KEY)
    if _groq_limiter is None:
        raise RuntimeError("GROQ_API_KEY not configured")
    return _groq_limiter
