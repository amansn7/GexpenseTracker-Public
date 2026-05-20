"""Sync progress tracking — per-user state for the sync overlay."""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_db_session_factory: Optional[Any] = None

_sync_progress: Dict[str, Dict[str, Any]] = {}


def set_db_session_factory(factory):
    global _db_session_factory
    _db_session_factory = factory


def _default_progress() -> Dict[str, Any]:
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


def _user_progress(user_id: str) -> Dict[str, Any]:
    key = user_id or "default"
    if key not in _sync_progress:
        _sync_progress[key] = _load_from_db(key) or _default_progress()
    return _sync_progress[key]


def _load_from_db(user_id: str) -> Optional[Dict[str, Any]]:
    if not _db_session_factory:
        return None
    try:
        from app.models import SyncProgress

        async def _read():
            async with _db_session_factory() as session:
                from sqlalchemy import select
                row = await session.execute(
                    select(SyncProgress).where(SyncProgress.user_id == user_id)
                )
                return row.scalar_one_or_none()

        row = asyncio.get_event_loop().run_until_complete(_read())
        if row is None:
            return None
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
    except Exception:
        return None


def _persist_progress(user_id: str, prog: Dict[str, Any]):
    if not _db_session_factory:
        return

    async def _write():
        try:
            from app.models import SyncProgress
            from sqlalchemy import select

            async with _db_session_factory() as session:
                row = await session.execute(
                    select(SyncProgress).where(SyncProgress.user_id == user_id)
                )
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
                    session.add(SyncProgress(
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
                    ))
                await session.commit()
        except Exception:
            pass

    asyncio.create_task(_write())


def _log_event(user_id: str, message: str, event_type: str = "info"):
    prog = _user_progress(user_id)
    log = prog.setdefault("log", [])
    log.append({
        "time": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "type": event_type,
    })
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
    """Delete sync progress for a user from the database (fire-and-forget)."""
    if not _db_session_factory:
        return

    async def _delete():
        try:
            from app.models import SyncProgress
            from sqlalchemy import delete

            async with _db_session_factory() as session:
                await session.execute(
                    delete(SyncProgress).where(SyncProgress.user_id == user_id)
                )
                await session.commit()
        except Exception:
            pass

    asyncio.create_task(_delete())


def clear_sync_progress(user_id: str = None):
    key = user_id or "default"
    _sync_progress.pop(key, None)
    _delete_from_db(user_id)


async def recover_stale_progresses():
    if not _db_session_factory:
        return
    try:
        from app.models import SyncProgress
        from sqlalchemy import select
        from datetime import UTC, datetime

        async with _db_session_factory() as session:
            result = await session.execute(
                select(SyncProgress).where(SyncProgress.running.is_(True))
            )
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
                logger.info("Recovered %d stale sync progress entries", len(stale))
    except Exception as exc:
        logger.warning("recover_stale_progresses failed: %s", exc)
