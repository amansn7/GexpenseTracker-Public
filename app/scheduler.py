import logging
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

def setup_scheduler() -> None:
    from app.sync import run_sync

    async def _sync_job():
        logger.info("Scheduled Gmail sync starting")
        try:
            async with AsyncSessionLocal() as owner_db:
                from app.models import User, UserRole
                from sqlalchemy import select
                owner = (await owner_db.execute(
                    select(User).where(User.role == UserRole.owner, User.email != "service@localhost")
                )).scalar_one_or_none()
                owner_id = owner.id if owner else None
            result = await run_sync(user_id=owner_id)
            logger.info("Sync complete: %s", result)
        except Exception as exc:
            logger.error("Sync job error: %s", exc)

    scheduler.add_job(
        _sync_job,
        trigger="interval",
        hours=settings.SYNC_INTERVAL_HOURS,
        id="gmail_sync",
        replace_existing=True,
        next_run_time=datetime.now(),  # run immediately on startup
    )
    scheduler.start()
    logger.info("Scheduler started. Gmail sync every %dh", settings.SYNC_INTERVAL_HOURS)
