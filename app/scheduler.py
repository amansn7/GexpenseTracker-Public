import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


async def _delete_expired_accounts():
    """Delete accounts whose scheduled_deletion_at has passed."""
    from sqlalchemy import select
    from app.models import User
    from app.api.settings import _delete_user_data

    deleted = 0
    try:
        async with AsyncSessionLocal() as db:
            now = datetime.now(timezone.utc)
            users = (await db.execute(
                select(User).where(
                    User.scheduled_deletion_at.isnot(None),
                    User.scheduled_deletion_at <= now,
                )
            )).scalars().all()

            for user in users:
                try:
                    await _delete_user_data(db, str(user.id))
                    deleted += 1
                except Exception as exc:
                    logger.error("Failed to delete user %s: %s", user.id, exc)

            if deleted:
                await db.commit()
                logger.info("Deleted %d expired accounts", deleted)
    except Exception as exc:
        logger.error("Cleanup job error: %s", exc)


def setup_scheduler() -> None:
    from app.sync import run_sync

    async def _sync_job():
        logger.info("Scheduled Gmail sync starting")
        try:
            async with AsyncSessionLocal() as owner_db:
                from app.models import User, UserRole
                owner = (await owner_db.execute(
                    select(User).where(User.role == UserRole.owner, User.email != "service@localhost")
                )).scalar_one_or_none()
                owner_id = owner.id if owner else None
            if owner_id is None:
                logger.warning("Scheduled sync skipped: no owner user found")
                return
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
        next_run_time=datetime.now(),
    )
    scheduler.add_job(
        _delete_expired_accounts,
        trigger="interval",
        minutes=30,
        id="delete_expired_accounts",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started. Gmail sync every %dh, cleanup every 30min", settings.SYNC_INTERVAL_HOURS)
