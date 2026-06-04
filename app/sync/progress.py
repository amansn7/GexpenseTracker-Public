"""Sync progress tracking — per-user state for the sync overlay."""

import asyncio
import json
import re
from collections import OrderedDict
from datetime import UTC, datetime
from typing import Any

import structlog

logger = structlog.get_logger()

_db_session_factory: Any | None = None

_sync_progress: dict[str, dict[str, Any]] = {}

# Bounded queue + background writer for progress persists
_progress_write_queue: "asyncio.Queue[tuple[str, dict]]" = asyncio.Queue(maxsize=1000)
_progress_writer_task: asyncio.Task | None = None
_progress_writer_running: bool = False
_progress_last_update: dict[str, datetime] = {}


def set_db_session_factory(factory):
    global _db_session_factory
    _db_session_factory = factory


def _default_progress() -> dict[str, Any]:
    return {
        "running": False,
        "phase": "idle",
        "phase_detail": "",
        "current": 0,
        "total": 0,
        "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
        "previews": [],
        "current_email": None,
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }


def _user_progress(user_id: str) -> dict[str, Any]:
    key = user_id or "default"
    if key not in _sync_progress:
        _sync_progress[key] = _load_from_db_sync(key) or _default_progress()
    return _sync_progress[key]


def _load_from_db_sync(user_id: str) -> dict[str, Any] | None:
    """Synchronous wrapper that safely loads from DB without nested event loop crash."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None:
        loop.create_task(_load_from_db_async(user_id))
        return None

    if not _db_session_factory:
        return None
    try:
        from app.models import SyncProgress

        async def _read():
            async with _db_session_factory() as session:
                from sqlalchemy import select

                row = await session.execute(select(SyncProgress).where(SyncProgress.user_id == user_id))
                return row.scalar_one_or_none()

        row = asyncio.get_event_loop().run_until_complete(_read())
        if row is None:
            return None
        return _row_to_dict(row)
    except Exception:
        return None


async def _load_from_db_async(user_id: str) -> dict[str, Any] | None:
    """Async version of _load_from_db for use when called from async context."""
    if not _db_session_factory:
        return None
    try:
        from sqlalchemy import select

        from app.models import SyncProgress

        async with _db_session_factory() as session:
            row = await session.execute(select(SyncProgress).where(SyncProgress.user_id == user_id))
            row_obj = row.scalar_one_or_none()
        if row_obj is None:
            return None
        result = _row_to_dict(row_obj)
        key = user_id or "default"
        if key not in _sync_progress:
            _sync_progress[key] = result
        return result
    except Exception:
        return None


def _row_to_dict(row) -> dict[str, Any]:
    return {
        "running": row.running,
        "phase": row.phase,
        "phase_detail": row.phase_detail or "",
        "current": row.current,
        "total": row.total,
        "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
        "previews": [],
        "current_email": None,
        "log": json.loads(row.log_json) if row.log_json else [],
        "result": json.loads(row.result_json) if row.result_json else None,
        "error": row.error,
        "minimized": False,
    }


async def _do_write_progress(user_id: str, prog: dict[str, Any]):
    """Actual DB write for a single user's progress."""
    if not _db_session_factory:
        return
    try:
        from sqlalchemy import select

        from app.models import SyncProgress

        async with _db_session_factory() as session:
            row = await session.execute(select(SyncProgress).where(SyncProgress.user_id == user_id))
            existing = row.scalar_one_or_none()
            if existing:
                existing.running = prog.get("running", False)
                existing.phase = prog.get("phase", "idle")
                existing.phase_detail = prog.get("phase_detail", "")
                existing.current = prog.get("current", 0)
                existing.total = prog.get("total", 0)
                existing.result_json = json.dumps(prog["result"]) if prog.get("result") is not None else None
                existing.error = prog.get("error")
                existing.log_json = json.dumps(prog.get("log", [])[-50:])
                from datetime import UTC, datetime

                existing.updated_at = datetime.now(UTC)
            else:
                from datetime import UTC, datetime

                session.add(
                    SyncProgress(
                        user_id=user_id,
                        running=prog.get("running", False),
                        phase=prog.get("phase", "idle"),
                        phase_detail=prog.get("phase_detail", ""),
                        current=prog.get("current", 0),
                        total=prog.get("total", 0),
                        result_json=json.dumps(prog["result"]) if prog.get("result") is not None else None,
                        error=prog.get("error"),
                        log_json=json.dumps(prog.get("log", [])[-50:]),
                        updated_at=datetime.now(UTC),
                    )
                )
            await session.commit()
    except Exception as exc:
        logger.error("progress_write_failed", user_id=user_id, error=str(exc))


