import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio


@pytest_asyncio.fixture
async def db_session():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.models import Base

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


def _create_user(session, email, status="active", onboarding_complete=True, role="member"):
    from app.models import User
    user = User(
        email=email,
        status=status if isinstance(status, str) else status.value,
        onboarding_complete=onboarding_complete,
        role=role if isinstance(role, str) else role.value,
    )
    session.add(user)
    return user


def _create_connected_account(session, user_id, provider="gmail", status="connected"):
    from app.models import ConnectedAccount
    account = ConnectedAccount(
        user_id=user_id,
        provider=provider,
        account_email=f"user_{user_id[:8]}@gmail.com",
        status=status,
    )
    session.add(account)
    return account


@pytest.mark.asyncio
async def test_three_active_users_with_gmail_all_synced(db_session):
    """3 active users with Gmail accounts → all 3 get synced."""
    from app.models import UserStatus

    users = []
    for i in range(3):
        u = _create_user(db_session, f"user{i}@example.com", status=UserStatus.active, onboarding_complete=True)
        await db_session.flush()
        _create_connected_account(db_session, u.id)
        users.append(u)
    await db_session.commit()

    enqueued_ids = []

    async def fake_enqueue(task_type, user_id, payload):
        enqueued_ids.append(user_id)
        return f"task-{user_id}"

    with patch("app.workers.queue.task_queue.enqueue", new=fake_enqueue), \
         patch("app.scheduler.AsyncSessionLocal", return_value=db_session):
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        sync_job = captured_jobs.get("gmail_sync")
        assert sync_job is not None, "gmail_sync job was not registered"

        await sync_job()

        assert len(enqueued_ids) == 3
        expected_ids = {u.id for u in users}
        assert set(enqueued_ids) == expected_ids


