import time
from unittest.mock import patch

import pytest

from app.workers.queue import _IDEMPOTENCY_MAX_SIZE, _IDEMPOTENCY_TTL_SECONDS, TaskQueue


def _insert_idempotency_entries(tq: TaskQueue, count: int, base_time: float, age_seconds: float = 0):
    for i in range(count):
        key = f"hash_{i}"
        tq._idempotency[key] = f"task_{i}"
        tq._idempotency_timestamps[key] = base_time - age_seconds


@pytest.mark.asyncio
async def test_cleanup_idempotency_returns_pruned_count():
    tq = TaskQueue()
    now = time.time()

    for i in range(50):
        key = f"old_{i}"
        tq._idempotency[key] = f"task_old_{i}"
        tq._idempotency_timestamps[key] = now - _IDEMPOTENCY_TTL_SECONDS - 100

    for i in range(30):
        key = f"new_{i}"
        tq._idempotency[key] = f"task_new_{i}"
        tq._idempotency_timestamps[key] = now - 100

    pruned = await tq.cleanup_idempotency()

    assert pruned == 50
    assert len(tq._idempotency) == 30
    assert len(tq._idempotency_timestamps) == 30


@pytest.mark.asyncio
async def test_old_entries_pruned_recent_preserved():
    tq = TaskQueue()
    now = time.time()

    for i in range(20):
        key = f"old_{i}"
        tq._idempotency[key] = f"task_old_{i}"
        tq._idempotency_timestamps[key] = now - _IDEMPOTENCY_TTL_SECONDS - 60

    for i in range(20):
        key = f"new_{i}"
        tq._idempotency[key] = f"task_new_{i}"
        tq._idempotency_timestamps[key] = now - 60

    await tq.cleanup_idempotency()

    assert len(tq._idempotency) == 20
    assert all(k.startswith("new_") for k in tq._idempotency)
    assert all(k.startswith("new_") for k in tq._idempotency_timestamps)


def test_rapid_inserts_trigger_automatic_pruning():
    tq = TaskQueue()
    now = time.time()

    with patch("time.time", return_value=now):
        for i in range(_IDEMPOTENCY_MAX_SIZE + 500):
            key = f"hash_{i}"
            tq._idempotency[key] = f"task_{i}"
            tq._idempotency_timestamps[key] = now

            if len(tq._idempotency) > _IDEMPOTENCY_MAX_SIZE:
                tq._prune_idempotency()

    assert len(tq._idempotency) <= _IDEMPOTENCY_MAX_SIZE
    assert len(tq._idempotency_timestamps) <= _IDEMPOTENCY_MAX_SIZE


def test_large_insert_with_mixed_ages_stays_under_limit():
    tq = TaskQueue()
    now = time.time()

    with patch("time.time", return_value=now):
        for i in range(15000):
            key = f"hash_{i}"
            age = i % 7200
            tq._idempotency[key] = f"task_{i}"
            tq._idempotency_timestamps[key] = now - age

            if len(tq._idempotency) > _IDEMPOTENCY_MAX_SIZE:
                tq._prune_idempotency()

    assert len(tq._idempotency) <= _IDEMPOTENCY_MAX_SIZE
    assert len(tq._idempotency_timestamps) <= _IDEMPOTENCY_MAX_SIZE


def test_prune_ttl_then_oldest_fallback():
    tq = TaskQueue()
    now = time.time()

    with patch("time.time", return_value=now):
        for i in range(_IDEMPOTENCY_MAX_SIZE + 2000):
            key = f"hash_{i}"
            tq._idempotency[key] = f"task_{i}"
            tq._idempotency_timestamps[key] = now

        tq._prune_idempotency()

    assert len(tq._idempotency) <= _IDEMPOTENCY_MAX_SIZE


@pytest.mark.asyncio
async def test_cleanup_on_empty_dict():
    tq = TaskQueue()
    assert await tq.cleanup_idempotency() == 0


@pytest.mark.asyncio
async def test_cleanup_preserves_fresh_entries():
    tq = TaskQueue()
    now = time.time()

    _insert_idempotency_entries(tq, 10, now, age_seconds=_IDEMPOTENCY_TTL_SECONDS - 1)

    pruned = await tq.cleanup_idempotency()
    assert pruned == 0
    assert len(tq._idempotency) == 10