async def _do_delete_progress(user_id: str):
    """Actual DB delete for a user's progress."""
    if not _db_session_factory:
        return
    try:
        from sqlalchemy import delete

        from app.models import SyncProgress

        async with _db_session_factory() as session:
            await session.execute(delete(SyncProgress).where(SyncProgress.user_id == user_id))
            await session.commit()
    except Exception as exc:
        logger.error("progress_delete_failed", user_id=user_id, error=str(exc))


async def _progress_writer_loop():
    """Background writer that drains the queue in batches every 1 second."""
    global _progress_writer_running
    _progress_writer_running = True
    pending: OrderedDict[str, dict] = OrderedDict()
    delete_pending: set = set()

    try:
        while _progress_writer_running:
            try:
                item = await asyncio.wait_for(_progress_write_queue.get(), timeout=1.0)
                user_id, data = item
                if data is None:
                    delete_pending.add(user_id)
                else:
                    pending[user_id] = data
                _progress_write_queue.task_done()
                continue
            except TimeoutError:
                pass

            if pending or delete_pending:
                writes = list(pending.items())
                pending.clear()
                deletes = list(delete_pending)
                delete_pending.clear()

                for uid, data in writes:
                    try:
                        await _do_write_progress(uid, data)
                    except Exception as exc:
                        logger.error("batch_writer_failed", user_id=uid, error=str(exc))

                for uid in deletes:
                    try:
                        await _do_delete_progress(uid)
                    except Exception as exc:
                        logger.error("batch_delete_failed", user_id=uid, error=str(exc))

            if writes or deletes:
                now = datetime.now(UTC)
                for uid in list(_progress_last_update.keys()):
                    last = _progress_last_update.get(uid)
                    if last and (now - last).total_seconds() > 60:
                        logger.warning("progress_stale_detected", user_id=uid, seconds_since_update=(now - last).total_seconds())
    except asyncio.CancelledError:
        pass
    finally:
        _progress_writer_running = False

        for uid, data in pending.items():
            try:
                await _do_write_progress(uid, data)
            except Exception as exc:
                logger.error("shutdown_write_failed", user_id=uid, error=str(exc))

        for uid in delete_pending:
            try:
                await _do_delete_progress(uid)
            except Exception as exc:
                logger.error("shutdown_delete_failed", user_id=uid, error=str(exc))


def _persist_progress(user_id: str, prog: dict[str, Any]):
    if not _db_session_factory:
        return

    _progress_last_update[user_id] = datetime.now(UTC)

    try:
        qsize = _progress_write_queue.qsize()
        if qsize > 800:
            logger.error("progress_queue_near_full", user_id=user_id, queue_size=qsize)
        _progress_write_queue.put_nowait((user_id, prog))
    except asyncio.QueueFull:
        logger.error("progress_queue_full_dropped", user_id=user_id, queue_size=_progress_write_queue.qsize())


def _log_event(user_id: str, message: str, event_type: str = "info"):
    prog = _user_progress(user_id)
    log = prog.setdefault("log", [])
    log.append(
        {
            "time": datetime.now(UTC).isoformat(),
            "message": message,
            "type": event_type,
        }
    )
    if len(log) > 50:
        log[:] = log[-50:]
    _persist_progress(user_id, prog)


