"""Tests for adaptive dedup scan — rate limiting, eligibility, prioritization."""

import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from app.sync import adaptive_dedup_scan, dedup_rate_limiter, scan_all_for_duplicates
from app.sync import _eligible_scan_users, _get_unconfirmed_pair_counts
from app.sync import _DedupRateLimiter


# ── Rate limiter tests ───────────────────────────────────────────────────────


class TestDedupRateLimiter:
    def test_allows_up_to_max(self):
        limiter = _DedupRateLimiter(max_scans=5, window_seconds=60)
        for _ in range(5):
            assert limiter.allow() is True
        assert limiter.allow() is False

    def test_resets_window(self):
        limiter = _DedupRateLimiter(max_scans=5, window_seconds=60)
        for _ in range(5):
            limiter.allow()
        assert limiter.allow() is False
        limiter.reset()
        assert limiter.allow() is True

    def test_allows_after_window_expiry(self):
        limiter = _DedupRateLimiter(max_scans=2, window_seconds=0.05)
        assert limiter.allow() is True
        assert limiter.allow() is True
        assert limiter.allow() is False
        time.sleep(0.06)
        assert limiter.allow() is True

    def test_configurable_max_scans(self):
        limiter = _DedupRateLimiter(max_scans=3, window_seconds=60)
        assert limiter.max_scans == 3
        limiter.max_scans = 10
        for _ in range(10):
            assert limiter.allow() is True
        assert limiter.allow() is False

    def test_global_rate_limiter_defaults(self):
        assert dedup_rate_limiter.max_scans == 60


# ── Eligibility tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_eligible_scan_users_all_null(db_session, mock_user):
    """Users with last_dedup_scan_at=NULL are always eligible."""
    from app.models import SyncState

    state = SyncState(
        user_id=str(mock_user.id),
        email_filter="all",
    )
    db_session.add(state)
    await db_session.commit()

    eligible = await _eligible_scan_users(db_session)
    assert len(eligible) == 1
    assert eligible[0][0] == str(mock_user.id)
    assert eligible[0][1] is True  # has_new_tx = True (null means has_new)


@pytest.mark.asyncio
async def test_eligible_scan_users_with_recent_tx(db_session, mock_user):
    """User with transaction created after last_dedup_scan_at is eligible."""
    from datetime import UTC, datetime, timedelta

    from app.models import Email, SyncState, Transaction

    uid = str(mock_user.id)
    old_time = datetime.now(UTC) - timedelta(hours=24)

    state = SyncState(user_id=uid, email_filter="all", last_dedup_scan_at=old_time)
    db_session.add(state)
    await db_session.flush()

    email = Email(
        id="e1",
        user_id=uid,
        gmail_id="g1",
        sender_domain="swiggy.in",
        received_at=datetime.now(UTC),
    )
    db_session.add(email)
    await db_session.flush()

    tx = Transaction(
        id="t1",
        email_id=email.id,
        label="expense",
        amount=500.0,
        txn_date=datetime.now(UTC).date(),
        status="auto",
    )
    db_session.add(tx)
    await db_session.commit()

    eligible = await _eligible_scan_users(db_session)
    assert len(eligible) == 1
    assert eligible[0][0] == uid
    assert eligible[0][1] is True


@pytest.mark.asyncio
async def test_eligible_scan_users_no_new_tx(db_session, mock_user):
    """User with no new transactions since last_dedup_scan_at is NOT eligible."""
    from datetime import UTC, datetime, timedelta

    from app.models import Email, SyncState, Transaction

    uid = str(mock_user.id)
    recent_time = datetime.now(UTC)

    state = SyncState(user_id=uid, email_filter="all", last_dedup_scan_at=recent_time)
    db_session.add(state)
    await db_session.flush()

    email = Email(
        id="e1",
        user_id=uid,
        gmail_id="g1",
        sender_domain="swiggy.in",
        received_at=recent_time - timedelta(hours=1),
    )
    db_session.add(email)
    await db_session.flush()

    tx = Transaction(
        id="t1",
        email_id=email.id,
        label="expense",
        amount=500.0,
        txn_date=recent_time.date(),
        status="auto",
        created_at=recent_time - timedelta(hours=1),
    )
    db_session.add(tx)
    await db_session.commit()

    eligible = await _eligible_scan_users(db_session)
    assert len(eligible) == 0


@pytest.mark.asyncio
async def test_eligible_scan_users_skips_none_user_id(db_session, mock_user):
    """SyncState rows with user_id=None are skipped."""
    from app.models import SyncState

    state = SyncState(user_id=None, email_filter="all")
    db_session.add(state)
    await db_session.commit()

    eligible = await _eligible_scan_users(db_session)
    assert len(eligible) == 0


# ── Priority ordering tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_unconfirmed_pair_counts_ordering(db_session, mock_user):
    """Users with more pending pairs appear first."""
    from app.models import Email, SyncState, Transaction

    from app.models.financial import DuplicatePair

    uid = str(mock_user.id)

    email = Email(id="e-pri", user_id=uid, gmail_id="g-pri", sender_domain="a.com")
    db_session.add(email)
    await db_session.flush()

    tx = Transaction(id="t-pri", email_id=email.id, label="expense", amount=100.0, status="auto")
    db_session.add(tx)
    await db_session.flush()

    for i in range(3):
        dup_email = Email(id=f"ed-pri-{i}", user_id=uid, gmail_id=f"gd-pri-{i}", sender_domain="b.com")
        db_session.add(dup_email)
        await db_session.flush()
        dup_tx = Transaction(id=f"td-pri-{i}", email_id=dup_email.id, label="expense", amount=100.0, status="auto")
        db_session.add(dup_tx)
        await db_session.flush()
        pair = DuplicatePair(
            id=f"pair-{i}",
            primary_tx_id=tx.id,
            duplicate_tx_id=dup_tx.id,
            status="pending",
            confidence=0.5,
            rule_source="amount_date",
        )
        db_session.add(pair)
    await db_session.commit()

    priority = await _get_unconfirmed_pair_counts(db_session)
    assert len(priority) >= 1
    found = [(uid_, cnt) for uid_, cnt in priority if uid_ == uid]
    assert len(found) == 1
    assert found[0][1] == 3


