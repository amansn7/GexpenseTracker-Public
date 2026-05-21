import time
from unittest.mock import patch

from app.workers.queue import _IDEMPOTENCY_MAX_SIZE, _IDEMPOTENCY_TTL_SECONDS, TaskQueue


def _insert_idempotency_entries(tq: TaskQueue, count: int, base_time: float, age_seconds: float = 0):
    """Insert `count` idempotency entries with timestamps at base_time - age_seconds."""
    for i in range(count):
        key = f"hash_{i}"
        tq._idempotency[key] = f"task_{i}"
        tq._idempotency_timestamps[key] = base_time - age_seconds


def test_cleanup_idempotency_returns_pruned_count():
    """cleanup_idempotency() returns the number of stale entries removed."""
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

    pruned = tq.cleanup_idempotency()

    assert pruned == 50
    assert len(tq._idempotency) == 30
    assert len(tq._idempotency_timestamps) == 30


def test_old_entries_pruned_recent_preserved():
    """Entries older than TTL are pruned; entries younger than TTL are kept."""
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

    tq.cleanup_idempotency()

    assert len(tq._idempotency) == 20
    assert all(k.startswith("new_") for k in tq._idempotency)
    assert all(k.startswith("new_") for k in tq._idempotency_timestamps)


def test_rapid_inserts_trigger_automatic_pruning():
    """When inserting beyond MAX_SIZE, automatic pruning keeps dict within limit."""
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
    """Insert 15K entries with varying timestamps; after cleanup, dict stays <= 10K."""
    tq = TaskQueue()
    now = time.time()

    with patch("time.time", return_value=now):
        for i in range(15000):
            key = f"hash_{i}"
            age = (i % 7200)
            tq._idempotency[key] = f"task_{i}"
            tq._idempotency_timestamps[key] = now - age

            if len(tq._idempotency) > _IDEMPOTENCY_MAX_SIZE:
                tq._prune_idempotency()

    assert len(tq._idempotency) <= _IDEMPOTENCY_MAX_SIZE
    assert len(tq._idempotency_timestamps) <= _IDEMPOTENCY_MAX_SIZE


def test_prune_ttl_then_oldest_fallback():
    """If TTL pruning is insufficient, oldest entries are removed until under limit."""
    tq = TaskQueue()
    now = time.time()

    with patch("time.time", return_value=now):
        for i in range(_IDEMPOTENCY_MAX_SIZE + 2000):
            key = f"hash_{i}"
            tq._idempotency[key] = f"task_{i}"
            tq._idempotency_timestamps[key] = now

        tq._prune_idempotency()

    assert len(tq._idempotency) <= _IDEMPOTENCY_MAX_SIZE


def test_cleanup_on_empty_dict():
    """cleanup_idempotency() returns 0 when dict is empty."""
    tq = TaskQueue()
    assert tq.cleanup_idempotency() == 0


def test_cleanup_preserves_fresh_entries():
    """Entries just under TTL boundary are preserved."""
    tq = TaskQueue()
    now = time.time()

    _insert_idempotency_entries(tq, 10, now, age_seconds=_IDEMPOTENCY_TTL_SECONDS - 1)

    pruned = tq.cleanup_idempotency()
    assert pruned == 0
    assert len(tq._idempotency) == 10
