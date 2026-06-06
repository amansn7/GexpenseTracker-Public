"""Backward-compatible re-exports for app.sync package."""

import time
from collections.abc import Callable
from datetime import UTC, datetime

import structlog
from sqlalchemy import func, select

from app.database import AsyncSessionLocal
from app.dedup.service import detect_and_record_duplicates
from app.models import DuplicatePair, Email, Label, SyncState, Transaction

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

logger = structlog.get_logger()


# ── Rate limiter for dedup scans ─────────────────────────────────────────────


class _DedupRateLimiter:
    """Simple in-memory sliding-window rate limiter for dedup scans.

    Tracks scan starts within a configurable time window. Rejects scans
    when the limit is exceeded. Thread-safe for asyncio single-thread use.
    """

    def __init__(self, max_scans: int = 60, window_seconds: int = 60):
        self._max_scans = max_scans
        self._window_seconds = window_seconds
        self._timestamps: list[float] = []

    @property
    def max_scans(self) -> int:
        return self._max_scans

    @max_scans.setter
    def max_scans(self, value: int) -> None:
        self._max_scans = value

    def allow(self) -> bool:
        now = time.monotonic()
        cutoff = now - self._window_seconds
        self._timestamps = [t for t in self._timestamps if t > cutoff]
        if len(self._timestamps) >= self._max_scans:
            return False
        self._timestamps.append(now)
        return True

    def reset(self) -> None:
        self._timestamps.clear()


# Global rate limiter instance — shared across all call sites
dedup_rate_limiter = _DedupRateLimiter(max_scans=60, window_seconds=60)


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _get_unconfirmed_pair_counts(session) -> list[tuple[str, int]]:
    """Return (user_id, unconfirmed_pair_count) ordered descending."""
    rows = (
        await session.execute(
            select(
                Email.user_id,
                func.count(DuplicatePair.id).label("pair_count"),
            )
            .join(Transaction, Transaction.id == DuplicatePair.primary_tx_id)
            .join(Email, Email.id == Transaction.email_id)
            .where(DuplicatePair.status == "pending")
            .group_by(Email.user_id)
            .order_by(func.count(DuplicatePair.id).desc())
        )
    ).all()
    return [(r.user_id, r.pair_count) for r in rows]


async def _eligible_scan_users(session) -> list[tuple[str, bool]]:
    """Return (user_id, has_new_tx) for users who need a dedup scan.

    A user needs a scan when either:
      - last_dedup_scan_at IS NULL (never scanned)
      - last_dedup_scan_at < max(transaction.created_at) (new activity)
    """
    from sqlalchemy import select as _select

    states = (
        await session.execute(
            _select(SyncState).where(SyncState.user_id.isnot(None))
        )
    ).scalars().all()

    eligible: list[tuple[str, bool]] = []
    for state in states:
        if state.user_id is None:
            continue
        if state.last_dedup_scan_at is None:
            eligible.append((state.user_id, True))
            continue
        latest_tx = (
            await session.execute(
                select(func.max(Transaction.created_at))
                .join(Email, Transaction.email_id == Email.id)
                .where(Email.user_id == state.user_id)
            )
        ).scalar()
        has_new = latest_tx is not None and (
            latest_tx.replace(tzinfo=UTC) > state.last_dedup_scan_at.replace(tzinfo=UTC)
        )
        if has_new:
            eligible.append((state.user_id, has_new))
    return eligible


async def _update_last_dedup_scan_at(user_id: str, session) -> None:
    state = (
        await session.execute(
            select(SyncState).where(SyncState.user_id == user_id)
        )
    ).scalar_one_or_none()
    if state is not None:
        state.last_dedup_scan_at = datetime.now(UTC)


# ── Main functions ───────────────────────────────────────────────────────────


async def scan_all_for_duplicates(user_id: str) -> dict:
    """Scan ALL existing expense transactions for a single user.

    Runs detect_and_record_duplicates on every expense tx with a linked email.
    Safe to run periodically — already-paired transactions are skipped
    (dedup service checks existing pairs before creating new ones).

    Returns {checked, new_pairs, duration_ms} where new_pairs is the count of
    newly created DuplicatePair rows.
    """
    start_ts = time.monotonic()

    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(Transaction, Email)
                .join(Email, Transaction.email_id == Email.id)
                .where(
                    Email.user_id == user_id,
                    Transaction.label == Label.expense,
                )
            )
        ).all()

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
                logger.error("dedup_scan_tx_error", user_id=user_id, tx_id=t.id, error=str(exc))

        await session.commit()

        after = (await session.execute(_user_pairs_q)).scalar()
        new_pairs = (after or 0) - (before or 0)

    duration_ms = int((time.monotonic() - start_ts) * 1000)
    logger.info(
        "dedup_scan_user_complete",
        user_id=user_id,
        checked=checked,
        new_pairs=new_pairs,
        duration_ms=duration_ms,
    )
    return {"checked": checked, "new_pairs": new_pairs, "duration_ms": duration_ms}


