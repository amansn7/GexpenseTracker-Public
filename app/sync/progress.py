"""Sync progress tracking — per-user state for the sync overlay."""
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict

logger = logging.getLogger(__name__)

# Per-user sync progress — keyed by user_id (or "default" for legacy)
_sync_progress: Dict[str, Dict[str, Any]] = {}


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
        _sync_progress[key] = _default_progress()
    return _sync_progress[key]


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


def get_sync_progress(user_id: str = None) -> dict:
    return dict(_user_progress(user_id))


def _reset_progress(user_id: str):
    _sync_progress[user_id or "default"] = {
        **_default_progress(),
        "running": True,
        "phase": "fetching",
    }


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


def set_sync_minimized(user_id: str, minimized: bool):
    prog = _user_progress(user_id)
    prog["minimized"] = minimized


def clear_sync_progress(user_id: str = None):
    key = user_id or "default"
    _sync_progress.pop(key, None)
