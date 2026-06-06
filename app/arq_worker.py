"""ARQ worker configuration — cron job definitions and worker factory.

Replaces the APScheduler-based scheduling in app/scheduler.py with ARQ's
distributed job queue. All cron jobs defined here are executed by the ARQ
worker process (or in-process background task).

Architecture:
  ARQ cron scheduler → enqueues sync/dedup/cleanup jobs
  Each job either enqueues work to the RedisTaskQueue (sync, dedup)
  or executes inline (cleanups, pool metrics).

  Immediate (API-triggered) tasks continue through RedisTaskQueue directly.
"""

import hashlib
import logging
from datetime import UTC, datetime, timedelta

import structlog
from arq.cron import cron

from app.config import settings

logger = structlog.get_logger()
_std_logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────
MAX_STAGGER_SECONDS = 600
SYNC_SCHEDULER_INTERVAL_MINUTES = 5


# ── Helpers ────────────────────────────────────────────────────────────────


def _user_stagger_seconds(user_id: str) -> int:
    """Deterministic stagger offset per user to prevent thundering herd."""
    return int(hashlib.sha256(user_id.encode()).hexdigest(), 16) % MAX_STAGGER_SECONDS


async def _get_eligible_sync_users(db) -> list[str]:
    """Return list of active user IDs with connected Gmail accounts."""
    from sqlalchemy import select

    from app.models import ConnectedAccount, User, UserStatus

    users = (
        (await db.execute(
            select(User).where(User.status == UserStatus.active, User.onboarding_complete)
        ))
        .scalars()
        .all()
    )
    eligible = []
    for user in users:
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
            eligible.append(user.id)
    return eligible


# ── Cron job functions ─────────────────────────────────────────────────────


async def sync_scheduler_job(ctx):
    """Check which users are due for sync; enqueue with stagger delay.

    Runs every SYNC_SCHEDULER_INTERVAL_MINUTES. For each eligible user,
    checks their adaptive interval and last_synced_at. Enqueues sync tasks
    with a stagger offset to avoid thundering herd on the Gmail API.
    """
    from sqlalchemy import select

    from app.database import get_worker_session
    from app.models import ConnectedAccount, SyncState, User, UserStatus
    from app.workers.queue import task_queue

    async with get_worker_session() as db:
        users = (
            (await db.execute(
                select(User).where(User.status == UserStatus.active, User.onboarding_complete)
            ))
            .scalars()
            .all()
        )

        now = datetime.now(UTC)
        eligible = []
        for user in users:
            account = (
                await db.execute(
                    select(ConnectedAccount).where(
                        ConnectedAccount.user_id == user.id,
                        ConnectedAccount.provider == "gmail",
                        ConnectedAccount.status == "connected",
                    )
                )
            ).scalar_one_or_none()
            if not account:
                continue

            state = (await db.execute(select(SyncState).where(SyncState.user_id == user.id))).scalar_one_or_none()

            if state and state.last_synced_at:
                interval = (
                    state.sync_interval_minutes
                    if state.sync_interval_minutes is not None
                    else settings.SYNC_INTERVAL_HOURS * 60
                )
                last_sync = state.last_synced_at
                if last_sync.tzinfo is None:
                    last_sync = last_sync.replace(tzinfo=UTC)
                next_sync = last_sync + timedelta(minutes=interval)
                if now < next_sync:
                    continue

            eligible.append(user.id)

    for user_id in eligible:
        stagger = _user_stagger_seconds(user_id)
        payload = {"trigger": "scheduled", "run_at": (now + timedelta(seconds=stagger)).isoformat()}
        await task_queue.enqueue("sync", user_id, payload, priority="medium")

    if eligible:
        logger.info("sync_scheduler_enqueued", count=len(eligible))
    return {"enqueued": len(eligible)}


async def dedup_scan_job(ctx):
    """Periodic dedup scan — adaptive, rate-limited, prioritized.

    Replaces the old per-user sequential scan with adaptive_dedup_scan which:
      - Rate-limits scans (default 60/min) via in-memory sliding window
      - Prioritizes users with most unconfirmed DuplicatePair rows
      - Only scans users with new transactions since last_dedup_scan_at
      - Tracks last_dedup_scan_at per user for incremental scans
    """
    from app.sync import adaptive_dedup_scan

    result = await adaptive_dedup_scan()
    logger.info("dedup_scan_complete", **result)
    return result


