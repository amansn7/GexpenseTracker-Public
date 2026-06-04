import asyncio
import hashlib
import json
import logging
import time
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from app.config import settings

logger = logging.getLogger(__name__)

_IDEMPOTENCY_MAX_SIZE = 10000
_IDEMPOTENCY_TTL_SECONDS = 3600


class TaskStatus(StrEnum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Task:
    __slots__ = (
        "id",
        "type",
        "user_id",
        "status",
        "payload",
        "result",
        "created_at",
        "started_at",
        "completed_at",
        "error",
    )

    def __init__(
        self,
        task_id: str,
        task_type: str,
        user_id: str,
        payload: dict,
    ):
        self.id = task_id
        self.type = task_type
        self.user_id = user_id
        self.status = TaskStatus.pending
        self.payload = payload
        self.result: dict | None = None
        self.created_at = datetime.now(UTC)
        self.started_at: datetime | None = None
        self.completed_at: datetime | None = None
        self.error: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "user_id": self.user_id,
            "status": self.status.value,
            "payload": self.payload,
            "result": self.result,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error": self.error,
        }


def _payload_hash(task_type: str, user_id: str, payload: dict) -> str:
    stable_payload = {k: v for k, v in payload.items() if k != "trigger"}
    raw = json.dumps({"type": task_type, "user_id": user_id, "payload": stable_payload}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class TaskQueue:
    def __init__(self, maxsize: int = 0, worker_count: int = 3):
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._tasks: dict[str, Task] = {}
        self._user_tasks: dict[str, list[str]] = {}
        self._idempotency: dict[str, str] = {}
        self._idempotency_timestamps: dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._running = False
        self._handlers: dict[str, Any] = {}
        self._worker_count = worker_count
        self._running_users: set[str] = set()

    @property
    def worker_count(self) -> int:
        return self._worker_count

    async def pending_count(self) -> int:
        return self._queue.qsize()

    async def connect(self):
        pass

    async def disconnect(self):
        pass

    def register_handler(self, task_type: str, handler):
        self._handlers[task_type] = handler

    def _can_start_task(self, task: Task) -> bool:
        if task.type == "sync":
            return task.user_id not in self._running_users
        return True

    def _mark_user_running(self, task: Task):
        if task.type == "sync":
            self._running_users.add(task.user_id)

    def _mark_user_done(self, task: Task):
        if task.type == "sync":
            self._running_users.discard(task.user_id)

    async def enqueue(self, task_type: str, user_id: str, payload: dict) -> str | None:
        idem_key = _payload_hash(task_type, user_id, payload)
        async with self._lock:
            existing = self._idempotency.get(idem_key)
            if existing:
                task = self._tasks.get(existing)
                if task and task.status in (TaskStatus.pending, TaskStatus.running):
                    logger.info("Idempotent skip: %s already %s", existing, task.status.value)
                    return existing
                if task:
                    logger.info("Idempotent key cleared: %s is %s, allowing new task", existing, task.status.value)
                del self._idempotency[idem_key]

            task_id = str(uuid4())
            task = Task(task_id, task_type, user_id, payload)
            self._tasks[task_id] = task
            self._idempotency[idem_key] = task_id
            self._idempotency_timestamps[idem_key] = time.time()

            if len(self._idempotency) > _IDEMPOTENCY_MAX_SIZE:
                self._prune_idempotency()

            user_list = self._user_tasks.setdefault(user_id, [])
            user_list.append(task_id)
            if len(user_list) > 100:
                old_ids = user_list[:-80]
                del user_list[:-80]
                for old_id in old_ids:
                    self._tasks.pop(old_id, None)

        await self._queue.put(task_id)
        logger.info("Enqueued task %s (type=%s, user=%s)", task_id, task_type, user_id)
        return task_id

    async def get_status(self, task_id: str) -> dict | None:
        task = self._tasks.get(task_id)
        return task.to_dict() if task else None

    async def get_tasks(self, user_id: str, limit: int = 20) -> list[dict]:
        task_ids = self._user_tasks.get(user_id, [])
        recent = task_ids[-limit:]
        result = []
        for tid in reversed(recent):
            task = self._tasks.get(tid)
            if task:
                result.append(task.to_dict())
        return result

    async def worker_loop(self):
        self._running = True
        logger.info("Task queue worker started (%d workers)", self._worker_count)
        workers = [asyncio.create_task(self._worker(i)) for i in range(self._worker_count)]
        try:
            await asyncio.gather(*workers, return_exceptions=True)
        finally:
            self._running = False

    async def _worker(self, worker_id: int):
        logger.info("Worker %d started", worker_id)
        while self._running:
            try:
                task_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except TimeoutError:
                continue

            task = self._tasks.get(task_id)
            if not task:
                self._queue.task_done()
                continue

            if not self._can_start_task(task):
                await self._queue.put(task_id)
                await asyncio.sleep(0.5)
                self._queue.task_done()
                continue

            handler = self._handlers.get(task.type)
            if not handler:
                task.status = TaskStatus.failed
                task.error = f"No handler registered for task type: {task.type}"
                task.completed_at = datetime.now(UTC)
                logger.error("Task %s failed: %s", task_id, task.error)
                self._queue.task_done()
                continue

            task.status = TaskStatus.running
            task.started_at = datetime.now(UTC)
            self._mark_user_running(task)
            logger.info("Worker %d processing task %s (type=%s, user=%s)", worker_id, task_id, task.type, task.user_id)

            try:
                result = await handler(task)
                task.result = result if isinstance(result, dict) else {"output": result}
                task.status = TaskStatus.completed
                task.completed_at = datetime.now(UTC)
                logger.info("Worker %d: task %s completed", worker_id, task_id)
            except Exception as exc:
                task.status = TaskStatus.failed
                task.error = str(exc)
                task.completed_at = datetime.now(UTC)
                logger.error("Worker %d: task %s failed: %s", worker_id, task_id, exc, exc_info=True)
            finally:
                self._mark_user_done(task)

            self._queue.task_done()

    def _prune_idempotency(self):
        now = time.time()
        stale_keys = [k for k, ts in self._idempotency_timestamps.items() if now - ts > _IDEMPOTENCY_TTL_SECONDS]
        for k in stale_keys:
            self._idempotency.pop(k, None)
            self._idempotency_timestamps.pop(k, None)

        if len(self._idempotency) <= _IDEMPOTENCY_MAX_SIZE:
            return

        sorted_keys = sorted(
            self._idempotency_timestamps.keys(),
            key=lambda k: self._idempotency_timestamps[k],
        )
        excess = len(self._idempotency) - _IDEMPOTENCY_MAX_SIZE
        for k in sorted_keys[:excess]:
            self._idempotency.pop(k, None)
            self._idempotency_timestamps.pop(k, None)

    async def cleanup_idempotency(self) -> int:
        now = time.time()
        stale_keys = [k for k, ts in self._idempotency_timestamps.items() if now - ts > _IDEMPOTENCY_TTL_SECONDS]
        for k in stale_keys:
            self._idempotency.pop(k, None)
            self._idempotency_timestamps.pop(k, None)
        return len(stale_keys)

    def stop(self):
        self._running = False


class RedisTaskQueue:
    _QUEUE_PREFIX = "queue:"
    _TASK_PREFIX = "task:"
    _IDEM_PREFIX = "idem:"
    _USER_TASKS_PREFIX = "user_tasks:"
    _DLQ_PREFIX = "dlq:tasks"
    _RUNNING_SYNC_KEY = "running_syncs"
    _TASK_TTL = 3600
    _IDEM_TTL = 3600
    _MAX_USER_TASKS = 100
    _BLPOP_TIMEOUT = 1.0
    _REQUEUE_DELAY = 0.5
    _RUNNING_SYNC_TTL = 300

    def __init__(self, redis_url: str, worker_count: int = 10, dlq_max_retries: int = 3, task_timeout: int = 300):
        self._redis_url = redis_url
        self._redis: Any = None
        self._running = False
        self._worker_count = worker_count
        self._dlq_max_retries = dlq_max_retries
        self._task_timeout = task_timeout
        self._handlers: dict[str, Any] = {}
        self._worker_tasks: list[asyncio.Task] = []

    @property
    def worker_count(self) -> int:
        return self._worker_count

    async def pending_count(self) -> int:
        total = 0
        for task_type in self._handlers:
            length = await self._redis.llen(f"{self._QUEUE_PREFIX}{task_type}")
            total += length or 0
        return total

    async def get_metrics(self) -> dict:
        processed = int(await self._redis.get("metrics:processed") or 0)
        failed = int(await self._redis.get("metrics:failed") or 0)
        times = await self._redis.lrange("metrics:processing_times", 0, -1)
        avg_time = 0.0
        if times:
            vals = [float(t) for t in times if t]
            avg_time = sum(vals) / len(vals) if vals else 0.0
        qdepth = await self.pending_count()
        return {
            "queue_depth": qdepth,
            "processed": processed,
            "failed": failed,
            "failure_rate": round(failed / (processed + failed), 4) if (processed + failed) > 0 else 0.0,
            "avg_processing_time_seconds": round(avg_time, 3),
        }

    async def connect(self):
        import redis.asyncio as aioredis

        self._redis = aioredis.from_url(self._redis_url, decode_responses=True)
        await self._redis.ping()
        logger.info("Connected to Redis at %s", self._redis_url)

    async def disconnect(self):
        if self._redis:
            await self._redis.close()
            self._redis = None

    def register_handler(self, task_type: str, handler):
        self._handlers[task_type] = handler

    async def enqueue(self, task_type: str, user_id: str, payload: dict) -> str | None:
        idem_key = _payload_hash(task_type, user_id, payload)

        existing = await self._redis.get(f"{self._IDEM_PREFIX}{idem_key}")
        if existing:
            task_data = await self._redis.hgetall(f"{self._TASK_PREFIX}{existing}")
            if task_data:
                status = task_data.get("status")
                if status in ("pending", "running"):
                    logger.info("Idempotent skip: %s already %s", existing, status)
                    return existing
                logger.info("Idempotent key cleared: %s is %s", existing, status)

        task_id = str(uuid4())
        now = datetime.now(UTC)

        pipeline = self._redis.pipeline()
        pipeline.hset(f"{self._TASK_PREFIX}{task_id}", mapping={
            "id": task_id,
            "type": task_type,
            "user_id": user_id,
            "status": "pending",
            "payload": json.dumps(payload),
            "result": "",
            "created_at": now.isoformat(),
            "started_at": "",
            "completed_at": "",
            "error": "",
        })
        pipeline.expire(f"{self._TASK_PREFIX}{task_id}", self._TASK_TTL)
        pipeline.setex(f"{self._IDEM_PREFIX}{idem_key}", self._IDEM_TTL, task_id)
        pipeline.lpush(f"{self._QUEUE_PREFIX}{task_type}", task_id)
        pipeline.lpush(f"{self._USER_TASKS_PREFIX}{user_id}", task_id)
        pipeline.ltrim(f"{self._USER_TASKS_PREFIX}{user_id}", 0, self._MAX_USER_TASKS - 1)
        pipeline.expire(f"{self._USER_TASKS_PREFIX}{user_id}", self._TASK_TTL)
        await pipeline.execute()

        logger.info("Enqueued task %s (type=%s, user=%s)", task_id, task_type, user_id)
        return task_id

    async def get_status(self, task_id: str) -> dict | None:
        data = await self._redis.hgetall(f"{self._TASK_PREFIX}{task_id}")
        if not data:
            return None
        return self._deserialize_task(data)

    async def get_tasks(self, user_id: str, limit: int = 20) -> list[dict]:
        task_ids = await self._redis.lrange(f"{self._USER_TASKS_PREFIX}{user_id}", 0, limit - 1)
        if not task_ids:
            return []

        results = []
        for tid in task_ids:
            data = await self._redis.hgetall(f"{self._TASK_PREFIX}{tid}")
            if data:
                results.append(self._deserialize_task(data))
        return results

    async def worker_loop(self):
        self._running = True
        logger.info("Redis task queue worker started (%d workers)", self._worker_count)
        workers = [asyncio.create_task(self._worker(i)) for i in range(self._worker_count)]
        self._worker_tasks = workers
        try:
            await asyncio.gather(*workers, return_exceptions=True)
        finally:
            self._running = False

    async def _try_acquire_sync_lock(self, user_id: str) -> bool:
        if not await self._redis.sadd(self._RUNNING_SYNC_KEY, user_id):
            return False
        await self._redis.expire(self._RUNNING_SYNC_KEY, self._RUNNING_SYNC_TTL)
        return True

    async def _release_sync_lock(self, user_id: str):
        await self._redis.srem(self._RUNNING_SYNC_KEY, user_id)

    async def _worker(self, worker_id: int):
        logger.info("Redis worker %d started", worker_id)
        queue_keys = [f"{self._QUEUE_PREFIX}{t}" for t in self._handlers.keys()]
        while self._running:
            try:
                result = await self._redis.blpop(queue_keys, timeout=self._BLPOP_TIMEOUT)
                if result is None:
                    continue
                _, task_id = result
            except Exception:
                await asyncio.sleep(1)
                continue

            task_data = await self._redis.hgetall(f"{self._TASK_PREFIX}{task_id}")
            if not task_data:
                continue

            task_type = task_data.get("type")
            user_id = task_data.get("user_id")

            run_after_str = task_data.get("run_after")
            if run_after_str:
                run_after = datetime.fromisoformat(run_after_str)
                if datetime.now(UTC) < run_after:
                    await self._redis.rpush(f"{self._QUEUE_PREFIX}{task_type}", task_id)
                    wait = min((run_after - datetime.now(UTC)).total_seconds(), 30)
                    await asyncio.sleep(max(wait, self._REQUEUE_DELAY))
                    continue

            if task_type == "sync":
                if not await self._try_acquire_sync_lock(user_id):
                    await self._redis.rpush(f"{self._QUEUE_PREFIX}{task_type}", task_id)
                    await asyncio.sleep(self._REQUEUE_DELAY)
                    continue

            handler = self._handlers.get(task_type)
            if not handler:
                logger.error("No handler for task type: %s", task_type)
                await self._redis.hset(f"{self._TASK_PREFIX}{task_id}", "status", "failed")
                if task_type == "sync":
                    await self._release_sync_lock(user_id)
                continue

            now = datetime.now(UTC)
            await self._redis.hset(f"{self._TASK_PREFIX}{task_id}", mapping={
                "status": "running",
                "started_at": now.isoformat(),
            })

            task_obj = Task(
                task_id=task_id,
                task_type=task_type,
                user_id=user_id,
                payload=json.loads(task_data.get("payload", "{}")),
            )

            processing_start = time.monotonic()
            try:
                result = await asyncio.wait_for(handler(task_obj), timeout=self._task_timeout)
                elapsed = time.monotonic() - processing_start
                result_dict = result if isinstance(result, dict) else {"output": result}
                now = datetime.now(UTC)
                pipeline = self._redis.pipeline()
                pipeline.hset(f"{self._TASK_PREFIX}{task_id}", mapping={
                    "status": "completed",
                    "result": json.dumps(result_dict),
                    "completed_at": now.isoformat(),
                })
                pipeline.incr("metrics:processed")
                pipeline.lpush("metrics:processing_times", f"{elapsed:.3f}")
                pipeline.ltrim("metrics:processing_times", 0, 999)
                await pipeline.execute()
                logger.info("Redis worker %d: task %s completed (%.2fs)", worker_id, task_id, elapsed)
            except TimeoutError:
                elapsed = time.monotonic() - processing_start
                logger.error("Redis worker %d: task %s timed out after %.1fs", worker_id, task_id, elapsed)
                await self._handle_task_failure(task_id, task_type, "Task timed out after 300 seconds")
            except Exception as exc:
                elapsed = time.monotonic() - processing_start
                logger.error("Redis worker %d: task %s failed: %s", worker_id, task_id, exc)
                await self._handle_task_failure(task_id, task_type, str(exc))
            finally:
                if task_type == "sync":
                    await self._release_sync_lock(user_id)

    async def _handle_task_failure(self, task_id: str, task_type: str, error: str):
        retry_count = await self._redis.hincrby(f"{self._TASK_PREFIX}{task_id}", "retry_count", 1)

        if retry_count < self._dlq_max_retries:
            delay = min(2 ** retry_count * 10, 300)
            run_after_ts = time.time() + delay
            pipeline = self._redis.pipeline()
            pipeline.hset(f"{self._TASK_PREFIX}{task_id}", mapping={
                "status": "pending",
                "run_after": datetime.fromtimestamp(run_after_ts, UTC).isoformat(),
                "error": error,
            })
            pipeline.rpush(f"{self._QUEUE_PREFIX}{task_type}", task_id)
            pipeline.incr("metrics:failed")
            await pipeline.execute()
            logger.info("Task %s will retry (attempt %d/%d) after %ds", task_id, retry_count, self._dlq_max_retries, delay)
        else:
            now = datetime.now(UTC)
            dlq_entry = json.dumps({
                "task_id": task_id,
                "type": task_type,
                "error": error,
                "failed_at": now.isoformat(),
                "retry_count": int(retry_count),
            })
            pipeline = self._redis.pipeline()
            pipeline.hset(f"{self._TASK_PREFIX}{task_id}", mapping={
                "status": "failed",
                "error": error,
                "completed_at": now.isoformat(),
            })
            pipeline.lpush(self._DLQ_PREFIX, dlq_entry)
            pipeline.incr("metrics:failed")
            await pipeline.execute()
            logger.error("Task %s sent to DLQ after %d retries", task_id, retry_count)

    def stop(self):
        self._running = False

    async def cleanup_idempotency(self) -> int:
        return 0

    def _deserialize_task(self, data: dict) -> dict:
        result = dict(data)
        if "payload" in result and result["payload"]:
            try:
                result["payload"] = json.loads(result["payload"])
            except (json.JSONDecodeError, TypeError):
                result["payload"] = {}
        if "result" in result and result["result"]:
            try:
                result["result"] = json.loads(result["result"])
            except (json.JSONDecodeError, TypeError):
                result["result"] = None
        if "error" in result and not result["error"]:
            result["error"] = None
        for f in ("started_at", "completed_at"):
            if f in result and not result[f]:
                result[f] = None
        return result


_task_queue_instance: TaskQueue | RedisTaskQueue | None = None


def _get_task_queue() -> TaskQueue | RedisTaskQueue:
    global _task_queue_instance
    if _task_queue_instance is not None:
        return _task_queue_instance
    if settings.REDIS_URL:
        _task_queue_instance = RedisTaskQueue(
            settings.REDIS_URL,
            worker_count=settings.WORKER_COUNT,
            dlq_max_retries=settings.DLQ_MAX_RETRIES,
            task_timeout=settings.TASK_TIMEOUT,
        )
        logger.info("Using Redis-backed task queue (workers=%d, timeout=%ds)", settings.WORKER_COUNT, settings.TASK_TIMEOUT)
        return _task_queue_instance
    raise RuntimeError(
        "REDIS_URL is not configured. The task queue requires Redis. "
        "Set REDIS_URL in your .env or environment variables."
    )


def __getattr__(name):
    if name == "task_queue":
        return _get_task_queue()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