def get_sync_progress(user_id: str = None) -> dict:
    return dict(_user_progress(user_id))


def get_sync_progress_public(user_id: str = None) -> dict:
    """Return sync progress with sensitive fields redacted for public API."""
    prog = get_sync_progress(user_id)
    safe = dict(prog)
    safe.pop("current_email", None)
    safe.pop("previews", None)
    return safe


def _reset_progress(user_id: str):
    key = user_id or "default"
    prog = {
        **_default_progress(),
        "running": True,
        "phase": "fetching",
    }
    _sync_progress[key] = prog
    _persist_progress(user_id, prog)


def _add_preview(user_id: str, msg: dict, label: str, category, amount):
    prog = _user_progress(user_id)
    subject = (msg.get("subject") or "").strip() or "(no subject)"
    sender = msg.get("sender") or ""
    m = re.search(r"<([^>]+)>", sender)
    sender_short = m.group(1) if m else sender
    entry = {
        "subject": subject[:72],
        "sender": sender_short[:48],
        "label": label,
        "category": category,
        "amount": float(amount) if amount is not None else None,
    }
    prog["previews"] = [entry] + prog["previews"][:7]
    prog["tally"][label] = prog["tally"].get(label, 0) + 1
    prog["current_email"] = entry
    _persist_progress(user_id, prog)


def set_sync_minimized(user_id: str, minimized: bool):
    prog = _user_progress(user_id)
    prog["minimized"] = minimized
    _persist_progress(user_id, prog)


def _delete_from_db(user_id: str):
    """Enqueue a delete for the background writer."""
    if not _db_session_factory:
        return

    try:
        _progress_write_queue.put_nowait((user_id, None))
    except asyncio.QueueFull:
        logger.warning("progress_queue_full", user_id=user_id, operation="delete")


def clear_sync_progress(user_id: str = None):
    key = user_id or "default"
    _sync_progress.pop(key, None)
    _delete_from_db(user_id)


async def recover_stale_progresses():
    if not _db_session_factory:
        return
    try:
        from datetime import UTC, datetime

        from sqlalchemy import select

        from app.models import SyncProgress

        async with _db_session_factory() as session:
            result = await session.execute(select(SyncProgress).where(SyncProgress.running.is_(True)))
            stale = result.scalars().all()
            for row in stale:
                row.running = False
                row.phase = "error"
                row.error = "server restarted during sync"
                row.updated_at = datetime.now(UTC)
                key = row.user_id
                _sync_progress[key] = {
                    "running": False,
                    "phase": "error",
                    "phase_detail": "",
                    "current": row.current,
                    "total": row.total,
                    "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
                    "previews": [],
                    "current_email": None,
                    "log": json.loads(row.log_json) if row.log_json else [],
                    "result": json.loads(row.result_json) if row.result_json else None,
                    "error": "server restarted during sync",
                    "minimized": False,
                }
            if stale:
                await session.commit()
                logger.info("stale_progress_recovered", count=len(stale))
    except Exception as exc:
        logger.warning("recover_stale_progresses_failed", error=str(exc))


def start_progress_writer():
    """Start the background progress writer task. Call from lifespan startup."""
    global _progress_writer_task, _progress_writer_running
    if _progress_writer_task is not None and not _progress_writer_task.done():
        return
    _progress_writer_running = True
    _progress_writer_task = asyncio.create_task(_progress_writer_loop())
    logger.info("progress_writer_started")


async def stop_progress_writer():
    """Stop the background progress writer and drain remaining items. Call from lifespan shutdown."""
    global _progress_writer_task, _progress_writer_running
    if _progress_writer_task is None:
        return
    _progress_writer_running = False
    _progress_writer_task.cancel()
    try:
        await _progress_writer_task
    except asyncio.CancelledError:
        pass
    _progress_writer_task = None
    logger.info("progress_writer_stopped")
