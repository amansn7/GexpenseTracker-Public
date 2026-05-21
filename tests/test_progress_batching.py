"""Tests for batched progress writes — queue, writer lifecycle, and async safety."""
import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _reset_progress_state():
    """Reset module-level state before and after each test."""
    import app.sync.progress as progress_mod
    progress_mod._sync_progress.clear()
    progress_mod._progress_writer_running = False

    old_queue = progress_mod._progress_write_queue
    while not old_queue.empty():
        try:
            old_queue.get_nowait()
            old_queue.task_done()
        except asyncio.QueueEmpty:
            break

    if progress_mod._progress_writer_task and not progress_mod._progress_writer_task.done():
        progress_mod._progress_writer_task.cancel()

    progress_mod._progress_write_queue = asyncio.Queue(maxsize=100)
    progress_mod._progress_writer_task = None

    yield

    progress_mod._sync_progress.clear()
    progress_mod._progress_writer_running = False
    while not progress_mod._progress_write_queue.empty():
        try:
            progress_mod._progress_write_queue.get_nowait()
            progress_mod._progress_write_queue.task_done()
        except asyncio.QueueEmpty:
            break
    if progress_mod._progress_writer_task and not progress_mod._progress_writer_task.done():
        progress_mod._progress_writer_task.cancel()
    progress_mod._progress_writer_task = None


@pytest.mark.asyncio
async def test_batch_progress_updates():
    """500 rapid progress updates should result in <= 10 DB writes due to batching."""
    import app.sync.progress as progress_mod

    write_count = 0

    async def fake_write(uid, prog):
        nonlocal write_count
        write_count += 1

    with patch.object(progress_mod, "_db_session_factory", new=MagicMock()):
        with patch.object(progress_mod, "_do_write_progress", side_effect=fake_write):
            for i in range(500):
                progress_mod._persist_progress("user1", {"phase": f"step_{i}", "current": i, "total": 500})

            queue_size = progress_mod._progress_write_queue.qsize()
            assert queue_size == 100, f"Expected 100 items in queue (maxsize), got {queue_size}"

            progress_mod._progress_writer_running = True
            writer_task = asyncio.create_task(progress_mod._progress_writer_loop())
            await asyncio.sleep(0.5)

            progress_mod._progress_writer_running = False
            writer_task.cancel()
            try:
                await writer_task
            except asyncio.CancelledError:
                pass

            assert write_count <= 10, f"Expected <= 10 DB writes, got {write_count}"


@pytest.mark.asyncio
async def test_writer_exception_logged_not_swallowed():
    """When a DB write raises, the error should be logged, not silently swallowed."""
    import app.sync.progress as progress_mod
    import sys
    from io import StringIO

    async def failing_write(uid, prog):
        raise RuntimeError("DB connection lost")

    with patch.object(progress_mod, "_db_session_factory", new=MagicMock()):
        with patch.object(progress_mod, "_do_write_progress", side_effect=failing_write):
            progress_mod._persist_progress("user_err", {"phase": "error_test"})

            # Capture stdout where structlog writes
            old_stdout = sys.stdout
            sys.stdout = StringIO()
            progress_mod._progress_writer_running = True
            writer_task = asyncio.create_task(progress_mod._progress_writer_loop())
            await asyncio.sleep(0.5)

            progress_mod._progress_writer_running = False
            writer_task.cancel()
            try:
                await writer_task
            except asyncio.CancelledError:
                pass

            output = sys.stdout.getvalue()
            sys.stdout = old_stdout

            # structlog JSON output should contain the error
            assert "shutdown_write_failed" in output or "DB connection lost" in output or "user_err" in output


@pytest.mark.asyncio
async def test_load_from_db_async_no_nested_loop_crash():
    """_load_from_db called from async context should not crash with nested event loop."""
    import app.sync.progress as progress_mod

    fake_row = MagicMock()
    fake_row.running = False
    fake_row.phase = "idle"
    fake_row.phase_detail = ""
    fake_row.current = 0
    fake_row.total = 0
    fake_row.log_json = None
    fake_row.result_json = None
    fake_row.error = None

    async def fake_read(*args, **kwargs):
        result = MagicMock()
        result.scalar_one_or_none.return_value = fake_row
        return result

    fake_session = AsyncMock()
    fake_session.execute = fake_read
    fake_session.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session.__aexit__ = AsyncMock(return_value=False)

    fake_factory = MagicMock()
    fake_factory.return_value = fake_session

    with patch.object(progress_mod, "_db_session_factory", new=fake_factory):
        result = await progress_mod._load_from_db_async("async_user")

        assert result is not None
        assert result["phase"] == "idle"
        assert "async_user" in progress_mod._sync_progress


@pytest.mark.asyncio
async def test_queue_full_warning_logged():
    """When the queue is full, a warning should be logged and the update dropped."""
    import app.sync.progress as progress_mod
    import sys
    from io import StringIO

    small_queue = asyncio.Queue(maxsize=2)
    small_queue.put_nowait(("user1", {"phase": "a"}))
    small_queue.put_nowait(("user2", {"phase": "b"}))

    with patch.object(progress_mod, "_progress_write_queue", new=small_queue):
        with patch.object(progress_mod, "_db_session_factory", new=MagicMock()):
            # Capture stdout where structlog writes
            old_stdout = sys.stdout
            sys.stdout = StringIO()
            progress_mod._persist_progress("user3", {"phase": "c"})
            output = sys.stdout.getvalue()
            sys.stdout = old_stdout

            assert "progress_queue_full" in output or "user3" in output


@pytest.mark.asyncio
async def test_writer_drains_on_stop():
    """Writer should drain remaining items when stopped."""
    import app.sync.progress as progress_mod

    write_count = 0
    written_users = []

    async def track_write(uid, prog):
        nonlocal write_count
        write_count += 1
        written_users.append(uid)

    with patch.object(progress_mod, "_db_session_factory", new=MagicMock()):
        with patch.object(progress_mod, "_do_write_progress", side_effect=track_write):
            for i in range(5):
                progress_mod._persist_progress(f"user_{i}", {"phase": "pending"})

            progress_mod._progress_writer_running = True
            progress_mod._progress_writer_task = asyncio.create_task(progress_mod._progress_writer_loop())

            await asyncio.sleep(0.1)

            await progress_mod.stop_progress_writer()

            assert write_count == 5, f"Expected 5 writes on drain, got {write_count}"
