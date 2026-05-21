import asyncio

import pytest

from app.workers.queue import Task, TaskQueue


@pytest.mark.asyncio
async def test_sync_different_users_run_concurrently():
    """Two sync tasks for different users should run concurrently."""
    tq = TaskQueue(worker_count=3)
    execution_order = []
    events = {}

    async def slow_handler(task):
        execution_order.append(("start", task.user_id))
        event = asyncio.Event()
        events[task.user_id] = event
        await event.wait()
        execution_order.append(("end", task.user_id))
        return {"status": "ok"}

    tq.register_handler("sync", slow_handler)

    await tq.enqueue("sync", "user-a", {"trigger": "manual"})
    await tq.enqueue("sync", "user-b", {"trigger": "manual"})

    worker_task = asyncio.create_task(tq.worker_loop())
    await asyncio.sleep(0.3)

    assert ("start", "user-a") in execution_order
    assert ("start", "user-b") in execution_order

    events["user-a"].set()
    events["user-b"].set()
    await asyncio.sleep(0.3)

    tq.stop()
    await worker_task

    assert ("end", "user-a") in execution_order
    assert ("end", "user-b") in execution_order


@pytest.mark.asyncio
async def test_sync_same_user_run_sequentially():
    """Two sync tasks for the same user should run sequentially."""
    tq = TaskQueue(worker_count=3)
    execution_order = []

    async def handler(task):
        execution_order.append(("start", task.payload.get("label", task.id)))
        await asyncio.sleep(0.2)
        execution_order.append(("end", task.payload.get("label", task.id)))
        return {"status": "ok"}

    tq.register_handler("sync", handler)

    # Use different payloads (not just trigger) so idempotency doesn't reject the second
    await tq.enqueue("sync", "user-a", {"label": "first"})
    await tq.enqueue("sync", "user-a", {"label": "second"})

    worker_task = asyncio.create_task(tq.worker_loop())
    await asyncio.sleep(0.6)

    tq.stop()
    await worker_task

    starts = [x for x in execution_order if x[0] == "start"]
    ends = [x for x in execution_order if x[0] == "end"]
    assert len(starts) == 2
    assert len(ends) == 2
    first_end = execution_order.index(ends[0])
    second_start = execution_order.index(starts[1])
    assert first_end < second_start, "Second task started before first ended"
    assert {s[1] for s in starts} == {"first", "second"}, "Both tasks should have run"


@pytest.mark.asyncio
async def test_sync_and_clean_bodies_run_concurrently():
    """Sync and clean-bodies tasks (different types) should run concurrently."""
    tq = TaskQueue(worker_count=3)
    execution_order = []
    events = {}

    async def handler(task):
        execution_order.append(("start", task.type))
        event = asyncio.Event()
        events[task.type] = event
        await event.wait()
        execution_order.append(("end", task.type))
        return {"status": "ok"}

    tq.register_handler("sync", handler)
    tq.register_handler("clean-bodies", handler)

    await tq.enqueue("sync", "user-a", {})
    await tq.enqueue("clean-bodies", "user-a", {})

    worker_task = asyncio.create_task(tq.worker_loop())
    await asyncio.sleep(0.3)

    assert ("start", "sync") in execution_order
    assert ("start", "clean-bodies") in execution_order

    events["sync"].set()
    events["clean-bodies"].set()
    await asyncio.sleep(0.2)

    tq.stop()
    await worker_task


def test_can_start_task_returns_false_when_user_running():
    """_can_start_task returns False for sync when user is already running."""
    tq = TaskQueue()
    task = Task("t1", "sync", "user-a", {})
    tq._running_users.add("user-a")
    assert tq._can_start_task(task) is False


def test_can_start_task_returns_true_for_non_sync():
    """_can_start_task always returns True for non-sync task types."""
    tq = TaskQueue()
    tq._running_users.add("user-a")

    for task_type in ["clean-bodies", "backfill", "reindex", "export"]:
        task = Task("t1", task_type, "user-a", {})
        assert tq._can_start_task(task) is True


def test_can_start_task_returns_true_when_user_not_running():
    """_can_start_task returns True for sync when user is not running."""
    tq = TaskQueue()
    task = Task("t1", "sync", "user-a", {})
    assert tq._can_start_task(task) is True


def test_mark_user_done_clears_user():
    """_mark_user_done removes the user from _running_users."""
    tq = TaskQueue()
    task = Task("t1", "sync", "user-a", {})
    tq._running_users.add("user-a")
    assert "user-a" in tq._running_users

    tq._mark_user_done(task)
    assert "user-a" not in tq._running_users


def test_mark_user_done_no_error_for_missing_user():
    """_mark_user_done does not raise if user was never added."""
    tq = TaskQueue()
    task = Task("t1", "sync", "user-a", {})
    tq._mark_user_done(task)
    assert "user-a" not in tq._running_users


def test_mark_user_running_adds_user():
    """_mark_user_running adds the user to _running_users."""
    tq = TaskQueue()
    task = Task("t1", "sync", "user-a", {})
    tq._mark_user_running(task)
    assert "user-a" in tq._running_users


def test_mark_user_running_noop_for_non_sync():
    """_mark_user_running does nothing for non-sync tasks."""
    tq = TaskQueue()
    task = Task("t1", "clean-bodies", "user-a", {})
    tq._mark_user_running(task)
    assert "user-a" not in tq._running_users


def test_worker_count_defaults_to_3():
    """TaskQueue defaults worker_count to 3."""
    tq = TaskQueue()
    assert tq._worker_count == 3


def test_worker_count_can_be_customized():
    """TaskQueue accepts custom worker_count."""
    tq = TaskQueue(worker_count=5)
    assert tq._worker_count == 5
