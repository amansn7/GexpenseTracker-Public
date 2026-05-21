# Compatibility shim — all logic moved to app/sync/ package.
# This file re-exports everything for backward compatibility.
from app.sync import (  # noqa: F401
    _add_preview,
    _default_progress,
    _log_event,
    _reset_progress,
    _sync_progress,
    _user_progress,
    clean_bodies_job,
    clear_sync_progress,
    get_sync_progress,
    run_sync,
    run_sync_range,
    scan_all_for_duplicates,
    set_sync_minimized,
    sync_emails,
)

__all__ = [
    "_sync_progress",
    "_default_progress",
    "_user_progress",
    "_log_event",
    "get_sync_progress",
    "_reset_progress",
    "_add_preview",
    "set_sync_minimized",
    "clear_sync_progress",
    "run_sync",
    "sync_emails",
    "run_sync_range",
    "clean_bodies_job",
    "scan_all_for_duplicates",
]
