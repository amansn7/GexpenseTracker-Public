import asyncio
from unittest.mock import MagicMock, patch

import pytest

from app.workers.queue import Task, TaskQueue
from app.workers.sync_worker import (
    handle_fetch_range_task,
    register_fetch_range,
)


@pytest.mark.asyncio
async def test_handle_fetch_range_task_respects_timeout():
    """handle_fetch_range_task should raise TimeoutError when run_sync_range exceeds limit."""
    from app.sync.progress import _reset_progress, _sync_progress, _user_progress

    user_id = "test_fetch_range_timeout"
    _reset_progress(user_id)

    task = Task(
        "task-fetch-timeout",
        "fetch_range",
        user_id,
        {
            "after_date": "2024/01/01",
            "before_date": "2024/03/31",
            "llm_priority": False,
        },
    )

    async def slow_run_sync_range(*args, **kwargs):
        await asyncio.sleep(999)

    try:
        with patch("app.sync.range.run_sync_range", side_effect=slow_run_sync_range):
            with patch("app.workers.sync_worker.FETCH_RANGE_TIMEOUT_SECS", 0.1):
                with pytest.raises(asyncio.TimeoutError):
                    await handle_fetch_range_task(task)

        prog = _user_progress(user_id)
        assert prog["phase"] == "error"
        assert "timed out" in prog["error"].lower()
    finally:
        _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_fetch_range_task_success():
    """handle_fetch_range_task should return completed status on success."""
    from app.sync.progress import _reset_progress, _sync_progress

    user_id = "test_fetch_range_success"
    _reset_progress(user_id)

    task = Task(
        "task-fetch-ok",
        "fetch_range",
        user_id,
        {
            "after_date": "2024/01/01",
            "before_date": "2024/03/31",
            "llm_priority": True,
            "sender": "amazon@in",
            "subject": "Order",
        },
    )

    mock_result = {"fetched": 10, "inserted": 8, "backfilled": 2, "errors": 0}

    try:
        with patch("app.sync.range.run_sync_range", return_value=mock_result):
            result = await handle_fetch_range_task(task)

        assert result["status"] == "completed"
        assert result["task_id"] == task.id
        assert result["result"] == mock_result
    finally:
        _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_fetch_range_task_exception():
    """handle_fetch_range_task should propagate non-timeout exceptions."""
    from app.sync.progress import _reset_progress, _sync_progress, _user_progress

    user_id = "test_fetch_range_exception"
    _reset_progress(user_id)

    task = Task(
        "task-fetch-err",
        "fetch_range",
        user_id,
        {
            "after_date": "2024/01/01",
            "before_date": "2024/03/31",
        },
    )

    try:
        with patch("app.sync.range.run_sync_range", side_effect=RuntimeError("Gmail not authenticated")):
            with pytest.raises(RuntimeError, match="Gmail not authenticated"):
                await handle_fetch_range_task(task)

        prog = _user_progress(user_id)
        assert prog["phase"] == "error"
        assert "Gmail not authenticated" in prog["error"]
    finally:
        _sync_progress.pop(user_id, None)


def test_register_fetch_range_handler():
    """register_fetch_range should register the fetch_range handler on the queue."""
    tq = TaskQueue()
    register_fetch_range(tq)
    assert "fetch_range" in tq._handlers
    assert tq._handlers["fetch_range"] is handle_fetch_range_task


@pytest.mark.asyncio
async def test_trigger_fetch_range_enqueues_task():
    """trigger_fetch_range should enqueue a task, not use create_task."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import User, UserRole, UserStatus

    owner = User(email="owner-fetch@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)

    async def _override_db():
        yield MagicMock()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: owner

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/sync/trigger-fetch-range",
                json={"after_date": "2024-01-01", "before_date": "2024-03-31"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "task_id" in data
        assert data["message"] == "Fetch-range queued"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_fetch_range_endpoint_wraps_with_wait_for():
    """The synchronous fetch_range endpoint should wrap run_sync_range with asyncio.wait_for."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import User, UserRole, UserStatus

    owner = User(email="owner-sync@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)

    async def _override_db():
        yield MagicMock()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: owner

    try:
        with patch(
            "app.sync.run_sync_range", return_value={"fetched": 5, "inserted": 3, "backfilled": 1, "errors": 0}
        ) as mock_run:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/api/sync/fetch-range",
                    json={"after_date": "2024-01-01", "before_date": "2024-03-31"},
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["fetched"] == 5
            mock_run.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_fetch_range_task_visible_via_tasks_api():
    """Fetch-range task status should be visible via /api/tasks."""
    from httpx import ASGITransport, AsyncClient

    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import User, UserRole, UserStatus
    from app.workers.queue import task_queue

    owner = User(email="owner-tasks@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)

    async def _override_db():
        yield MagicMock()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: owner

    try:
        task_id = await task_queue.enqueue(
            "fetch_range",
            owner.id,
            {
                "after_date": "2024/01/01",
                "before_date": "2024/03/31",
            },
        )
        assert task_id is not None

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/tasks")
            assert resp.status_code == 200
            data = resp.json()
            task_ids = [t["id"] for t in data["tasks"]]
            assert task_id in task_ids

            resp = await client.get(f"/api/tasks/{task_id}")
            assert resp.status_code == 200
            task_data = resp.json()
            assert task_data["type"] == "fetch_range"
            assert task_data["user_id"] == owner.id
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        task_queue._tasks.pop(task_id, None)
        if owner.id in task_queue._user_tasks:
            task_queue._user_tasks[owner.id] = [tid for tid in task_queue._user_tasks[owner.id] if tid != task_id]
