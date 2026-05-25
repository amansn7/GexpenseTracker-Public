"""In-memory alert store — surfaced on the dashboard to notify the user of service issues."""

from collections import deque
from datetime import UTC, datetime

_alerts: deque = deque(maxlen=20)


def add_alert(level: str, message: str, source: str = "") -> None:
    """level: info | warning | error"""
    _alerts.appendleft(
        {
            "level": level,
            "message": message,
            "source": source,
            "ts": datetime.now(UTC).isoformat(),
            "read": False,
        }
    )


def get_alerts() -> list[dict]:
    return list(_alerts)


def clear_alerts() -> None:
    _alerts.clear()


def mark_all_read() -> None:
    for a in _alerts:
        a["read"] = True
