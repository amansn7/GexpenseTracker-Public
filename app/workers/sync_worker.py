import asyncio
import logging
from typing import Any, Dict

from app.database import AsyncSessionLocal
from app.sync import sync_emails, _user_progress, _log_event, _reset_progress
from app.workers.queue import Task, TaskStatus

logger = logging.getLogger(__name__)

SYNC_TIMEOUT_SECS = 600  # 10 minutes max for a single sync run


async def handle_sync_task(task: Task) -> Dict[str, Any]:
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
    payload = task.payload

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

    except asyncio.TimeoutError:
        logger.error("Sync task %s timed out after %ds", task.id, SYNC_TIMEOUT_SECS)
        _log_event(user_id, f"Sync task timed out after {SYNC_TIMEOUT_SECS}s", "error")
        prog = _user_progress(user_id)
        prog.update({
            "running": False,
            "phase": "error",
            "error": f"Sync timed out after {SYNC_TIMEOUT_SECS}s",
        })
        raise

    except Exception as exc:
        logger.error("Sync task %s failed: %s", task.id, exc, exc_info=True)
        _log_event(user_id, f"Sync task failed: {exc}", "error")
        prog = _user_progress(user_id)
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        raise


def register(queue):
    queue.register_handler("sync", handle_sync_task)
