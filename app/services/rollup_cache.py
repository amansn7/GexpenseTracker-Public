"""Redis-backed cache for period rollups.

Stores freshness markers in Redis. When a marker exists, the rollup is
served from Postgres (fast PK lookup), avoiding expensive recomputes.
Falls back gracefully when Redis is unavailable.
"""

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_MARKER_PREFIX = "rollup:marker:"
_DEFAULT_TTL = 300


class RollupCache:
    def __init__(self):
        self._redis: Any = None
        self._available = False

    async def _connect(self):
        if self._redis is not None:
            return
        url = os.getenv("REDIS_URL")
        if not url:
            return
        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(url, decode_responses=True)
            await self._redis.ping()
            self._available = True
            logger.info("RollupCache connected to Redis")
        except Exception:
            self._available = False
            logger.warning("RollupCache: Redis unavailable, falling back to no-op")

    async def get(self, user_id: str, period_type: str, period_key: str) -> str | None:
        await self._connect()
        if not self._available:
            return None
        key = f"{_MARKER_PREFIX}{user_id}:{period_type}:{period_key}"
        return await self._redis.get(key)

    async def set(self, user_id: str, period_type: str, period_key: str, rollup_id: str):
        await self._connect()
        if not self._available:
            return
        key = f"{_MARKER_PREFIX}{user_id}:{period_type}:{period_key}"
        await self._redis.setex(key, _DEFAULT_TTL, rollup_id)

    async def invalidate_user(self, user_id: str):
        await self._connect()
        if not self._available:
            return
        pattern = f"{_MARKER_PREFIX}{user_id}:*"
        cursor = 0
        while True:
            cursor, keys = await self._redis.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                await self._redis.delete(*keys)
            if cursor == 0:
                break

    async def close(self):
        if self._redis:
            await self._redis.close()
            self._redis = None
            self._available = False


rollup_cache = RollupCache()
