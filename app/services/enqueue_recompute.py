"""Helper to enqueue async recompute tasks with sync fallback."""
import logging

logger = logging.getLogger(__name__)


async def enqueue_recompute(user_id: str, months: set[tuple[int, int]]) -> list[str | None]:
    """Enqueue background recompute tasks for affected months.

    One task per (user_id, year) grouping to keep payloads small.
    Falls back to synchronous recompute when the task queue is unavailable
    (e.g. in tests or when Redis is not configured).

    Returns list of task IDs (empty list if fallback was used).
    """
    if not months:
        return []

    by_year: dict[int, list[int]] = {}
    for year, month in months:
        by_year.setdefault(year, []).append(month)

    task_ids = []
    for year, month_list in by_year.items():
        payload = {
            "months": [{"year": year, "month": m} for m in month_list],
        }
        try:
            from app.workers.queue import _get_task_queue

            queue = _get_task_queue()
            task_id = await queue.enqueue("recompute", user_id, payload)
            task_ids.append(task_id)
            if task_id:
                logger.debug(
                    "Enqueued recompute for user %s year %d (%d months): %s",
                    user_id, year, len(month_list), task_id,
                )
            else:
                logger.debug("Recompute deduped for user %s year %d", user_id, year)
        except RuntimeError:
            logger.info(
                "Task queue unavailable; falling back to sync recompute "
                "for user %s year %d (%d months)",
                user_id, year, len(month_list),
            )
            await _sync_recompute(user_id, year, month_list)

    return task_ids


async def _sync_recompute(user_id: str, year: int, months: list[int]):
    """Synchronous fallback — called when task queue is not available."""
    from app.database import AsyncSessionLocal
    from app.services.stats_service import recompute_month

    for month in months:
        try:
            async with AsyncSessionLocal() as db:
                await recompute_month(user_id, year, month, db)
                await db.commit()
        except Exception as exc:
            logger.error("Sync recompute fallback failed for %s %d-%02d: %s", user_id, year, month, exc)
