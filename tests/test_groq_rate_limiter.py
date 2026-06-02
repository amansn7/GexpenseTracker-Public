import inspect
import time

import pytest

import app.classifier.groq_rate_limiter as _mod
from app.classifier.groq_rate_limiter import GroqRateLimiter, _user_limiters, get_groq_limiter


def setup_function():
    _user_limiters.clear()
    _mod._groq_limiter = None


def test_get_groq_limiter_returns_none_when_no_key_cached():
    result = get_groq_limiter(user_id="user-no-key")
    assert result is None


def test_get_groq_limiter_creates_limiter_with_api_key():
    limiter = get_groq_limiter(user_id="user-with-key", api_key="test-key")
    assert limiter is not None
    assert limiter.api_key == "test-key"
    limiter.stop()


def test_get_groq_limiter_returns_cached_on_repeat_call():
    limiter1 = get_groq_limiter(user_id="user-cached", api_key="key1")
    limiter2 = get_groq_limiter(user_id="user-cached")
    assert limiter1 is limiter2
    limiter1.stop()


def test_get_groq_limiter_returns_none_when_no_global_key():
    _mod._groq_limiter = None
    result = get_groq_limiter()
    assert result is None


def test_maybe_reset_buckets_resets_rpm_after_minute():
    limiter = GroqRateLimiter("key")
    bucket = limiter._get_bucket("llama-3.3-70b-versatile")
    bucket["rpm_used"] = 10
    limiter._minute_start = time.time() - 61
    limiter._maybe_reset_buckets()
    assert bucket["rpm_used"] == 0
    limiter.stop()


def test_acquire_is_coroutine_function():
    from app.classifier.groq_rate_limiter import GroqRateLimiter

    limiter = GroqRateLimiter("key")
    assert inspect.iscoroutinefunction(limiter.acquire)
    limiter.stop()


@pytest.mark.asyncio
async def test_acquire_returns_true_when_quota_available():
    from app.classifier.groq_rate_limiter import GroqRateLimiter

    limiter = GroqRateLimiter("key")
    result = await limiter.acquire("llama-3.3-70b-versatile", estimated_tokens=10, timeout=5.0)
    assert result is True
    limiter.stop()


@pytest.mark.asyncio
async def test_acquire_returns_false_when_quota_exhausted():
    from app.classifier.groq_rate_limiter import GROQ_LIMITS, GroqRateLimiter

    limiter = GroqRateLimiter("key")
    bucket = limiter._get_bucket("llama-3.3-70b-versatile")
    bucket["rpm_used"] = GROQ_LIMITS["llama-3.3-70b-versatile"].requests_per_minute
    result = await limiter.acquire("llama-3.3-70b-versatile", timeout=0.1)
    assert result is False
    limiter.stop()
