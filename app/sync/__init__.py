"""Backward-compatible re-exports for app.sync package."""
from app.sync.fetch import clean_bodies_job, run_sync, sync_emails
from app.sync.progress import (
    _add_preview,
    _default_progress,
    _log_event,
    _reset_progress,
    _sync_progress,
    _user_progress,
    clear_sync_progress,
    get_sync_progress,
    get_sync_progress_public,
    set_sync_minimized,
    start_progress_writer,
    stop_progress_writer,
)
from app.sync.range import run_sync_range


# Additional function from the original sync.py
async def scan_all_for_duplicates(user_id: str) -> dict:
    """
    Scan ALL existing expense transactions for duplicate candidates.
    Runs detect_and_record_duplicates on every expense tx with a linked email.
    Safe to run periodically — already-paired transactions are skipped
    (dedup service checks _pair_exists_query before creating new pairs).

    Returns {checked, new_pairs} where new_pairs is the count of newly
    created DuplicatePair rows (beyond what the dedup service already found).
    """
    import logging

    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.database import AsyncSessionLocal
    from app.dedup.service import detect_and_record_duplicates
    from app.models import DuplicatePair, Email, Label, Transaction

    logger = logging.getLogger(__name__)

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                Transaction.label == Label.expense,
            )
        )).all()

        checked = 0
        _user_pairs_q = (
            select(func.count(DuplicatePair.id))
            .join(Transaction, Transaction.id == DuplicatePair.primary_tx_id)
            .join(Email, Email.id == Transaction.email_id)
            .where(Email.user_id == user_id)
        )
        before = (await session.execute(_user_pairs_q)).scalar()

        for t, email in rows:
            try:
                await detect_and_record_duplicates(t, email, session)
                checked += 1
            except Exception as exc:
                logger.error("Dedup scan failed for tx %s: %s", t.id, exc)

        await session.commit()

        after = (await session.execute(_user_pairs_q)).scalar()
        new_pairs = (after or 0) - (before or 0)

        logger.info("scan_all_for_duplicates: checked %d, new pairs %d", checked, new_pairs)
        return {"checked": checked, "new_pairs": new_pairs}


__all__ = [
    "_sync_progress",
    "_default_progress",
    "_user_progress",
    "_log_event",
    "get_sync_progress",
    "get_sync_progress_public",
    "_reset_progress",
    "_add_preview",
    "set_sync_minimized",
    "clear_sync_progress",
    "start_progress_writer",
    "stop_progress_writer",
    "run_sync",
    "sync_emails",
    "run_sync_range",
    "clean_bodies_job",
    "scan_all_for_duplicates",
]
