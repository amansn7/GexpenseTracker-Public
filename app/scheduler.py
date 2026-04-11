import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

def setup_scheduler() -> None:
    from app.sync import run_sync

    async def _sync_job():
        logger.info("Scheduled Gmail sync starting")
        try:
            result = await run_sync()
            logger.info("Sync complete: %s", result)
        except Exception as exc:
            logger.error("Sync job error: %s", exc)

    scheduler.add_job(
        _sync_job,
        trigger="interval",
        hours=settings.SYNC_INTERVAL_HOURS,
        id="gmail_sync",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started. Gmail sync every %dh", settings.SYNC_INTERVAL_HOURS)
