"""Tests for the ARQ-based scheduler (replaces APScheduler tests).

These tests call the ARQ cron job functions directly, without needing a
running ARQ worker. They verify that each job correctly identifies eligible
users and enqueues the right work.
"""

from datetime import UTC, datetime, timedelta
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


def _mock_queue_with_enqueue(capture_list: list):
    """Create a mock task queue that captures enqueue calls."""
    q = AsyncMock()
    q.enqueue = AsyncMock(side_effect=lambda task_type, user_id, payload, priority="high": (
        capture_list.append({"user_id": user_id, "priority": priority}),
        f"task-{user_id}"
    )[1])
    return q


# ── Sync scheduler tests ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sync_scheduler_enqueues_all_eligible_users(db_session):
    """3 active users with Gmail accounts → all 3 get enqueued."""
    from app.models import UserStatus

    users = []
    for i in range(3):
        u = _create_user(db_session, f"user{i}@example.com", status=UserStatus.active, onboarding_complete=True)
        await db_session.flush()
        _create_connected_account(db_session, u.id)
        users.append(u)
    await db_session.commit()

    captured = []
    q = _mock_queue_with_enqueue(captured)

    with patch("app.workers.queue._get_task_queue", return_value=q), \
         patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import sync_scheduler_job
        await sync_scheduler_job({})

    assert len(captured) == 3
    assert {c["user_id"] for c in captured} == {u.id for u in users}


