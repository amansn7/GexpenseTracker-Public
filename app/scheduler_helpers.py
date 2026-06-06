"""Helper functions used by the ARQ cron jobs — extracted from the old scheduler.py.

These were previously embedded in APScheduler job definitions. They remain
as standalone functions callable by ARQ worker functions in arq_worker.py.
"""

from datetime import UTC, datetime

import structlog

from app.database import get_worker_session

logger = structlog.get_logger()


async def delete_expired_accounts():
    """Delete accounts whose scheduled_deletion_at has passed."""
    from sqlalchemy import select

    from app.api.settings import _delete_user_data
    from app.models import User

    deleted = 0
    try:
        async with get_worker_session() as db:
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
