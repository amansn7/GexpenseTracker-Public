"""Background worker for async rollup recomputation."""
import logging

from app.database import AsyncSessionLocal
from app.services.stats_service import recompute_month
from app.workers.queue import Task

logger = logging.getLogger(__name__)


async def handle_recompute_task(task: Task) -> dict:
    """Task handler for recompute_month — enqueued after transaction writes.

    Payload format: {"months": [{"year": 2026, "month": 6}, ...]}
    Creates its own DB session, recomputes each month, and commits.
    """
    months = task.payload.get("months", [])
    user_id = task.user_id
    logger.info("Recompute task %s: %d months for user %s", task.id, len(months), user_id)

    succeeded = 0
    for ym in months:
        year = ym["year"]
        month = ym["month"]
        try:
            async with AsyncSessionLocal() as db:
                await recompute_month(user_id, year, month, db)
                await db.commit()
            succeeded += 1
            logger.info("Recompute task %s: month %d-%02d done", task.id, year, month)
        except Exception as exc:
            logger.error("Recompute task %s: month %d-%02d failed: %s", task.id, year, month, exc)

    return {"succeeded": succeeded, "total": len(months)}