async def _scan_single_user(user_id: str, summary: dict, write_session=None) -> None:
    """Scan one user and update summary."""
    result = await scan_all_for_duplicates(user_id)
    if write_session is None:
        async with AsyncSessionLocal() as ws:
            await _update_last_dedup_scan_at(user_id, ws)
            await ws.commit()
    else:
        await _update_last_dedup_scan_at(user_id, write_session)
        await write_session.commit()
    summary["scanned"] += 1
    summary["new_pairs"] += result.get("new_pairs", 0)
    summary["total_checked"] += result.get("checked", 0)


async def _run_scan_loop(eligible: list[tuple[str, bool]], priority_map: dict[str, int], summary: dict, dry_run: bool, write_session=None) -> None:
    """Rate-limited scan loop over eligible users in priority order."""
    eligible.sort(key=lambda item: (-priority_map.get(item[0], 0), 0 if item[1] else 1))
    for user_id, _ in eligible:
        if not dedup_rate_limiter.allow():
            summary["rate_limited"] += 1
            continue
        if dry_run:
            summary["scanned"] += 1
            continue
        try:
            await _scan_single_user(user_id, summary, write_session=write_session)
        except Exception as exc:
            logger.error("adaptive_dedup_scan_user_error", user_id=user_id, error=str(exc))
            summary["errors"] += 1


async def adaptive_dedup_scan(
    *,
    user_id_override: str | None = None,
    dry_run: bool = False,
    session=None,
) -> dict:
    """Adaptive dedup scan — rate-limited, prioritized, incremental.

    Features:
      - Rate-limited: at most N scans per minute (configurable via
        dedup_rate_limiter.max_scans).
      - Prioritized: users with the most unconfirmed DuplicatePair rows
        are scanned first.
      - Incremental: only users who have new transactions since their
        last_dedup_scan_at are considered.
      - Tracks last_dedup_scan_at per user so the next scan is smaller.

    Args:
        user_id_override: If set, only scan this user.
        dry_run: If True, return eligible count without scanning.
        session: Optional AsyncSession. If provided, used for read queries.
            The function will still create its own session for writes.

    Returns summary dict with counts of scanned, skipped (rate-limited),
    new pairs, etc.
    """
    summary: dict = {
        "eligible": 0,
        "scanned": 0,
        "rate_limited": 0,
        "new_pairs": 0,
        "total_checked": 0,
        "errors": 0,
        "duration_ms": 0,
    }
    start_ts = time.monotonic()

    if user_id_override is not None:
        if not dedup_rate_limiter.allow():
            logger.warning("dedup_scan_rate_limited", user_id=user_id_override)
            summary["rate_limited"] = 1
            return summary
        if dry_run:
            summary["eligible"] = 1
            return summary
        await _scan_single_user(user_id_override, summary, write_session=session)
        summary["duration_ms"] = int((time.monotonic() - start_ts) * 1000)
        return summary

    if session is not None:
        eligible = await _eligible_scan_users(session)
        if not eligible:
            logger.info("adaptive_dedup_scan_no_eligible")
            return summary
        summary["eligible"] = len(eligible)
        priority_map = dict(await _get_unconfirmed_pair_counts(session))
        await _run_scan_loop(eligible, priority_map, summary, dry_run, write_session=session)
        summary["duration_ms"] = int((time.monotonic() - start_ts) * 1000)
        logger.info("adaptive_dedup_scan_complete", **summary)
        return summary

    async with AsyncSessionLocal() as read_session:
        eligible = await _eligible_scan_users(read_session)
        if not eligible:
            logger.info("adaptive_dedup_scan_no_eligible")
            return summary
        summary["eligible"] = len(eligible)
        priority_map = dict(await _get_unconfirmed_pair_counts(read_session))
        await _run_scan_loop(eligible, priority_map, summary, dry_run)

    summary["duration_ms"] = int((time.monotonic() - start_ts) * 1000)
    logger.info("adaptive_dedup_scan_complete", **summary)
    return summary


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
    "adaptive_dedup_scan",
    "dedup_rate_limiter",
]
