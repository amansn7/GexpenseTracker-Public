"""Cleanup endpoint for expired discarded/review_pending emails.

T9: Deletes emails where pre_filter_status IN ('discarded', 'review_pending')
AND synced_at > 90 days ago. Processes in batches of 100. Supports dry-run mode.
"""

import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import Email, User

log = logging.getLogger(__name__)

router = APIRouter()

CLEANUP_DAYS = 90
BATCH_SIZE = 100


class CleanupPayload(BaseModel):
    dry_run: bool = True


@router.post("/cleanup/emails")
async def cleanup_old_emails(
    payload: CleanupPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete emails that were discarded or stuck in review_pending for > 90 days.

    Processes in batches of 100. Returns counts of deleted and remaining.
    When dry_run=True, only reports what would be deleted without modifying data.
    """
    cutoff = datetime.now(UTC) - timedelta(days=CLEANUP_DAYS)

    # Count what would be deleted
    count_q = await db.execute(
        select(Email.id).where(
            Email.user_id == current_user.id,
            Email.pre_filter_status.in_(["discarded", "review_pending"]),
            Email.synced_at < cutoff,
        )
    )
    all_ids = [row[0] for row in count_q.all()]
    total = len(all_ids)

    if payload.dry_run:
        log.info("cleanup dry_run: user=%s would_delete=%s cutoff=%s", current_user.id, total, cutoff.isoformat())
        return {
            "dry_run": True,
            "would_delete": total,
            "cutoff": cutoff.isoformat(),
            "days": CLEANUP_DAYS,
        }

    # Process in batches
    deleted = 0
    for i in range(0, total, BATCH_SIZE):
        batch = all_ids[i : i + BATCH_SIZE]
        result = await db.execute(select(Email).where(Email.id.in_(batch)))
        emails = result.scalars().all()
        for email in emails:
            await db.delete(email)
        await db.commit()
        deleted += len(emails)
        log.info("cleanup batch: user=%s batch=%s/%s deleted=%s", current_user.id, i + len(batch), total, deleted)

    log.info("cleanup complete: user=%s total_deleted=%s", current_user.id, deleted)
    return {
        "dry_run": False,
        "deleted": deleted,
        "cutoff": cutoff.isoformat(),
        "days": CLEANUP_DAYS,
    }