async def delete_expired_accounts_job(ctx):
    """Delete accounts whose scheduled_deletion_at has passed."""
    from app.scheduler_helpers import delete_expired_accounts

    await delete_expired_accounts()


async def idempotency_cleanup_job(ctx):
    """Clean up stale idempotency keys in the task queue."""
    from app.workers.queue import task_queue

    try:
        pruned = await task_queue.cleanup_idempotency()
        if pruned:
            logger.info("idempotency_cleanup_complete", pruned_count=pruned)
        return {"pruned": pruned}
    except Exception as exc:
        logger.error("idempotency_cleanup_error", error=str(exc))
        return {"pruned": 0, "error": str(exc)}


async def rate_limiter_cleanup_job(ctx):
    """Clean up stale rate limiter buckets."""
    from app.rate_limiter import rate_limiter

    rate_limiter.cleanup(max_age_seconds=3600)


async def log_pool_metrics_job(ctx):
    """Log database connection pool status."""
    from app.database import log_pool_metrics

    await log_pool_metrics()


async def audit_log_cleanup_job(ctx):
    """Purge audit logs older than 90 days."""
    from datetime import timedelta

    from sqlalchemy import delete

    from app.database import get_worker_session
    from app.models import AuditLog

    try:
        cutoff = datetime.now(UTC) - timedelta(days=90)
        async with get_worker_session() as db:
            result = await db.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
            if result.rowcount:
                await db.commit()
                logger.info("audit_log_cleanup_complete", purged=result.rowcount)
    except Exception as exc:
        logger.error("audit_log_cleanup_error", error=str(exc))


async def compute_adaptive_intervals_job(ctx):
    """Recalculate per-user sync intervals based on transaction frequency.

    High-frequency users (100+ txns/30d) → 15 min sync
    Medium-frequency (20-99) → 30 min
    Low-frequency (1-19) → 60 min
    None → default (120 min, stored as NULL)
    """
    from sqlalchemy import func, select

    from app.database import get_worker_session
    from app.models import Email, SyncState, Transaction

    async with get_worker_session() as db:
        states = (await db.execute(select(SyncState))).scalars().all()
        cutoff = datetime.now(UTC) - timedelta(days=30)
        updated = 0

        for state in states:
            count = (
                await db.execute(
                    select(func.count(Transaction.id))
                    .join(Email, Transaction.email_id == Email.id)
                    .where(Email.user_id == state.user_id, Transaction.created_at >= cutoff)
                )
            ).scalar() or 0

            if count >= 100:
                new_interval = 15
            elif count >= 20:
                new_interval = 30
            elif count >= 1:
                new_interval = 60
            else:
                new_interval = None

            if state.sync_interval_minutes != new_interval:
                state.sync_interval_minutes = new_interval
                updated += 1

        if updated:
            await db.commit()
            logger.info("adaptive_intervals_updated", count=updated)

    return {"updated": updated}


# ── Cron job definitions ───────────────────────────────────────────────────

CRON_JOBS = [
    cron(sync_scheduler_job, minute=f"*/{SYNC_SCHEDULER_INTERVAL_MINUTES}"),
    cron(dedup_scan_job, hour="*/2", minute=30),
    cron(delete_expired_accounts_job, minute="*/30"),
    cron(idempotency_cleanup_job, minute="*/30"),
    cron(rate_limiter_cleanup_job, minute="*/30"),
    cron(log_pool_metrics_job, minute="*/5"),
    cron(audit_log_cleanup_job, hour=3, minute=0),
    cron(compute_adaptive_intervals_job, hour=6, minute=0),
]

CRON_FUNCTIONS = [
    sync_scheduler_job,
    dedup_scan_job,
    delete_expired_accounts_job,
    idempotency_cleanup_job,
    rate_limiter_cleanup_job,
    log_pool_metrics_job,
    audit_log_cleanup_job,
    compute_adaptive_intervals_job,
]


def create_worker(redis_pool=None):
    """Create a configured ARQ Worker instance.

    Args:
        redis_pool: Optional existing ArqRedis pool. Creates a new one if None.
    """
    from arq import Worker
    from arq.connections import RedisSettings

    return Worker(
        functions=CRON_FUNCTIONS,
        cron_jobs=CRON_JOBS,
        redis_settings=RedisSettings.from_dsn(settings.REDIS_URL) if redis_pool is None else None,
        redis_pool=redis_pool,
        keep_result=86400,
        max_tries=3,
        job_timeout=600,
        poll_delay=1.0,
        handle_signals=False,
    )