@pytest.mark.asyncio
async def test_user_without_gmail_skipped(db_session):
    """User without Gmail account → skipped."""
    from app.models import UserStatus

    u1 = _create_user(db_session, "withgmail@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)

    _create_user(db_session, "nogmail@example.com", status=UserStatus.active, onboarding_complete=True)

    await db_session.commit()

    enqueued_ids = []

    async def fake_enqueue(task_type, user_id, payload):
        enqueued_ids.append(user_id)
        return f"task-{user_id}"

    with patch("app.workers.queue.task_queue.enqueue", new=fake_enqueue), \
         patch("app.scheduler.AsyncSessionLocal", return_value=db_session):
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        sync_job = captured_jobs.get("gmail_sync")
        assert sync_job is not None

        await sync_job()

        assert len(enqueued_ids) == 1
        assert enqueued_ids[0] == u1.id


@pytest.mark.asyncio
async def test_disabled_user_skipped(db_session):
    """Disabled user → skipped."""
    from app.models import UserStatus

    u1 = _create_user(db_session, "active@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)

    u2 = _create_user(db_session, "disabled@example.com", status=UserStatus.disabled, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u2.id)

    await db_session.commit()

    enqueued_ids = []

    async def fake_enqueue(task_type, user_id, payload):
        enqueued_ids.append(user_id)
        return f"task-{user_id}"

    with patch("app.workers.queue.task_queue.enqueue", new=fake_enqueue), \
         patch("app.scheduler.AsyncSessionLocal", return_value=db_session):
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        sync_job = captured_jobs.get("gmail_sync")
        assert sync_job is not None

        await sync_job()

        assert len(enqueued_ids) == 1
        assert enqueued_ids[0] == u1.id


@pytest.mark.asyncio
async def test_user_with_incomplete_onboarding_skipped(db_session):
    """User with onboarding_complete=False → skipped."""
    from app.models import UserStatus

    u1 = _create_user(db_session, "onboarded@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)

    u2 = _create_user(db_session, "notonboarded@example.com", status=UserStatus.active, onboarding_complete=False)
    await db_session.flush()
    _create_connected_account(db_session, u2.id)

    await db_session.commit()

    enqueued_ids = []

    async def fake_enqueue(task_type, user_id, payload):
        enqueued_ids.append(user_id)
        return f"task-{user_id}"

    with patch("app.workers.queue.task_queue.enqueue", new=fake_enqueue), \
         patch("app.scheduler.AsyncSessionLocal", return_value=db_session):
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        sync_job = captured_jobs.get("gmail_sync")
        assert sync_job is not None

        await sync_job()

        assert len(enqueued_ids) == 1
        assert enqueued_ids[0] == u1.id


@pytest.mark.asyncio
async def test_max_concurrent_syncs_semaphore():
    """Max concurrent syncs respected (semaphore works)."""
    from app.scheduler import MAX_CONCURRENT_SYNCS

    assert MAX_CONCURRENT_SYNCS == 5

    active_count = 0
    max_observed = 0
    lock = asyncio.Lock()

    async def fake_enqueue(task_type, user_id, payload):
        nonlocal active_count, max_observed
        async with lock:
            active_count += 1
            if active_count > max_observed:
                max_observed = active_count
        await asyncio.sleep(0.05)
        async with lock:
            active_count -= 1
        return f"task-{user_id}"

    with patch("app.workers.queue.task_queue.enqueue", new=fake_enqueue):
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        sync_job = captured_jobs.get("gmail_sync")
        assert sync_job is not None

        num_users = 10
        with patch("app.scheduler.AsyncSessionLocal") as mock_session_local:
            mock_db = AsyncMock()

            mock_user_result = AsyncMock()
            mock_user_result.scalars.return_value.all.return_value = [
                MagicMock(id=f"user-{i}", status="active", onboarding_complete=True)
                for i in range(num_users)
            ]

            mock_account_result = AsyncMock()
            mock_account_result.scalar_one_or_none.return_value = MagicMock()

            call_count = 0

            async def mock_execute(stmt):
                nonlocal call_count
                call_count += 1
                if "ConnectedAccount" in str(type(stmt)) or call_count > 1:
                    return mock_account_result
                return mock_user_result

            mock_db.execute = mock_execute
            mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_db)
            mock_session_local.return_value.__aexit__ = AsyncMock(return_value=None)

            await sync_job()

        assert max_observed <= MAX_CONCURRENT_SYNCS, (
            f"Observed {max_observed} concurrent syncs, but max is {MAX_CONCURRENT_SYNCS}"
        )


@pytest.mark.asyncio
async def test_no_eligible_users_logs_warning(db_session):
    """When no users have Gmail connected, sync is skipped with a warning."""
    from app.models import UserStatus

    _create_user(db_session, "nogmail@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.commit()

    enqueued_ids = []

    async def fake_enqueue(task_type, user_id, payload):
        enqueued_ids.append(user_id)
        return f"task-{user_id}"

    with patch("app.workers.queue.task_queue.enqueue", new=fake_enqueue), \
         patch("app.scheduler.AsyncSessionLocal", return_value=db_session), \
         patch("app.scheduler.logger") as mock_logger:
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        sync_job = captured_jobs.get("gmail_sync")
        assert sync_job is not None

        await sync_job()

        assert len(enqueued_ids) == 0
        mock_logger.warning.assert_called()


@pytest.mark.asyncio
async def test_dedup_job_runs_for_all_eligible_users(db_session):
    """Dedup job should run for all users with connected Gmail, not just owner."""
    from app.models import UserStatus

    users = []
    for i in range(3):
        u = _create_user(db_session, f"dedup_user{i}@example.com", status=UserStatus.active, onboarding_complete=True)
        await db_session.flush()
        _create_connected_account(db_session, u.id)
        users.append(u)
    await db_session.commit()

    scanned_ids = []

    async def fake_scan(user_id):
        scanned_ids.append(user_id)
        return {"duplicates_found": 0}

    with patch("app.sync.scan_all_for_duplicates", new=fake_scan), \
         patch("app.scheduler.AsyncSessionLocal", return_value=db_session):
        from app.scheduler import setup_scheduler

        scheduler_mock = MagicMock()
        scheduler_mock.add_job = MagicMock()
        scheduler_mock.start = MagicMock()

        captured_jobs = {}

        def capture_job(fn, **kwargs):
            captured_jobs[kwargs.get("id", "unknown")] = fn

        scheduler_mock.add_job.side_effect = capture_job

        with patch("app.scheduler.scheduler", scheduler_mock):
            setup_scheduler()

        dedup_job = captured_jobs.get("dedup_scan")
        assert dedup_job is not None

        await dedup_job()

        assert len(scanned_ids) == 3
        expected_ids = {u.id for u in users}
        assert set(scanned_ids) == expected_ids
