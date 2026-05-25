import asyncio
import logging
from typing import Any

from app.database import AsyncSessionLocal
from app.sync import _log_event, _reset_progress, _user_progress, sync_emails
from app.workers.queue import Task

logger = logging.getLogger(__name__)

SYNC_TIMEOUT_SECS = 600  # 10 minutes max for a single sync run


async def handle_sync_task(task: Task) -> dict[str, Any]:
    """
    Execute a Gmail sync operation within the worker queue.

    Wraps the existing sync_emails() logic with:
    - Proper progress state management (running:true/false)
    - Transaction rollback on failure
    - Progress updates pushed to the per-user _sync_progress dict
    - Result capture for the task model
    - Server-side timeout to prevent indefinite hangs
    """
    user_id = task.user_id

    _log_event(user_id, f"Worker picked up sync task {task.id}", "info")

    # Reset progress so frontend sees running:true immediately
    _reset_progress(user_id)
    _log_event(user_id, "Sync task started", "info")

    try:
        async with AsyncSessionLocal() as session:
            result = await asyncio.wait_for(
                sync_emails(session, user_id=user_id),
                timeout=SYNC_TIMEOUT_SECS,
            )

        if "error" in result:
            prog = _user_progress(user_id)
            prog.update({"running": False, "phase": "error", "error": result["error"]})
            return {
                "status": "failed",
                "task_id": task.id,
                "error": result["error"],
                "processed": result.get("processed", 0),
            }

        # Explicitly mark running:false on success (sync_emails does this too,
        # but we ensure it here for consistency)
        prog = _user_progress(user_id)
        prog["running"] = False

        return {
            "status": "completed",
            "task_id": task.id,
            "processed": result.get("processed", 0),
            "total_fetched": result.get("total_fetched", 0),
            "skipped": result.get("skipped", 0),
        }

    except TimeoutError:
        logger.error("Sync task %s timed out after %ds", task.id, SYNC_TIMEOUT_SECS)
        _log_event(user_id, f"Sync task timed out after {SYNC_TIMEOUT_SECS}s", "error")
        prog = _user_progress(user_id)
        prog.update(
            {
                "running": False,
                "phase": "error",
                "error": f"Sync timed out after {SYNC_TIMEOUT_SECS}s",
            }
        )
        raise

    except Exception as exc:
        logger.error("Sync task %s failed: %s", task.id, exc, exc_info=True)
        _log_event(user_id, f"Sync task failed: {exc}", "error")
        prog = _user_progress(user_id)
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        raise


FETCH_RANGE_TIMEOUT_SECS = 1800  # 30 minutes


async def handle_fetch_range_task(task: Task) -> dict[str, Any]:
    """Execute a fetch-range operation with timeout protection."""
    user_id = task.user_id
    payload = task.payload

    _log_event(user_id, f"Worker picked up fetch-range task {task.id}", "info")

    try:
        from app.sync.range import run_sync_range

        result = await asyncio.wait_for(
            run_sync_range(
                user_id=user_id,
                after_date=payload["after_date"],
                before_date=payload["before_date"],
                llm_priority=payload.get("llm_priority", False),
                sender=payload.get("sender"),
                subject=payload.get("subject"),
            ),
            timeout=FETCH_RANGE_TIMEOUT_SECS,
        )
        return {"status": "completed", "task_id": task.id, "result": result}
    except TimeoutError:
        logger.error("Fetch-range task %s timed out after %ds", task.id, FETCH_RANGE_TIMEOUT_SECS)
        _log_event(user_id, f"Fetch-range timed out after {FETCH_RANGE_TIMEOUT_SECS}s", "error")
        prog = _user_progress(user_id)
        prog.update(
            {
                "running": False,
                "phase": "error",
                "error": f"Fetch-range timed out after {FETCH_RANGE_TIMEOUT_SECS}s",
            }
        )
        raise
    except Exception as exc:
        logger.error("Fetch-range task %s failed: %s", task.id, exc, exc_info=True)
        _log_event(user_id, f"Fetch-range failed: {exc}", "error")
        prog = _user_progress(user_id)
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        raise


def register(queue):
    queue.register_handler("sync", handle_sync_task)


def register_fetch_range(queue):
    queue.register_handler("fetch_range", handle_fetch_range_task)
