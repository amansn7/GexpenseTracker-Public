"""Rate limiting middleware using in-memory token bucket."""

import time


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


rate_limiter = RateLimiter()

RATE_LIMITS = {
    "/api/sync/trigger": (1, 60),
    "/api/auth/google": (5, 60),
    "/api/auth/callback": (5, 60),
    "/api/transactions/bulk": (10, 60),
    "/api/auth/logout": (5, 60),
    "/api/sync/backfill-bodies": (5, 300),
    "/api/admin/reset-my-data": (3, 3600),
    "/api/account/schedule-deletion": (3, 3600),
    "/api/review/reprocess-all": (5, 300),
    "/api/account/ai-services": (10, 60),
    "/api/auth/verify-2fa": (5, 60),
    "/api/emails/retrain": (10, 60),
}

RATE_LIMIT_PREFIXES = {
    "/api/transactions/": (30, 60),
    "/api/review/": (20, 60),
}
