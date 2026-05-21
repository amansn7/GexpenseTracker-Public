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


@pytest.fixture
def _no_db():
    from app.sync import progress
    progress._db_session_factory = None
    yield


@pytest.mark.asyncio
async def test_persist_progress_writes_to_db():
    from app.sync.progress import _persist_progress, set_db_session_factory

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_session.execute = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute.return_value = mock_result

    mock_factory = MagicMock(return_value=mock_session)
    set_db_session_factory(mock_factory)

    prog = {
        "running": True,
        "phase": "fetching",
        "phase_detail": "",
        "current": 5,
        "total": 100,
        "tally": {},
        "previews": [],
        "current_email": None,
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }

    _persist_progress("test-user-1", prog)
    await asyncio.sleep(0.05)
    assert mock_factory.called


@pytest.mark.asyncio
async def test_persist_progress_upserts_existing():
    from app.sync.progress import _persist_progress

    mock_row = MagicMock()
    mock_row.running = True
    mock_row.phase = "fetching"

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_row
    mock_session.execute.return_value = mock_result

    mock_factory = MagicMock(return_value=mock_session)

    prog = {
        "running": False,
        "phase": "idle",
        "phase_detail": "",
        "current": 0,
        "total": 0,
        "tally": {},
        "previews": [],
        "current_email": None,
        "log": [],
        "result": {"done": True},
        "error": None,
        "minimized": False,
    }

    with patch("app.sync.progress._db_session_factory", mock_factory):
        _persist_progress("user-2", prog)
        await asyncio.sleep(0.05)

    assert mock_row.running is False
    assert mock_row.phase == "idle"
    assert mock_row.result_json == json.dumps({"done": True})


@pytest.mark.asyncio
async def test_user_progress_loads_from_db_on_cache_miss():
    from app.sync.progress import _sync_progress, _user_progress, set_db_session_factory

    mock_row = MagicMock()
    mock_row.running = True
    mock_row.phase = "processing"
    mock_row.phase_detail = "email 42/100"
    mock_row.current = 42
    mock_row.total = 100
    mock_row.result_json = None
    mock_row.error = None
    mock_row.log_json = json.dumps([{"time": "2026-01-01T00:00:00Z", "message": "test", "type": "info"}])

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_row
    mock_session.execute.return_value = mock_result

    mock_factory = MagicMock(return_value=mock_session)
    set_db_session_factory(mock_factory)

    _sync_progress.clear()

    with patch("app.sync.progress.asyncio.get_event_loop") as mock_loop:
        loop = asyncio.new_event_loop()
        mock_loop.return_value = loop
        try:
            async def _read():
                return mock_row
            mock_loop.return_value.run_until_complete = lambda coro: mock_row
            prog = _user_progress("db-user-1")
        finally:
            loop.close()

    assert prog["phase"] == "processing"
    assert prog["current"] == 42
    assert prog["total"] == 100
    assert len(prog["log"]) == 1


@pytest.mark.asyncio
async def test_recover_stale_progresses_marks_running_as_error():
    from app.sync.progress import _sync_progress, recover_stale_progresses, set_db_session_factory

    mock_row = MagicMock()
    mock_row.user_id = "stale-user-1"
    mock_row.running = True
    mock_row.phase = "fetching"
    mock_row.current = 10
    mock_row.total = 50
    mock_row.result_json = None
    mock_row.error = None
    mock_row.log_json = None

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_row]
    mock_session.execute.return_value = mock_result

    mock_factory = MagicMock(return_value=mock_session)
    set_db_session_factory(mock_factory)
    _sync_progress.clear()

    await recover_stale_progresses()

    assert mock_row.running is False
    assert mock_row.phase == "error"
    assert mock_row.error == "server restarted during sync"
    assert "stale-user-1" in _sync_progress
    assert _sync_progress["stale-user-1"]["running"] is False
    assert _sync_progress["stale-user-1"]["phase"] == "error"


@pytest.mark.asyncio
async def test_recover_stale_progresses_no_op_when_none_stale():
    from app.sync.progress import _sync_progress, recover_stale_progresses, set_db_session_factory

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_session.execute.return_value = mock_result

    mock_factory = MagicMock(return_value=mock_session)
    set_db_session_factory(mock_factory)
    _sync_progress.clear()

    await recover_stale_progresses()

    assert mock_session.commit.call_count == 0


@pytest.mark.asyncio
async def test_db_write_failure_does_not_crash():
    from app.sync.progress import _persist_progress, set_db_session_factory

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(side_effect=RuntimeError("DB dead"))
    mock_session.__aexit__ = AsyncMock(return_value=False)

    mock_factory = MagicMock(return_value=mock_session)
    set_db_session_factory(mock_factory)

    prog = {
        "running": True,
        "phase": "fetching",
        "phase_detail": "",
        "current": 0,
        "total": 0,
        "tally": {},
        "previews": [],
        "current_email": None,
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }

    _persist_progress("crash-user", prog)
    await asyncio.sleep(0.05)


def test_in_memory_dict_is_fast_path():
    from app.sync.progress import _sync_progress, get_sync_progress, set_db_session_factory

    set_db_session_factory(None)
    _sync_progress.clear()

    _sync_progress["fast-user"] = {
        "running": True,
        "phase": "fetching",
        "phase_detail": "",
        "current": 5,
        "total": 100,
        "tally": {},
        "previews": [],
        "current_email": None,
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }

    prog = get_sync_progress("fast-user")
    assert prog["running"] is True
    assert prog["phase"] == "fetching"
    assert prog["current"] == 5


def test_reset_progress_persists():
    from app.sync.progress import _reset_progress, _sync_progress, set_db_session_factory

    set_db_session_factory(None)
    _sync_progress.clear()

    _reset_progress("reset-user")

    prog = _sync_progress["reset-user"]
    assert prog["running"] is True
    assert prog["phase"] == "fetching"


def test_clear_sync_progress_removes_from_dict():
    from app.sync.progress import _sync_progress, clear_sync_progress

    _sync_progress["clear-user"] = {"running": False, "phase": "idle"}
    clear_sync_progress("clear-user")
    assert "clear-user" not in _sync_progress


def test_log_event_trims_to_50():
    from app.sync.progress import _log_event, _user_progress, set_db_session_factory

    set_db_session_factory(None)
    user_id = "log-trim-user"

    for i in range(60):
        _log_event(user_id, f"msg {i}")

    prog = _user_progress(user_id)
    assert len(prog["log"]) == 50
    assert prog["log"][0]["message"] == "msg 10"
