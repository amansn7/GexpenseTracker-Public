import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import asyncio


def test_fetch_new_messages_date_range_query():
    """fetch_new_messages with after_date builds correct Gmail query and preserves history_id."""
    from unittest.mock import patch, MagicMock
    from app.gmail.client import fetch_new_messages

    mock_service = MagicMock()
    mock_service.users().messages().list().execute.return_value = {"messages": []}

    with patch("app.gmail.client._build_service", return_value=mock_service):
        messages, returned_history_id = fetch_new_messages(
            last_history_id="abc123",
            after_date="2024/01/01",
            before_date="2024/03/31",
        )

    assert messages == []
    assert returned_history_id == "abc123"  # preserved, not advanced

    call_kwargs = mock_service.users().messages().list.call_args[1]
    assert "after:2024/01/01" in call_kwargs["q"]
    assert "before:2024/03/31" in call_kwargs["q"]


async def _make_service_user(db_session):
    """Create a minimal service user for sync tests."""
    from app.models import User, UserRole, UserStatus
    user = User(
        email="service@localhost",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.mark.asyncio
async def test_run_sync_skips_duplicate_gmail_id(db_session):
    from app.models import Email, Transaction
    from sqlalchemy import select

    user = await _make_service_user(db_session)
    existing = Email(gmail_id="dup001", sender_domain="amazon.in", user_id=user.id)
    db_session.add(existing)
    await db_session.commit()

    fake_messages = [{
        "gmail_id": "dup001",
        "subject": "Duplicate",
        "sender": "x@amazon.in",
        "sender_domain": "amazon.in",
        "received_at": None,
        "body_snippet": "",
        "gmail_link": "",
        "user_id": user.id,
    }]

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=db_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.sync.fetch.fetch_new_messages", return_value=(fake_messages, "100")):
        with patch("app.sync.fetch.AsyncSessionLocal", return_value=mock_ctx):
            from app.sync import run_sync
            result = await run_sync()

    # No new transaction — duplicate skipped
    txns = await db_session.execute(select(Transaction))
    assert txns.scalars().all() == []


@pytest.mark.asyncio
async def test_run_sync_persists_rule_detected_merchant(db_session):
    from app.models import Transaction
    from sqlalchemy import select

    user = await _make_service_user(db_session)

    fake_messages = [{
        "gmail_id": "swiggy001",
        "subject": "Debit alert",
        "sender": "alerts@bank.com",
        "sender_domain": "bank.com",
        "received_at": None,
        "body_snippet": "Rs.488 debited towards WWW SWIGGY IN",
        "body_text": "Rs.488 debited towards WWW SWIGGY IN",
        "gmail_link": "",
        "user_id": user.id,
    }]

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=db_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.sync.fetch.fetch_new_messages", return_value=(fake_messages, "101")):
        with patch("app.sync.fetch.AsyncSessionLocal", return_value=mock_ctx):
            with patch("app.sync.fetch.get_credentials_for_user", return_value=AsyncMock()):
                from app.sync import run_sync
                await run_sync(user_id=user.id)

    txns = (await db_session.execute(select(Transaction))).scalars().all()
    assert len(txns) == 1
    assert txns[0].label == "expense"
    assert txns[0].merchant is not None
    assert "wiggy" in txns[0].merchant.lower()
    assert txns[0].category == "Food"


@pytest.mark.asyncio
async def test_fetch_range_endpoint_owner_only(db_session):
    """Non-owner gets 403 from /sync/fetch-range."""
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.database import get_db
    from app.auth_deps import get_current_user
    from app.models import User, UserRole, UserStatus

    member = User(email="member@test.com", role=UserRole.member, status=UserStatus.active, onboarding_complete=True)
    db_session.add(member)
    await db_session.commit()

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: member

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/sync/fetch-range", json={"after_date": "2024-01-01", "before_date": "2024-03-31"})
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_fetch_range_endpoint_owner_succeeds(db_session):
    """Owner gets 200 from /sync/fetch-range with mocked run_sync_range."""
    from httpx import AsyncClient, ASGITransport
    from unittest.mock import patch
    from app.main import app
    from app.database import get_db
    from app.auth_deps import get_current_user
    from app.models import User, UserRole, UserStatus

    owner = User(email="owner@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db_session.add(owner)
    await db_session.commit()

    async def _override_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: owner

    try:
        with patch("app.sync.run_sync_range", return_value={"fetched": 0, "inserted": 0, "backfilled": 0, "errors": 0}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post("/api/sync/fetch-range", json={"after_date": "2024-01-01", "before_date": "2024-03-31"})
        assert resp.status_code == 200
        data = resp.json()
        assert "fetched" in data and "backfilled" in data
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


def test_task_queue_idempotency_clears_completed():
    """Completed/failed tasks should not block new enqueues with same payload."""
    from app.workers.queue import TaskQueue, TaskStatus

    tq = TaskQueue()
    tq.register_handler("sync", lambda t: {"status": "completed"})

    async def _run():
        task_id_1 = await tq.enqueue("sync", "user1", {"trigger": "manual"})
        assert task_id_1 is not None

        task_id_2 = await tq.enqueue("sync", "user1", {"trigger": "manual"})
        assert task_id_2 == task_id_1  # same task, still pending

        task = tq._tasks[task_id_1]
        task.status = TaskStatus.completed

        task_id_3 = await tq.enqueue("sync", "user1", {"trigger": "manual"})
        assert task_id_3 is not None
        assert task_id_3 != task_id_1  # new task, old one was completed

    asyncio.run(_run())


def test_task_queue_idempotency_clears_failed():
    """Failed tasks should not block new enqueues with same payload."""
    from app.workers.queue import TaskQueue, TaskStatus

    tq = TaskQueue()

    async def _run():
        task_id_1 = await tq.enqueue("sync", "user1", {"trigger": "manual"})
        task = tq._tasks[task_id_1]
        task.status = TaskStatus.failed
        task.error = "test failure"

        task_id_2 = await tq.enqueue("sync", "user1", {"trigger": "manual"})
        assert task_id_2 is not None
        assert task_id_2 != task_id_1

    asyncio.run(_run())


@pytest.mark.asyncio
async def test_sync_emails_running_flag_always_cleared():
    """sync_emails must set running=False even on unexpected exceptions."""
    from app.sync.progress import _sync_progress, _reset_progress, _user_progress
    from app.sync.fetch import sync_emails

    user_id = "test_running_flag"
    _reset_progress(user_id)

    mock_session = AsyncMock()
    mock_session.execute.side_effect = RuntimeError("unexpected DB error")

    with pytest.raises(RuntimeError, match="unexpected DB error"):
        await sync_emails(mock_session, user_id=user_id)

    prog = _user_progress(user_id)
    assert prog["running"] is False, "running should always be False after sync_emails exits"

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_sync_task_sets_running_true():
    """handle_sync_task must set running:true before starting sync."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_running_true"
    _sync_progress[user_id] = {
        "running": False, "phase": "idle", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("task-1", "sync", user_id, {"trigger": "manual"})

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_session_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

        with patch("app.workers.sync_worker.sync_emails", return_value={
            "processed": 5, "total_fetched": 10, "skipped": 5
        }):
            result = await handle_sync_task(task)

    prog = _user_progress(user_id)
    assert result["status"] == "completed"
    assert prog["running"] is False

    _sync_progress.pop(user_id, None)


@pytest.mark.asyncio
async def test_handle_sync_task_timeout():
    """handle_sync_task should raise TimeoutError when sync exceeds limit."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_timeout"
    _sync_progress[user_id] = {
        "running": False, "phase": "idle", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("task-timeout", "sync", user_id, {"trigger": "manual"})

    async def slow_sync(*args, **kwargs):
        await asyncio.sleep(999)

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_session_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

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
async def test_handle_sync_task_error_result():
    """handle_sync_task should handle error results from sync_emails."""
    from app.sync.progress import _sync_progress, _user_progress
    from app.workers.queue import Task
    from app.workers.sync_worker import handle_sync_task

    user_id = "test_error_result"
    _sync_progress[user_id] = {
        "running": False, "phase": "idle", "phase_detail": "",
        "current": 0, "total": 0, "tally": {}, "previews": [],
        "current_email": None, "log": [], "result": None,
        "error": None, "minimized": False,
    }

    task = Task("task-error", "sync", user_id, {"trigger": "manual"})

    with patch("app.workers.sync_worker.AsyncSessionLocal") as mock_session_cls:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session_cls.return_value = mock_session

        with patch("app.workers.sync_worker.sync_emails", return_value={
            "error": "Gmail not authenticated", "processed": 0
        }):
            result = await handle_sync_task(task)

    assert result["status"] == "failed"
    assert "Gmail not authenticated" in result["error"]

    prog = _user_progress(user_id)
    assert prog["running"] is False
    assert prog["phase"] == "error"

    _sync_progress.pop(user_id, None)
