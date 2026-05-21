"""Tests for sync progress persistence (updated for batched writer)."""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _clean_progress():
    from app.sync.progress import _sync_progress
    _sync_progress.clear()
    yield
    _sync_progress.clear()


@pytest.mark.asyncio
async def test_persist_progress_enqueues():
    """_persist_progress should enqueue to the bounded queue."""
    from app.sync.progress import _persist_progress, _progress_write_queue

    # Drain any leftover items first
    while not _progress_write_queue.empty():
        try:
            _progress_write_queue.get_nowait()
        except asyncio.QueueEmpty:
            break

    prog = {"running": True, "phase": "fetching", "phase_detail": "", "current": 5, "total": 100}
    _persist_progress("test-user-1", prog)
    await asyncio.sleep(0.01)
    assert _progress_write_queue.qsize() >= 1


@pytest.mark.asyncio
async def test_persist_progress_upserts_via_writer():
    """The background writer should call _do_write_progress which upserts."""
    from app.sync.progress import (
        _persist_progress,
        _do_write_progress,
        _progress_write_queue,
        _progress_writer_running,
    )

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_factory = MagicMock(return_value=mock_session)
    from app.sync.progress import set_db_session_factory
    set_db_session_factory(mock_factory)

    prog = {
        "running": True, "phase": "fetching", "phase_detail": "",
        "current": 5, "total": 100, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    # Call _do_write_progress directly (bypass queue)
    await _do_write_progress("test-user-2", prog)

    # Verify session was used
    assert mock_session.execute.called


@pytest.mark.asyncio
async def test_user_progress_loads_from_db_on_cache_miss():
    """When cache miss, _load_from_db_async should populate cache from DB."""
    from app.sync.progress import _load_from_db_async, _sync_progress, set_db_session_factory

    fake_row = MagicMock()
    fake_row.running = False
    fake_row.phase = "processing"
    fake_row.phase_detail = "done"
    fake_row.current = 50
    fake_row.total = 100
    fake_row.log_json = None
    fake_row.result_json = None
    fake_row.error = None

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = fake_row
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_factory = MagicMock(return_value=mock_session)
    set_db_session_factory(mock_factory)

    result = await _load_from_db_async("db-user")

    assert result is not None
    assert result["phase"] == "processing"
    assert "db-user" in _sync_progress