@pytest.mark.asyncio
async def test_sync_scheduler_skips_user_without_gmail(db_session):
    from app.models import UserStatus

    u1 = _create_user(db_session, "withgmail@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)
    _create_user(db_session, "nogmail@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.commit()

    captured = []
    q = _mock_queue_with_enqueue(captured)

    with patch("app.workers.queue._get_task_queue", return_value=q), \
         patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import sync_scheduler_job
        await sync_scheduler_job({})

    assert len(captured) == 1
    assert captured[0]["user_id"] == u1.id


@pytest.mark.asyncio
async def test_sync_scheduler_skips_disabled_user(db_session):
    from app.models import UserStatus

    u1 = _create_user(db_session, "active@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)
    u2 = _create_user(db_session, "disabled@example.com", status=UserStatus.disabled, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u2.id)
    await db_session.commit()

    captured = []
    q = _mock_queue_with_enqueue(captured)

    with patch("app.workers.queue._get_task_queue", return_value=q), \
         patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import sync_scheduler_job
        await sync_scheduler_job({})

    assert len(captured) == 1
    assert captured[0]["user_id"] == u1.id


@pytest.mark.asyncio
async def test_sync_scheduler_skips_incomplete_onboarding(db_session):
    from app.models import UserStatus

    u1 = _create_user(db_session, "onboarded@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)
    u2 = _create_user(db_session, "notonboarded@example.com", status=UserStatus.active, onboarding_complete=False)
    await db_session.flush()
    _create_connected_account(db_session, u2.id)
    await db_session.commit()

    captured = []
    q = _mock_queue_with_enqueue(captured)

    with patch("app.workers.queue._get_task_queue", return_value=q), \
         patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import sync_scheduler_job
        await sync_scheduler_job({})

    assert len(captured) == 1
    assert captured[0]["user_id"] == u1.id


@pytest.mark.asyncio
async def test_sync_scheduler_respects_adaptive_interval(db_session):
    """User within their adaptive interval is skipped; user past interval is enqueued."""
    from app.models import SyncState, UserStatus

    u1 = _create_user(db_session, "recently_synced@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u1.id)
    db_session.add(SyncState(user_id=u1.id, last_synced_at=datetime.now(UTC), sync_interval_minutes=120))
    await db_session.flush()

    u2 = _create_user(db_session, "due_for_sync@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()
    _create_connected_account(db_session, u2.id)
    old_time = datetime.now(UTC) - timedelta(hours=4)
    db_session.add(SyncState(user_id=u2.id, last_synced_at=old_time, sync_interval_minutes=30))
    await db_session.commit()

    captured = []
    q = _mock_queue_with_enqueue(captured)

    with patch("app.workers.queue._get_task_queue", return_value=q), \
         patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import sync_scheduler_job
        await sync_scheduler_job({})

    assert len(captured) == 1
    assert captured[0]["user_id"] == u2.id
    assert captured[0]["priority"] == "medium"


@pytest.mark.asyncio
async def test_sync_scheduler_no_eligible_users(db_session):
    from app.models import UserStatus

    _create_user(db_session, "nogmail@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.commit()

    captured = []
    q = _mock_queue_with_enqueue(captured)

    with patch("app.workers.queue._get_task_queue", return_value=q), \
         patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import sync_scheduler_job
        await sync_scheduler_job({})

    assert len(captured) == 0


# ── Dedup scan tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dedup_scan_job_runs_for_all_eligible_users(db_session):
    from app.models import SyncState, UserStatus

    users = []
    for i in range(3):
        u = _create_user(db_session, f"dedup_user{i}@example.com", status=UserStatus.active, onboarding_complete=True)
        await db_session.flush()
        _create_connected_account(db_session, u.id)
        db_session.add(SyncState(user_id=u.id, email_filter="all"))
        users.append(u)
    await db_session.commit()

    scanned_ids = []

    async def fake_scan(user_id):
        scanned_ids.append(user_id)
        return {"duplicates_found": 0}

    mock_async_local = MagicMock()
    mock_async_local.__aenter__ = AsyncMock(return_value=db_session)
    mock_async_local.__aexit__ = AsyncMock()

    with patch("app.sync.scan_all_for_duplicates", new=fake_scan), \
         patch("app.database.get_worker_session", return_value=db_session), \
         patch("app.sync.AsyncSessionLocal", new=lambda: mock_async_local):
        from app.arq_worker import dedup_scan_job
        await dedup_scan_job({})

    assert len(scanned_ids) == 3
    assert set(scanned_ids) == {u.id for u in users}


# ── Adaptive intervals test ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_compute_adaptive_intervals(db_session):
    """High freq → 15 min, medium → 30, low → 60, none → unchanged."""
    from app.models import (
        Email,
        Label,
        SyncState,
        Transaction,
        UserStatus,
    )
    from sqlalchemy import select

    u_high = _create_user(db_session, "high@example.com", status=UserStatus.active, onboarding_complete=True)
    u_med = _create_user(db_session, "med@example.com", status=UserStatus.active, onboarding_complete=True)
    u_low = _create_user(db_session, "low@example.com", status=UserStatus.active, onboarding_complete=True)
    u_none = _create_user(db_session, "none@example.com", status=UserStatus.active, onboarding_complete=True)
    await db_session.flush()

    db_session.add(SyncState(user_id=u_high.id))
    db_session.add(SyncState(user_id=u_med.id))
    db_session.add(SyncState(user_id=u_low.id))
    db_session.add(SyncState(user_id=u_none.id, sync_interval_minutes=999))
    await db_session.flush()

    for uid, count in [(u_high.id, 150), (u_med.id, 50), (u_low.id, 5)]:
        for i in range(count):
            email = Email(
                user_id=uid,
                gmail_id=f"email_{uid}_{i}",
                subject="test",
                sender_domain="example.com",
                received_at=datetime.now(UTC),
            )
            db_session.add(email)
            await db_session.flush()
            tx = Transaction(email_id=email.id, amount=10.0, label=Label.expense, created_at=datetime.now(UTC))
            db_session.add(tx)
    await db_session.commit()

    with patch("app.database.get_worker_session", return_value=db_session):
        from app.arq_worker import compute_adaptive_intervals_job
        result = await compute_adaptive_intervals_job({})
        # All 4 users updated: high→15, med→30, low→60, none→None
        assert result["updated"] == 4

        rows = (await db_session.execute(select(SyncState))).scalars().all()
        intervals = {r.user_id: r.sync_interval_minutes for r in rows}
        assert intervals[u_high.id] == 15
        assert intervals[u_med.id] == 30
        assert intervals[u_low.id] == 60
        assert intervals[u_none.id] is None  # 0 transactions → default (None)


# ── Stagger test ─────────────────────────────────────────────────────────


def test_user_stagger_is_deterministic():
    from app.arq_worker import _user_stagger_seconds

    assert _user_stagger_seconds("test-user-id") == _user_stagger_seconds("test-user-id")
    assert 0 <= _user_stagger_seconds("test-user-id") < 600


# ── Priority queue tests ─────────────────────────────────────────────────


def test_queue_key_medium():
    """_queue_key returns correct key for medium priority."""
    from app.workers.queue import RedisTaskQueue

    q = RedisTaskQueue("redis://localhost:6379", worker_count=2)
    q._handlers = {"sync": lambda t: None}

    assert q._queue_key("sync", "medium") == "queue:medium:sync"
    assert q._queue_key("sync", "low") == "queue:low:sync"
    assert q._queue_key("sync", "high") == "queue:sync"
    assert q._queue_key("sync") == "queue:sync"


def test_all_queue_keys_in_priority_order():
    """_all_queue_keys returns keys in high → medium → low order."""
    from app.workers.queue import RedisTaskQueue

    q = RedisTaskQueue("redis://localhost:6379", worker_count=2)
    q._handlers = {"sync": lambda t: None, "fetch_range": lambda t: None}

    keys = q._all_queue_keys()
    # Expect high-first order: queue:sync, queue:fetch_range, queue:medium:sync, ...
    assert keys.index("queue:sync") < keys.index("queue:medium:sync")
    assert keys.index("queue:medium:sync") < keys.index("queue:low:sync")


def test_payload_hash_excludes_run_at():
    """run_at and trigger are excluded from idempotency hash."""
    from app.workers.queue import _payload_hash

    h1 = _payload_hash("sync", "user-1", {"trigger": "scheduled", "run_at": "2026-01-01T00:00:00"})
    h2 = _payload_hash("sync", "user-1", {"trigger": "scheduled", "run_at": "2026-06-01T00:00:00"})
    assert h1 == h2, "different run_at should produce same hash"

    h3 = _payload_hash("sync", "user-1", {"trigger": "scheduled"})
    assert h1 == h3, "payload without run_at should match"

    # Without trigger AND without run_at — same hash if rest identical
    h4 = _payload_hash("sync", "user-1", {})
    assert h1 == h4, "scheduled trigger with empty payload should match bare payload"

    h5 = _payload_hash("sync", "user-2", {"trigger": "scheduled"})
    assert h1 != h5, "different user_id should produce different hash"


# ── Semaphore removal test ───────────────────────────────────────────────


def test_semaphore_removed():
    import app.scheduler as scheduler_mod

    assert not hasattr(scheduler_mod, "_sync_semaphore")
    assert not hasattr(scheduler_mod, "MAX_CONCURRENT_SYNCS")
    assert hasattr(scheduler_mod, "_delete_expired_accounts")