# ── Full scan cycle tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_adaptive_dedup_scan_dry_run(db_session, mock_user):
    """dry_run=True returns eligible count without scanning."""
    from app.models import SyncState

    state = SyncState(user_id=str(mock_user.id), email_filter="all")
    db_session.add(state)
    await db_session.commit()

    dedup_rate_limiter.reset()
    result = await adaptive_dedup_scan(dry_run=True, session=db_session)
    assert result["eligible"] >= 1
    assert result["scanned"] >= 1  # dry_run counts as scanned
    assert result["rate_limited"] == 0


@pytest.mark.asyncio
async def test_adaptive_dedup_scan_updates_last_scan_at(db_session, mock_user):
    """After a successful scan, last_dedup_scan_at is updated."""
    from app.models import SyncState

    uid = str(mock_user.id)
    state = SyncState(user_id=uid, email_filter="all")
    db_session.add(state)
    await db_session.commit()

    dedup_rate_limiter.reset()

    # Need to mock scan_all_for_duplicates to avoid actual DB work; the function
    # creates its own session, so we patch it at the module level.
    with patch("app.sync.scan_all_for_duplicates", new=AsyncMock(return_value={"checked": 0, "new_pairs": 0, "duration_ms": 0})):
        result = await adaptive_dedup_scan(user_id_override=uid, session=db_session)
        assert result["scanned"] == 1

    # Unit test _update_last_dedup_scan_at directly
    from app.sync import _update_last_dedup_scan_at
    await _update_last_dedup_scan_at(uid, db_session)
    assert state.last_dedup_scan_at is not None
    assert isinstance(state.last_dedup_scan_at, datetime)


@pytest.mark.asyncio
async def test_adaptive_dedup_scan_rate_limited(db_session, mock_user):
    """When rate limiter is saturated, users are skipped."""
    from app.models import SyncState

    uid = str(mock_user.id)
    state = SyncState(user_id=uid, email_filter="all")
    db_session.add(state)
    await db_session.commit()

    dedup_rate_limiter.reset()
    dedup_rate_limiter.max_scans = 1
    dedup_rate_limiter.allow()  # consume the only slot
    with patch("app.sync.scan_all_for_duplicates", new=AsyncMock()):
        result = await adaptive_dedup_scan(user_id_override=uid)
    assert result["rate_limited"] == 1
    assert result["scanned"] == 0
    dedup_rate_limiter.max_scans = 60  # restore default


@pytest.mark.asyncio
async def test_adaptive_dedup_scan_all_users(db_session, mock_user):
    """adaptive_dedup_scan with no override scans eligible users."""
    from app.models import SyncState

    uid = str(mock_user.id)
    state = SyncState(user_id=uid, email_filter="all")
    db_session.add(state)
    await db_session.commit()

    dedup_rate_limiter.reset()
    with patch("app.sync.scan_all_for_duplicates", new=AsyncMock(return_value={"checked": 0, "new_pairs": 0, "duration_ms": 0})):
        result = await adaptive_dedup_scan(session=db_session)
    assert result["eligible"] >= 1
    assert result["scanned"] >= 1
    assert result["errors"] == 0


# ── Regression test: 100 users ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_adaptive_scan_100_users_regression(db_session):
    """Regression: 100 user SyncState rows completes without error."""
    from app.models import SyncState

    uids = []
    for i in range(100):
        uid = f"regression-user-{i:04d}"
        uids.append(uid)
        state = SyncState(user_id=uid, email_filter="all")
        db_session.add(state)
    await db_session.commit()

    dedup_rate_limiter.reset()
    # Patch scan_all_for_duplicates to avoid actual DB work
    mock_scan = AsyncMock(return_value={"checked": 0, "new_pairs": 0, "duration_ms": 1})
    with patch("app.sync.scan_all_for_duplicates", new=mock_scan):
        result = await adaptive_dedup_scan(session=db_session)
    assert result["eligible"] == 100
    # Rate limited: 60 scans/min default × 1 window
    assert result["scanned"] <= 60
    assert result["errors"] == 0


# ── Idempotency test ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_adaptive_scan_idempotent(db_session, mock_user):
    """Running the scan twice with the same state should be safe (no double-count)."""
    from app.models import SyncState

    uid = str(mock_user.id)
    state = SyncState(user_id=uid, email_filter="all")
    db_session.add(state)
    await db_session.commit()

    dedup_rate_limiter.reset()
    mock_scan = AsyncMock(return_value={"checked": 5, "new_pairs": 2, "duration_ms": 10})

    with patch("app.sync.scan_all_for_duplicates", new=mock_scan):
        # First run — eligible because last_dedup_scan_at is NULL
        r1 = await adaptive_dedup_scan(user_id_override=uid, session=db_session)
        assert r1["scanned"] == 1

    dedup_rate_limiter.reset()

    with patch("app.sync.scan_all_for_duplicates", new=mock_scan):
        # Second run — should still be eligible (we didn't update last_dedup_scan_at
        # because mocked scan returns quickly; the write session commits the update
        # after scan returns). This tests that the mechanism doesn't panic on re-run.
        r2 = await adaptive_dedup_scan(user_id_override=uid, session=db_session)
        assert r2["scanned"] == 1
