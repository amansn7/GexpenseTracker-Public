import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class Task:
    __slots__ = (
        "id", "type", "user_id", "status", "payload", "result",
        "created_at", "started_at", "completed_at", "error",
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
        self.result: Optional[dict] = None
        self.created_at = datetime.now(timezone.utc)
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.error: Optional[str] = None

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
    raw = json.dumps({"type": task_type, "user_id": user_id, "payload": payload}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


class TaskQueue:
    def __init__(self, maxsize: int = 0):
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._tasks: Dict[str, Task] = {}
        self._user_tasks: Dict[str, List[str]] = {}
        self._idempotency: Dict[str, str] = {}
        self._lock = asyncio.Lock()
        self._running = False
        self._handlers: Dict[str, Any] = {}

    def register_handler(self, task_type: str, handler):
        self._handlers[task_type] = handler

    async def enqueue(self, task_type: str, user_id: str, payload: dict) -> Optional[str]:
        idem_key = _payload_hash(task_type, user_id, payload)
        async with self._lock:
            existing = self._idempotency.get(idem_key)
            if existing:
                task = self._tasks.get(existing)
                if task and task.status in (TaskStatus.pending, TaskStatus.running):
                    logger.info("Idempotent skip: %s already %s", existing, task.status.value)
                    return existing

            task_id = str(uuid4())
            task = Task(task_id, task_type, user_id, payload)
            self._tasks[task_id] = task
            self._idempotency[idem_key] = task_id

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

    def get_status(self, task_id: str) -> Optional[dict]:
        task = self._tasks.get(task_id)
        return task.to_dict() if task else None

    def get_tasks(self, user_id: str, limit: int = 20) -> List[dict]:
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
        logger.info("Task queue worker started")
        while self._running:
            try:
                task_id = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue

            task = self._tasks.get(task_id)
            if not task:
                self._queue.task_done()
                continue

            handler = self._handlers.get(task.type)
            if not handler:
                task.status = TaskStatus.failed
                task.error = f"No handler registered for task type: {task.type}"
                task.completed_at = datetime.now(timezone.utc)
                logger.error("Task %s failed: %s", task_id, task.error)
                self._queue.task_done()
                continue

            task.status = TaskStatus.running
            task.started_at = datetime.now(timezone.utc)
            logger.info("Processing task %s (type=%s)", task_id, task.type)

            try:
                result = await handler(task)
                task.result = result if isinstance(result, dict) else {"output": result}
                task.status = TaskStatus.completed
                task.completed_at = datetime.now(timezone.utc)
                logger.info("Task %s completed", task_id)
            except Exception as exc:
                task.status = TaskStatus.failed
                task.error = str(exc)
                task.completed_at = datetime.now(timezone.utc)
                logger.error("Task %s failed: %s", task_id, exc, exc_info=True)

            self._queue.task_done()

    def stop(self):
        self._running = False


task_queue = TaskQueue()
