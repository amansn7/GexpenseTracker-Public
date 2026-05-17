import logging
from typing import Any, Dict

from app.database import AsyncSessionLocal
from app.sync import sync_emails, _user_progress, _log_event
from app.workers.queue import Task, TaskStatus

logger = logging.getLogger(__name__)


async def handle_sync_task(task: Task) -> Dict[str, Any]:
    """
    Execute a Gmail sync operation within the worker queue.

    Wraps the existing sync_emails() logic with:
    - Transaction rollback on failure
    - Progress updates pushed to the per-user _sync_progress dict
    - Result capture for the task model
    """
    user_id = task.user_id
    payload = task.payload

    _log_event(user_id, f"Worker picked up sync task {task.id}", "info")

    try:
        async with AsyncSessionLocal() as session:
            result = await sync_emails(session, user_id=user_id)

        if "error" in result:
            return {
                "status": "failed",
                "task_id": task.id,
                "error": result["error"],
                "processed": result.get("processed", 0),
            }

        return {
            "status": "completed",
            "task_id": task.id,
            "processed": result.get("processed", 0),
            "total_fetched": result.get("total_fetched", 0),
            "skipped": result.get("skipped", 0),
        }

    except Exception as exc:
        logger.error("Sync task %s failed: %s", task.id, exc, exc_info=True)
        _log_event(user_id, f"Sync task failed: {exc}", "error")
        prog = _user_progress(user_id)
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        raise


def register(queue):
    queue.register_handler("sync", handle_sync_task)
