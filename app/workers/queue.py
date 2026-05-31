# Celery task queue — scalable and persistent
import hashlib
import json
import logging
import os
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from celery import Celery
from celery.exceptions import Ignore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.sync import _log_event, _reset_progress, _user_progress

logger = logging.getLogger(__name__)

# Celery app
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("tasks", broker=redis_url, backend=redis_url)

# Configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.workers.queue.sync_task": {"queue": "sync"},
        "app.workers.queue.fetch_range_task": {"queue": "sync"},
    },
)

# Task timeout settings
SYNC_TIMEOUT_SECS = 600  # 10 minutes
FETCH_RANGE_TIMEOUT_SECS = 1800  # 30 minutes


def _payload_hash(task_type: str, user_id: str, payload: dict) -> str:
    """Generate a hash for idempotency checking."""
    stable_payload = {k: v for k, v in payload.items() if k != "trigger"}
    raw = json.dumps({"type": task_type, "user_id": user_id, "payload": stable_payload}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def sync_task(self, task_id: str, user_id: str, payload: dict) -> dict:
    """Execute a Gmail sync operation within the Celery worker."""
    from app.workers.sync_worker import handle_sync_task
    from app.models import Task

    try:
        # Check if task is already running (idempotency)
        idem_key = _payload_hash("sync", user_id, payload)
        logger.info("Sync task %s started (user=%s, idempotency_key=%s)", task_id, user_id, idem_key)

        # Mark task as running in DB
        async def _update_task_status():
            async with AsyncSessionLocal() as session:
                task = await session.get(Task, task_id)
                if task:
                    task.status = "running"
                    task.started_at = datetime.now(UTC)
                    await session.commit()

        import asyncio
        asyncio.run(_update_task_status())

        # Execute the sync
        result = asyncio.run(handle_sync_task(Task(id=task_id, type="sync", user_id=user_id, payload=payload)))
        logger.info("Sync task %s completed: %s", task_id, result)
        return result

    except Exception as exc:
        logger.error("Sync task %s failed: %s", task_id, exc, exc_info=True)
        self.retry(exc=exc, countdown=60 * self.request.retries)
        raise Ignore()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def fetch_range_task(self, task_id: str, user_id: str, payload: dict) -> dict:
    """Execute a fetch-range operation within the Celery worker."""
    from app.workers.sync_worker import handle_fetch_range_task
    from app.models import Task

    try:
        # Check if task is already running (idempotency)
        idem_key = _payload_hash("fetch_range", user_id, payload)
        logger.info("Fetch-range task %s started (user=%s, idempotency_key=%s)", task_id, user_id, idem_key)

        # Mark task as running in DB
        async def _update_task_status():
            async with AsyncSessionLocal() as session:
                task = await session.get(Task, task_id)
                if task:
                    task.status = "running"
                    task.started_at = datetime.now(UTC)
                    await session.commit()

        import asyncio
        asyncio.run(_update_task_status())

        # Execute the fetch-range
        result = asyncio.run(handle_fetch_range_task(Task(id=task_id, type="fetch_range", user_id=user_id, payload=payload)))
        logger.info("Fetch-range task %s completed: %s", task_id, result)
        return result

    except Exception as exc:
        logger.error("Fetch-range task %s failed: %s", task_id, exc, exc_info=True)
        self.retry(exc=exc, countdown=60 * self.request.retries)
        raise Ignore()


def register(queue):
    """Register task handlers with the queue."""
    pass  # No-op for Celery - tasks are registered via decorators


def register_fetch_range(queue):
    """Register fetch-range task handler."""
    pass  # No-op for Celery - tasks are registered via decorators


async def enqueue(task_type: str, user_id: str, payload: dict) -> str | None:
    """Enqueue a task with idempotency checking."""
    from app.models import Task, TaskStatus

    idem_key = _payload_hash(task_type, user_id, payload)
    task_id = str(uuid4())

    # Create task in DB
    async with AsyncSessionLocal() as session:
        # Check for existing task with same idempotency key
        existing_task = (
            await session.execute(
                select(Task).where(
                    Task.idempotency_key == idem_key,
                    Task.status.in_(["pending", "running"])
                )
            )
        ).scalar_one_or_none()

        if existing_task:
            logger.info("Idempotent skip: %s already %s", existing_task.id, existing_task.status.value)
            return existing_task.id

        # Create new task
        task = Task(
            id=task_id,
            type=task_type,
            user_id=user_id,
            payload=payload,
            idempotency_key=idem_key,
            status=TaskStatus.pending,
        )
        session.add(task)
        await session.commit()

    # Enqueue task in Celery
    if task_type == "sync":
        sync_task.delay(task_id, user_id, payload)
    elif task_type == "fetch_range":
        fetch_range_task.delay(task_id, user_id, payload)
    else:
        logger.error("Unknown task type: %s", task_type)
        return None

    logger.info("Enqueued task %s (type=%s, user=%s)", task_id, task_type, user_id)
    return task_id


def get_status(task_id: str) -> dict | None:
    """Get task status from DB."""
    async def _get_task_status():
        async with AsyncSessionLocal() as session:
            from app.models import Task
            task = await session.get(Task, task_id)
            return task.to_dict() if task else None

    import asyncio
    return asyncio.run(_get_task_status())


def get_tasks(user_id: str, limit: int = 20) -> list[dict]:
    """Get recent tasks for a user from DB."""
    async def _get_user_tasks():
        async with AsyncSessionLocal() as session:
            from app.models import Task
            tasks = (
                await session.execute(
                    select(Task)
                    .where(Task.user_id == user_id)
                    .order_by(Task.created_at.desc())
                    .limit(limit)
                )
            ).scalars().all()
            return [task.to_dict() for task in tasks]

    import asyncio
    return asyncio.run(_get_user_tasks())


def stop():
    """Stop the task queue."""
    celery_app.control.shutdown()


# Export the Celery app for use in main.py
task_queue = celery_app
