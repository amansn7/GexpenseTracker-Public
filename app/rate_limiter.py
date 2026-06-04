"""Rate limiting middleware — in-memory fallback or Redis-backed sliding window."""

import logging
import time
import uuid

from app.config import settings

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple in-memory rate limiter using token bucket algorithm."""

    def __init__(self):
        self._buckets: dict[str, tuple[int, float]] = {}

    def _get_key(self, identifier: str, endpoint: str) -> str:
        return f"{identifier}:{endpoint}"

    def is_allowed(self, identifier: str, endpoint: str, max_requests: int, window_seconds: int) -> bool:
        key = self._get_key(identifier, endpoint)
        now = time.time()

        if key in self._buckets:
            count, window_start = self._buckets[key]
            if now - window_start > window_seconds:
                self._buckets[key] = (1, now)
                return True
            if count >= max_requests:
                return False
            self._buckets[key] = (count + 1, window_start)
            return True
        else:
            self._buckets[key] = (1, now)
            return True

    def cleanup(self, max_age_seconds: int = 3600):
        """Remove stale buckets older than max_age_seconds."""
        now = time.time()
        stale_keys = [key for key, (_, window_start) in self._buckets.items() if now - window_start > max_age_seconds]
        for key in stale_keys:
            del self._buckets[key]


class RedisRateLimiter:
    """Redis-backed sliding window rate limiter using sorted sets.

    Falls open (allows request) when Redis is unavailable.
    Keys auto-expire via EXPIRE so cleanup() is a no-op.
    """

    def __init__(self):
        self._redis = None
        self._available = False
        self._hits = 0
        self._misses = 0
        self._violations = 0

    def _get_redis(self):
        if not self._available and self._redis is None:
            url = settings.REDIS_URL
            if not url:
                return None
            try:
                import redis as sync_redis
                self._redis = sync_redis.from_url(url, decode_responses=True)
                self._redis.ping()
                self._available = True
            except Exception as exc:
                logger.warning("Redis rate limiter unavailable: %s", exc)
                self._available = False
        return self._redis if self._available else None

    def is_allowed(self, identifier: str, endpoint: str, max_requests: int, window_seconds: int) -> bool:
        r = self._get_redis()
        if r is None:
            self._misses += 1
            return True
        key = f"ratelimit:{identifier}:{endpoint}"
        now = time.time()
        cutoff = now - window_seconds
        try:
            pipe = r.pipeline()
            pipe.zremrangebyscore(key, 0, cutoff)
            pipe.zcard(key)
            pipe.zadd(key, {str(uuid.uuid4()): now})
            pipe.expire(key, window_seconds + 1)
            _, count, _, _ = pipe.execute()
            if count < max_requests:
                self._hits += 1
                return True
            self._violations += 1
            return False
        except Exception as exc:
            logger.error("Redis rate limiter error, failing open: %s", exc)
            self._available = False
            self._redis = None
            self._misses += 1
            return True

    def get_metrics(self) -> dict:
        total = self._hits + self._violations
        return {
            "hits": self._hits,
            "misses": self._misses,
            "violations": self._violations,
            "block_rate": round(self._violations / total * 100, 1) if total > 0 else 0,
        }

    def cleanup(self, max_age_seconds: int = 3600):
        pass


# Singleton selection — Redis when available, otherwise in-memory fallback
_redis_url = settings.REDIS_URL
if _redis_url:
    rate_limiter = RedisRateLimiter()
else:
    rate_limiter = RateLimiter()

RATE_LIMITS = {
    "/api/sync/trigger": (1, 60),
    "/api/sync/progress": (80, 60),
    "/api/auth/google": (5, 60),
    "/api/auth/callback": (5, 60),
    "/api/transactions/bulk": (10, 60),
    "/api/auth/logout": (5, 60),
    "/api/sync/backfill-bodies": (5, 300),
    "/api/sync/trigger-backfill-bodies": (5, 300),
    "/api/admin/reset-my-data": (3, 3600),
    "/api/account/schedule-deletion": (3, 3600),
    "/api/review/reprocess-all": (5, 300),
    "/api/account/ai-services": (10, 60),
    "/api/auth/verify-2fa": (5, 60),
    "/api/emails/retrain": (10, 60),
    "/health": (30, 60),
}

RATE_LIMIT_PREFIXES = {
    "/api/transactions/": (30, 60),
    "/api/review/": (20, 60),
    "/api/settings/": (30, 60),
    "/api/stats/": (60, 60),
    "/api/insights/": (10, 60),
    "/api/merchants/": (20, 60),
    "/api/budgets/": (20, 60),
    "/api/goals": (20, 60),
    "/api/debt/": (20, 60),
    "/api/duplicates/": (20, 60),
    "/api/emails/": (20, 60),
    "/api/recurring/": (20, 60),
    "/api/filter/": (20, 60),
    "/api/rules/": (20, 60),
    "/api/reconciliation/": (10, 60),
    "/api/cleanup/": (10, 60),
    "/api/onboarding/": (10, 60),
    "/api/admin/": (10, 60),
    "/api/merchant_aliases/": (20, 60),
    "/api/account/": (20, 60),
    "/api/auth/": (10, 60),
    "/api/sync/": (10, 60),
    "/api/health/": (30, 60),
}
