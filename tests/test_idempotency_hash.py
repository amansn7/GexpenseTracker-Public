import asyncio

from app.workers.queue import TaskQueue, _payload_hash


def test_trigger_manual_and_scheduled_produce_same_hash():
    """Manual and scheduled syncs for the same user should produce the same idempotency hash."""
    payload_manual = {"trigger": "manual"}
    payload_scheduled = {"trigger": "scheduled"}

    hash_manual = _payload_hash("sync", "user1", payload_manual)
    hash_scheduled = _payload_hash("sync", "user1", payload_scheduled)

    assert hash_manual == hash_scheduled


def test_trigger_values_with_extra_payload_produce_same_hash():
    """Trigger type should be ignored even when other payload keys exist."""
    payload_a = {"trigger": "manual", "after_date": "2024-01-01"}
    payload_b = {"trigger": "scheduled", "after_date": "2024-01-01"}

    assert _payload_hash("sync", "user1", payload_a) == _payload_hash("sync", "user1", payload_b)


def test_different_user_ids_produce_different_hashes():
    """Different users should always get different hashes regardless of trigger."""
    payload = {"trigger": "manual"}

    hash_user1 = _payload_hash("sync", "user1", payload)
    hash_user2 = _payload_hash("sync", "user2", payload)

    assert hash_user1 != hash_user2


def test_different_extra_payload_keys_produce_different_hashes():
    """Different payload content (excluding trigger) should produce different hashes."""
    payload_a = {"trigger": "manual", "after_date": "2024-01-01"}
    payload_b = {"trigger": "manual", "after_date": "2024-06-01"}

    assert _payload_hash("sync", "user1", payload_a) != _payload_hash("sync", "user1", payload_b)


def test_hash_is_stable():
    """Same input should always produce the same output."""
    payload = {"trigger": "manual", "after_date": "2024-01-01"}

    hash1 = _payload_hash("sync", "user1", payload)
    hash2 = _payload_hash("sync", "user1", payload)
    hash3 = _payload_hash("sync", "user1", payload)

    assert hash1 == hash2 == hash3


def test_non_sync_tasks_with_different_payloads_get_different_hashes():
    """Non-sync task types should also get different hashes for different payloads."""
    payload_a = {"trigger": "manual", "action": "cleanup"}
    payload_b = {"trigger": "manual", "action": "notify"}

    hash_a = _payload_hash("maintenance", "user1", payload_a)
    hash_b = _payload_hash("maintenance", "user1", payload_b)

    assert hash_a != hash_b


def test_non_sync_tasks_ignore_trigger_too():
    """Trigger stripping should apply to all task types, not just sync."""
    payload_a = {"trigger": "manual", "action": "cleanup"}
    payload_b = {"trigger": "scheduled", "action": "cleanup"}

    assert _payload_hash("maintenance", "user1", payload_a) == _payload_hash("maintenance", "user1", payload_b)


def test_different_task_types_produce_different_hashes():
    """Different task types should produce different hashes even with identical payloads."""
    payload = {"trigger": "manual"}

    hash_sync = _payload_hash("sync", "user1", payload)
    hash_maintenance = _payload_hash("maintenance", "user1", payload)

    assert hash_sync != hash_maintenance


def test_empty_payload_still_hashes():
    """Empty payload should produce a valid hash."""
    hash1 = _payload_hash("sync", "user1", {})
    hash2 = _payload_hash("sync", "user1", {"trigger": "manual"})

    assert hash1 == hash2
    assert len(hash1) == 16


def test_manual_and_scheduled_sync_do_not_both_enqueue():
    """End-to-end: enqueuing manual then scheduled for same user should return same task id."""
    tq = TaskQueue()

    async def _run():
        task_id_1 = await tq.enqueue("sync", "user1", {"trigger": "manual"})
        task_id_2 = await tq.enqueue("sync", "user1", {"trigger": "scheduled"})

        assert task_id_1 == task_id_2

    asyncio.run(_run())
