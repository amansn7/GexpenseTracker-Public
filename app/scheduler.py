"""Legacy scheduler module — replaced by ARQ (app/arq_worker.py).

APScheduler has been replaced by ARQ's distributed cron scheduler.
This module re-exports _delete_expired_accounts for backward compatibility.

See app/arq_worker.py for the new scheduling system.
"""

from app.scheduler_helpers import delete_expired_accounts as _delete_expired_accounts

__all__ = ["_delete_expired_accounts"]
