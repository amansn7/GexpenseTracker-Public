import asyncio
from datetime import UTC, datetime

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app.database import AsyncSessionLocal
from app.rate_limiter import rate_limiter

logger = structlog.get_logger()
scheduler = AsyncIOScheduler()

MAX_CONCURRENT_SYNCS = 5
_sync_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SYNCS)


async def _delete_expired_accounts():
    """Delete accounts whose scheduled_deletion_at has passed."""
    from sqlalchemy import select

    from app.api.settings import _delete_user_data
    from app.models import User

    deleted = 0
    try:
        async with AsyncSessionLocal() as db:
            now = datetime.now(UTC)
            users = (
                (
                    await db.execute(
                        select(User).where(
                            User.scheduled_deletion_at.isnot(None),
                            User.scheduled_deletion_at <= now,
                        )
                    )
                )
                .scalars()
                .all()
            )

            for user in users:
                try:
                    await _delete_user_data(db, str(user.id))
                    deleted += 1
                except Exception as exc:
                    logger.error("user_delete_failed", user_id=str(user.id), error=str(exc))

            if deleted:
                await db.commit()
                logger.info("expired_accounts_deleted", count=deleted)
    except Exception as exc:
        logger.error("cleanup_job_error", error=str(exc))


def setup_scheduler() -> None:
    from app.workers.queue import task_queue

    async def _sync_user(user_id: str):
        """Sync a single user, respecting the concurrency semaphore."""
        async with _sync_semaphore:
            task_id = await task_queue.enqueue("sync", user_id, {"trigger": "scheduled"})
            if task_id is None:
                logger.info("sync_skipped", user_id=user_id, reason="already_in_progress")
            else:
                logger.info("sync_enqueued", task_id=task_id, user_id=user_id)

    async def _sync_job():
        logger.info("scheduled_sync_starting")
        try:
            async with AsyncSessionLocal() as db:
                from sqlalchemy import select

                from app.models import ConnectedAccount, User, UserStatus

                active_users = (
                    (
                        await db.execute(
                            select(User).where(
                                User.status == UserStatus.active,
                                User.onboarding_complete,
                            )
                        )
                    )
                    .scalars()
                    .all()
                )

                eligible_user_ids = []
                for user in active_users:
                    account = (
                        await db.execute(
                            select(ConnectedAccount).where(
                                ConnectedAccount.user_id == user.id,
                                ConnectedAccount.provider == "gmail",
                                ConnectedAccount.status == "connected",
                            )
                        )
                    ).scalar_one_or_none()
                    if account:
                        eligible_user_ids.append(user.id)

            if not eligible_user_ids:
                logger.warning("scheduled_sync_skipped", reason="no_eligible_users")
                return

            logger.info("scheduled_sync_eligible_users", count=len(eligible_user_ids))
            tasks = [_sync_user(uid) for uid in eligible_user_ids]
            await asyncio.gather(*tasks, return_exceptions=True)
            logger.info("scheduled_sync_complete", user_count=len(eligible_user_ids))
        except Exception as exc:
            logger.error("sync_job_error", error=str(exc))

    scheduler.add_job(
        _sync_job,
        trigger="interval",
        hours=settings.SYNC_INTERVAL_HOURS,
        id="gmail_sync",
        replace_existing=True,
        # Don't run immediately on startup — let server become healthy first
    )
    scheduler.add_job(
        _delete_expired_accounts,
        trigger="interval",
        minutes=30,
        id="delete_expired_accounts",
        replace_existing=True,
    )

    async def _dedup_job():
        logger.info("dedup_scan_starting")
        try:
            async with AsyncSessionLocal() as db:
                from sqlalchemy import select

                from app.models import ConnectedAccount, User, UserStatus

                active_users = (
                    (
                        await db.execute(
                            select(User).where(
                                User.status == UserStatus.active,
                                User.onboarding_complete,
                            )
                        )
                    )
                    .scalars()
                    .all()
                )

                eligible_user_ids = []
                for user in active_users:
                    account = (
                        await db.execute(
                            select(ConnectedAccount).where(
                                ConnectedAccount.user_id == user.id,
                                ConnectedAccount.provider == "gmail",
                                ConnectedAccount.status == "connected",
                            )
                        )
                    ).scalar_one_or_none()
                    if account:
                        eligible_user_ids.append(user.id)

            if not eligible_user_ids:
                logger.warning("dedup_scan_skipped", reason="no_eligible_users")
                return

            from app.sync import scan_all_for_duplicates

            for user_id in eligible_user_ids:
                result = await scan_all_for_duplicates(user_id)
                logger.info("dedup_scan_result", user_id=user_id, result=result)
            logger.info("dedup_scan_complete", user_count=len(eligible_user_ids))
        except Exception as exc:
            logger.error("dedup_job_error", error=str(exc))

    scheduler.add_job(
        _dedup_job,
        trigger="interval",
        hours=1,
        id="dedup_scan",
        replace_existing=True,
        # Don't run immediately on startup — let server become healthy first
    )

    async def _idempotency_cleanup_job():
        logger.info("idempotency_cleanup_starting")
        try:
            pruned = task_queue.cleanup_idempotency()
            if pruned:
                logger.info("idempotency_cleanup_complete", pruned_count=pruned)
        except Exception as exc:
            logger.error("idempotency_cleanup_error", error=str(exc))

    scheduler.add_job(
        _idempotency_cleanup_job,
        trigger="interval",
        minutes=30,
        id="idempotency_cleanup",
        replace_existing=True,
    )

    async def _rate_limiter_cleanup_job():
        rate_limiter.cleanup(max_age_seconds=3600)

    scheduler.add_job(
        _rate_limiter_cleanup_job,
        trigger="interval",
        hours=1,
        id="rate_limiter_cleanup",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("scheduler_started", sync_interval_hours=settings.SYNC_INTERVAL_HOURS)
