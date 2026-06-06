"""ARQ scheduler lifecycle — start/stop for integration with FastAPI lifespan.

Usage in main.py:
    from app.arq_scheduler import start_arq_scheduler, stop_arq_scheduler

    # In lifespan startup:
    await start_arq_scheduler()

    # In lifespan shutdown:
    await stop_arq_scheduler()
"""

import asyncio
import logging
import time

import structlog

logger = structlog.get_logger()
_std_logger = logging.getLogger(__name__)

_worker = None
_worker_task: asyncio.Task | None = None
_metrics = {
    "started_at": None,
    "missed_ticks": 0,
    "backlog_depth": 0,
    "job_failures": 0,
}


async def start_arq_scheduler():
    """Start the ARQ worker in a background asyncio task."""
    from app.arq_worker import create_worker

    global _worker, _worker_task
    _worker = create_worker()
    _worker_task = asyncio.create_task(_worker.async_run())
    _metrics["started_at"] = time.time()
    logger.info("arq_scheduler_started")


async def stop_arq_scheduler():
    """Gracefully stop the ARQ worker."""
    global _worker, _worker_task
    if _worker:
        await _worker.close()
        if _worker_task:
            try:
                await asyncio.wait_for(_worker_task, timeout=10.0)
            except asyncio.TimeoutError:
                _worker_task.cancel()
                try:
                    await _worker_task
                except asyncio.CancelledError:
                    pass
            except asyncio.CancelledError:
                pass
        _worker = None
        _worker_task = None
        logger.info("arq_scheduler_stopped")


def get_arq_metrics() -> dict:
    """Return scheduler health metrics for the health endpoint."""
    uptime = 0.0
    if _metrics["started_at"]:
        uptime = round(time.time() - _metrics["started_at"], 1)

    return {
        "running": _worker is not None and _worker_task is not None and not _worker_task.done(),
        "uptime_seconds": uptime,
        "worker_type": "arq",
        "backlog_depth": _metrics["backlog_depth"],
        "missed_ticks": _metrics["missed_ticks"],
        "job_failures": _metrics["job_failures"],
        "cron_jobs": 8,
    }
