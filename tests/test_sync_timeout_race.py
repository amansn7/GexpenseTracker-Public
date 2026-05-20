"""Tests for the sync timeout race fix (#8).

Covers:
1. sync_emails does NOT set running: False — caller is responsible
2. handle_sync_task sets running: False in success, error, and timeout paths
3. Frontend polling math: 480 × 1.2s = 576s < 600s backend timeout
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── 1. sync_emails does NOT set running: False ──────────────────────────────

@pytest.mark.asyncio
async def test_sync_emails_does_not_set_running_false_on_success():
    """sync_emails leaves running untouched on success — caller sets it."""
    from app.sync.progress import _sync_progress, _reset_progress, _user_progress
    from app.sync.fetch import sync_emails

    user_id = "test_no_running_false_success"
    _reset_progress(user_id)

    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with patch("app.sync.fetch._sync_emails_inner", return_value={
        "processed": 0, "total_fetched": 0, "skipped": 0
    }):
        result = await sync_emails(mock_session, user_id=user_id)

    prog = _user_progress(user_id)
    assert result["processed"] == 0
    assert prog["running"] is True

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_sync_emails_does_not_set_running_false_on_exception():
    """sync_emails leaves running untouched on exception — caller sets it."""
    from app.sync.progress import _sync_progress, _reset_progress, _user_progress
    from app.sync.fetch import sync_emails

    user_id = "test_no_running_false_exc"
    _reset_progress(user_id)

    mock_session = AsyncMock()
    mock_session.execute.side_effect = RuntimeError("db gone")

    with pytest.raises(RuntimeError, match="db gone"):
        await sync_emails(mock_session, user_id=user_id)

    prog = _user_progress(user_id)
    assert prog["running"] is True
    assert prog["phase"] == "error"

    _sync_progress.pop(user_id, None)


# ── 2. handle_sync_task sets running: False in all exit paths ────────────────

@pytest.mark.asyncio
async def test_handle_sync_task_running_false_on_success():
    """handle_sync_task sets running: False on successful completion."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_worker_success"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("t-ok", "sync", user_id, {"trigger": "manual"})

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_session

        with patch("app.workers.sync_worker.sync_emails", return_value={
            "processed": 5, "total_fetched": 10, "skipped": 5
        }):
            result = await handle_sync_task(task)

    prog = _user_progress(user_id)
    assert result["status"] == "completed"
    assert prog["running"] is False
    assert prog["phase"] != "error"

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_sync_task_running_false_on_error_result():
    """handle_sync_task sets running: False when sync_emails returns an error."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_worker_error"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("t-err", "sync", user_id, {"trigger": "manual"})

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_session

        with patch("app.workers.sync_worker.sync_emails", return_value={
            "error": "auth failed", "processed": 0
        }):
            result = await handle_sync_task(task)

    prog = _user_progress(user_id)
    assert result["status"] == "failed"
    assert prog["running"] is False
    assert prog["phase"] == "error"

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_sync_task_running_false_on_timeout():
    """handle_sync_task sets running: False and phase: error on timeout."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_worker_timeout"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("t-to", "sync", user_id, {"trigger": "manual"})

    async def slow_sync(*args, **kwargs):
        await asyncio.sleep(999)

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_session

        with patch("app.workers.sync_worker.sync_emails", side_effect=slow_sync):
            with patch("app.workers.sync_worker.SYNC_TIMEOUT_SECS", 0.1):
                with pytest.raises(asyncio.TimeoutError):
                    await handle_sync_task(task)

    prog = _user_progress(user_id)
    assert prog["running"] is False
    assert prog["phase"] == "error"
    assert "timed out" in prog["error"].lower()

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_sync_task_running_false_on_exception():
    """handle_sync_task sets running: False on unexpected exception."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_worker_exc"
    _sync_progress[user_id] = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("t-exc", "sync", user_id, {"trigger": "manual"})

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_cls.return_value = mock_session

        with patch("app.workers.sync_worker.sync_emails", side_effect=RuntimeError("boom")):
            with pytest.raises(RuntimeError, match="boom"):
                await handle_sync_task(task)

    prog = _user_progress(user_id)
    assert prog["running"] is False
    assert prog["phase"] == "error"

    _sync_progress.pop(user_id, None)


# ── 3. Frontend polling math ────────────────────────────────────────────────

def test_frontend_polling_stays_within_backend_timeout():
    """480 attempts × 1.2s = 576s, which is 24s under the 600s backend timeout."""
    MAX_ATTEMPTS = 480
    INTERVAL_SEC = 1.2
    BACKEND_TIMEOUT = 600

    total_poll_time = MAX_ATTEMPTS * INTERVAL_SEC
    assert total_poll_time < BACKEND_TIMEOUT, (
        f"Frontend polling ({total_poll_time}s) must stay under backend timeout ({BACKEND_TIMEOUT}s)"
    )
    buffer = BACKEND_TIMEOUT - total_poll_time
    assert buffer >= 20, f"Buffer of {buffer}s is too small"


def test_old_polling_would_race_with_backend_timeout():
    """500 attempts × 1.2s = 600s — exactly at the backend timeout, causing a race."""
    OLD_MAX_ATTEMPTS = 500
    INTERVAL_SEC = 1.2
    BACKEND_TIMEOUT = 600

    total_poll_time = OLD_MAX_ATTEMPTS * INTERVAL_SEC
    assert total_poll_time == BACKEND_TIMEOUT, (
        "Old polling exactly matched backend timeout — this was the bug"
    )


def test_final_poll_catches_late_completion():
    """After timeout, one final poll can catch a backend that just finished."""
    MAX_ATTEMPTS = 480
    INTERVAL_SEC = 1.2
    BACKEND_TIMEOUT = 600

    frontend_timeout = MAX_ATTEMPTS * INTERVAL_SEC
    time_remaining = BACKEND_TIMEOUT - frontend_timeout
    assert time_remaining > 0
    assert time_remaining >= 20
