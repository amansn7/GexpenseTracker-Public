import uuid
from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dedup.service import (
    _compute_score,
    _score_pair,
    _score_pair_with_rules,
    batch_detect_duplicates,
    detect_and_record_duplicates,
)
from app.models import DomainPairRule, DuplicatePair, Email, Transaction


def _make_email(
    id: str,
    user_id: str,
    sender_domain: str,
    received_at: datetime,
    subject: str = "",
) -> Email:
    return Email(
        id=id,
        gmail_id=f"g-{id[:8]}",
        sender=f"noreply@{sender_domain}",
        sender_domain=sender_domain,
        user_id=user_id,
        received_at=received_at,
        subject=subject,
    )


def _make_tx(
    id: str,
    email_id: str,
    amount: float,
    txn_date: date,
    merchant: str = "",
    label: str = "expense",
) -> Transaction:
    return Transaction(
        id=id,
        email_id=email_id,
        label=label,
        amount=amount,
        txn_date=txn_date,
        status="auto",
        merchant=merchant,
    )


# ── Test 1: Query count optimization ────────────────────────────────────────

@pytest.mark.asyncio
async def test_batch_detect_duplicates_query_count(db_session, mock_user):
    """
    batch_detect_duplicates with 10 new x 10 existing should use <= 5 DB queries,
    not 100+ (one per pair).
    """
    uid = str(mock_user.id)
    query_count = 0
    original_execute = db_session.execute

    async def counting_execute(*args, **kwargs):
        nonlocal query_count
        query_count += 1
        return await original_execute(*args, **kwargs)

    db_session.execute = counting_execute

    # Create 10 existing transactions
    existing_pairs = []
    for i in range(10):
        eid = str(uuid.uuid4())
        tid = str(uuid.uuid4())
        email = _make_email(eid, uid, "swiggy.in",
                            datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
        tx = _make_tx(tid, eid, 500.0, date(2026, 4, 10))
        db_session.add_all([email, tx])
        existing_pairs.append((tx, email))
    await db_session.flush()

    # Create 10 new transactions
    new_pairs = []
    for i in range(10):
        eid = str(uuid.uuid4())
        tid = str(uuid.uuid4())
        email = _make_email(eid, uid, "swiggy.in",
                            datetime(2026, 4, 11, 10, 0, tzinfo=UTC))
        tx = _make_tx(tid, eid, 500.0, date(2026, 4, 11))
        new_pairs.append((tx, email))

    query_count_before = query_count
    result = await batch_detect_duplicates(new_pairs, db_session, uid)

    queries_used = query_count - query_count_before
    # Expected: 1 (DomainPairRule) + 1 (windowed existing query) + 1 (DuplicatePair) = 3
    assert queries_used <= 5, f"Used {queries_used} queries, expected <= 5"
    assert result["checked"] == 10


# ── Test 2: _score_pair_with_rules produces identical results to _score_pair ─

@pytest.mark.asyncio
async def test_score_pair_with_rules_matches_score_pair(db_session, mock_user):
    """
    _score_pair_with_rules must produce identical (score, rule_source) as
    _score_pair for the same inputs when the rules dict is populated correctly.
    """
    uid = str(mock_user.id)

    # Create a DomainPairRule
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="hdfcbank.com",
        domain_b="swiggy.in",
        confirmed_count=2,
        dismissed_count=0,
        confidence=0.75,
        auto_resolve=False,
    )
    db_session.add(rule)
    await db_session.flush()

    email_a = _make_email(str(uuid.uuid4()), uid, "hdfcbank.com",
                          datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_tx(str(uuid.uuid4()), email_a.id, 500.0, date(2026, 4, 10))

    email_b = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                          datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_tx(str(uuid.uuid4()), email_b.id, 500.0, date(2026, 4, 10))

    db_session.add_all([email_a, tx_a, email_b, tx_b])
    await db_session.flush()

    # Build rules map
    all_rules = (await db_session.execute(select(DomainPairRule))).scalars().all()
    rules_map: dict[tuple[str, str], DomainPairRule] = {
        (r.domain_a, r.domain_b): r for r in all_rules
    }

    # Compare results
    score_async, source_async = await _score_pair(tx_a, email_a, tx_b, email_b, db_session)
    score_sync, source_sync = _score_pair_with_rules(tx_a, email_a, tx_b, email_b, rules_map)

    assert score_async == score_sync, f"Scores differ: {score_async} vs {score_sync}"
    assert source_async == source_sync, f"Sources differ: {source_async} vs {source_sync}"
    assert score_sync == 0.75
    assert source_sync == "domain_pair"


@pytest.mark.asyncio
async def test_score_pair_with_rules_same_domain(db_session, mock_user):
    """Same-domain pair should return (1.0, 'same_domain_exact') in both functions."""
    uid = str(mock_user.id)

    email_a = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                          datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_tx(str(uuid.uuid4()), email_a.id, 500.0, date(2026, 4, 10))

    email_b = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                          datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_tx(str(uuid.uuid4()), email_b.id, 500.0, date(2026, 4, 10))

    db_session.add_all([email_a, tx_a, email_b, tx_b])
    await db_session.flush()

    rules_map: dict[tuple[str, str], DomainPairRule] = {}

    score_async, source_async = await _score_pair(tx_a, email_a, tx_b, email_b, db_session)
    score_sync, source_sync = _score_pair_with_rules(tx_a, email_a, tx_b, email_b, rules_map)

    assert score_async == score_sync == 1.0
    assert source_async == source_sync == "same_domain_exact"


@pytest.mark.asyncio
async def test_score_pair_with_rules_amount_date_fallback(db_session, mock_user):
    """Different domains with no rule should fall back to amount_date (0.5)."""
    uid = str(mock_user.id)

    email_a = _make_email(str(uuid.uuid4()), uid, "unknown-a.com",
                          datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_tx(str(uuid.uuid4()), email_a.id, 500.0, date(2026, 4, 10))

    email_b = _make_email(str(uuid.uuid4()), uid, "unknown-b.com",
                          datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_tx(str(uuid.uuid4()), email_b.id, 500.0, date(2026, 4, 10))

    db_session.add_all([email_a, tx_a, email_b, tx_b])
    await db_session.flush()

    rules_map: dict[tuple[str, str], DomainPairRule] = {}

    score_async, source_async = await _score_pair(tx_a, email_a, tx_b, email_b, db_session)
    score_sync, source_sync = _score_pair_with_rules(tx_a, email_a, tx_b, email_b, rules_map)

    assert score_async == score_sync == 0.5
    assert source_async == source_sync == "amount_date"


# ── Test 3: detect_and_record_duplicates (single-tx path) still works ────────

@pytest.mark.asyncio
async def test_single_tx_path_still_works(db_session, mock_user):
    """
    detect_and_record_duplicates (single-tx path) should still work unchanged
    after adding _score_pair_with_rules.
    """
    uid = str(mock_user.id)

    # Create an existing transaction
    email1 = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                         datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
    tx1 = _make_tx(str(uuid.uuid4()), email1.id, 500.0, date(2026, 4, 10))
    db_session.add_all([email1, tx1])
    await db_session.flush()

    # Create a new transaction that should match
    email2 = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                         datetime(2026, 4, 11, 10, 0, tzinfo=UTC))
    tx2 = _make_tx(str(uuid.uuid4()), email2.id, 500.0, date(2026, 4, 11))
    db_session.add_all([email2, tx2])
    await db_session.flush()

    await detect_and_record_duplicates(tx2, email2, db_session)
    await db_session.flush()

    pairs = (await db_session.execute(select(DuplicatePair))).scalars().all()
    assert len(pairs) == 1
    assert pairs[0].rule_source == "same_domain_exact"
    assert pairs[0].status == "auto_resolved"
    assert pairs[0].confidence == 1.0


# ── Test 4: Dedup correctness preserved (same pairs, same scores) ────────────

@pytest.mark.asyncio
async def batch_detect_duplicates_preserves_correctness(db_session, mock_user):
    """
    batch_detect_duplicates should detect the same pairs with the same scores
    as the old per-pair DB query approach would have.
    """
    uid = str(mock_user.id)

    # Create a DomainPairRule
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="hdfcbank.com",
        domain_b="swiggy.in",
        confirmed_count=2,
        dismissed_count=0,
        confidence=0.75,
        auto_resolve=False,
    )
    db_session.add(rule)

    # Create 3 existing transactions with different domains
    existing_data = [
        ("swiggy.in", 500.0, date(2026, 4, 10)),
        ("hdfcbank.com", 500.0, date(2026, 4, 10)),
        ("zomato.com", 999.0, date(2026, 4, 10)),  # different amount, should not match
    ]
    for domain, amount, txn_date in existing_data:
        eid = str(uuid.uuid4())
        tid = str(uuid.uuid4())
        email = _make_email(eid, uid, domain,
                            datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
        tx = _make_tx(tid, eid, amount, txn_date)
        db_session.add_all([email, tx])
    await db_session.flush()

    # Create 2 new transactions
    new_pairs = []
    for domain, amount, txn_date in [("swiggy.in", 500.0, date(2026, 4, 11)),
                                      ("hdfcbank.com", 500.0, date(2026, 4, 11))]:
        eid = str(uuid.uuid4())
        tid = str(uuid.uuid4())
        email = _make_email(eid, uid, domain,
                            datetime(2026, 4, 11, 10, 0, tzinfo=UTC))
        tx = _make_tx(tid, eid, amount, txn_date)
        new_pairs.append((tx, email))

    result = await batch_detect_duplicates(new_pairs, db_session, uid)

    # Each new tx should match 2 existing (swiggy + hdfcbank), but not zomato (different amount)
    # Plus intra-batch: the 2 new txes should match each other
    # Expected pairs: new_swiggy x existing_swiggy (same_domain),
    #                 new_swiggy x existing_hdfcbank (domain_pair),
    #                 new_hdfcbank x existing_swiggy (domain_pair),
    #                 new_hdfcbank x existing_hdfcbank (same_domain),
    #                 new_swiggy x new_hdfcbank (domain_pair, intra-batch)
    assert result["checked"] == 2
    assert result["same_domain_exact"] == 2  # swiggy-swiggy, hdfcbank-hdfcbank
    assert result["domain_pair"] == 3  # swiggy-hdfcbank x2 + intra-batch
    assert len(result["new_pair_ids"]) == 5


@pytest.mark.asyncio
async def test_batch_detect_empty_input():
    """batch_detect_duplicates with empty list returns zeroed stats."""
    db = AsyncMock(spec=AsyncSession)
    result = await batch_detect_duplicates([], db, "test-user")
    assert result["checked"] == 0
    assert result["new_pair_ids"] == []


@pytest.mark.asyncio
async def test_batch_detect_skips_non_candidates(db_session, mock_user):
    """Transactions with label='income' or no sender_domain are skipped."""
    uid = str(mock_user.id)

    # Income transaction — should be skipped
    email_income = _make_email(str(uuid.uuid4()), uid, "bank.com",
                               datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
    tx_income = _make_tx(str(uuid.uuid4()), email_income.id, 5000.0,
                         date(2026, 4, 10), label="income")

    # No sender_domain — should be skipped
    email_no_domain = Email(
        id=str(uuid.uuid4()), gmail_id="g-nodomain", sender="unknown",
        sender_domain=None, user_id=uid,
        received_at=datetime(2026, 4, 10, 10, 0, tzinfo=UTC),
    )
    tx_no_domain = _make_tx(str(uuid.uuid4()), email_no_domain.id, 500.0,
                            date(2026, 4, 10))

    db_session.add_all([email_income, tx_income, email_no_domain, tx_no_domain])
    await db_session.flush()

    result = await batch_detect_duplicates(
        [(tx_income, email_income), (tx_no_domain, email_no_domain)],
        db_session, uid,
    )
    assert result["checked"] == 2
    assert len(result["new_pair_ids"]) == 0


@pytest.mark.asyncio
async def test_score_pair_with_rules_missing_amount():
    """_score_pair_with_rules returns (0.0, 'unknown') when amount is None."""
    email_a = MagicMock(spec=Email)
    email_a.sender_domain = "a.com"
    email_a.received_at = datetime(2026, 4, 10, tzinfo=UTC)
    email_a.subject = ""

    email_b = MagicMock(spec=Email)
    email_b.sender_domain = "b.com"
    email_b.received_at = datetime(2026, 4, 10, tzinfo=UTC)
    email_b.subject = ""

    tx_a = MagicMock(spec=Transaction)
    tx_a.amount = None
    tx_a.txn_date = date(2026, 4, 10)
    tx_a.merchant = ""

    tx_b = MagicMock(spec=Transaction)
    tx_b.amount = 500.0
    tx_b.txn_date = date(2026, 4, 10)
    tx_b.merchant = ""

    score, source = _score_pair_with_rules(tx_a, email_a, tx_b, email_b, {})
    assert score == 0.0
    assert source == "unknown"


@pytest.mark.asyncio
async def test_score_pair_with_rules_day_diff_too_large():
    """_score_pair_with_rules returns (0.0, 'unknown') when day_diff > 3."""
    email_a = MagicMock(spec=Email)
    email_a.sender_domain = "a.com"
    email_a.received_at = datetime(2026, 4, 1, tzinfo=UTC)
    email_a.subject = ""

    email_b = MagicMock(spec=Email)
    email_b.sender_domain = "b.com"
    email_b.received_at = datetime(2026, 4, 10, tzinfo=UTC)
    email_b.subject = ""

    tx_a = MagicMock(spec=Transaction)
    tx_a.amount = 500.0
    tx_a.txn_date = date(2026, 4, 1)
    tx_a.merchant = ""

    tx_b = MagicMock(spec=Transaction)
    tx_b.amount = 500.0
    tx_b.txn_date = date(2026, 4, 10)
    tx_b.merchant = ""

    score, source = _score_pair_with_rules(tx_a, email_a, tx_b, email_b, {})
    assert score == 0.0
    assert source == "unknown"


# ── Test 5: _compute_score pure function ─────────────────────────────────────

def _make_mock_email(sender_domain: str, received_at: datetime, subject: str = "") -> MagicMock:
    m = MagicMock(spec=Email)
    m.sender_domain = sender_domain
    m.received_at = received_at
    m.subject = subject
    return m


def _make_mock_tx(amount: float, txn_date: date, merchant: str = "") -> MagicMock:
    m = MagicMock(spec=Transaction)
    m.amount = amount
    m.txn_date = txn_date
    m.merchant = merchant
    return m


def test_compute_score_same_domain():
    """_compute_score returns (1.0, 'same_domain_exact') for same domain."""
    email_a = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10))
    email_b = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, None)
    assert score == 1.0
    assert source == "same_domain_exact"


def test_compute_score_domain_pair_with_rule():
    """_compute_score returns rule.confidence when a valid rule is provided."""
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="hdfcbank.com",
        domain_b="swiggy.in",
        confirmed_count=2,
        dismissed_count=0,
        confidence=0.75,
        auto_resolve=False,
    )
    email_a = _make_mock_email("hdfcbank.com", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10))
    email_b = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, rule)
    assert score == 0.75
    assert source == "domain_pair"


def test_compute_score_domain_pair_rule_below_threshold():
    """_compute_score ignores rule with confidence < 0.5."""
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="a.com",
        domain_b="b.com",
        confirmed_count=1,
        dismissed_count=1,
        confidence=0.4,
        auto_resolve=False,
    )
    email_a = _make_mock_email("a.com", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10))
    email_b = _make_mock_email("b.com", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, rule)
    assert score == 0.5
    assert source == "amount_date"


def test_compute_score_investment_flow():
    """_compute_score detects investment flow (order + confirmation)."""
    email_a = _make_mock_email(
        "fundhouse.com",
        datetime(2026, 4, 10, 9, 0, tzinfo=UTC),
        subject="Order placed for MF purchase",
    )
    tx_a = _make_mock_tx(5000.0, date(2026, 4, 10))
    email_b = _make_mock_email(
        "bank.com",
        datetime(2026, 4, 12, 12, 0, tzinfo=UTC),
        subject="Units allotted to your folio",
    )
    tx_b = _make_mock_tx(5000.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, None)
    assert score == 0.65
    assert source == "investment_flow"


def test_compute_score_amount_date_fallback():
    """_compute_score returns (0.5, 'amount_date') for same day, different domains."""
    email_a = _make_mock_email("x.com", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10))
    email_b = _make_mock_email("y.com", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, None)
    assert score == 0.5
    assert source == "amount_date"


def test_compute_score_amount_outside_tolerance():
    """_compute_score returns (0.0, 'unknown') when amounts differ beyond tolerance."""
    email_a = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10))
    email_b = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(999.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, None)
    assert score == 0.0
    assert source == "unknown"


def test_compute_score_day_diff_too_large():
    """_compute_score returns (0.0, 'unknown') when day_diff > 3."""
    email_a = _make_mock_email("a.com", datetime(2026, 4, 1, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 1))
    email_b = _make_mock_email("b.com", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10))

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, None)
    assert score == 0.0
    assert source == "unknown"


def test_compute_score_merchant_alias():
    """_compute_score returns merchant_alias score for known domain aliases."""
    email_a = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10), merchant="Swiggy")
    email_b = _make_mock_email("bundl.in", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10), merchant="Swiggy")

    score, source = _compute_score(tx_a, email_a, tx_b, email_b, None)
    assert source == "merchant_alias"
    assert 0.75 <= score <= 0.95


def test_compute_score_is_pure_no_side_effects():
    """_compute_score is a pure function — calling it twice returns identical results."""
    email_a = _make_mock_email("hdfcbank.com", datetime(2026, 4, 10, 9, 0, tzinfo=UTC))
    tx_a = _make_mock_tx(500.0, date(2026, 4, 10))
    email_b = _make_mock_email("swiggy.in", datetime(2026, 4, 10, 12, 0, tzinfo=UTC))
    tx_b = _make_mock_tx(500.0, date(2026, 4, 10))
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="hdfcbank.com",
        domain_b="swiggy.in",
        confirmed_count=2,
        dismissed_count=0,
        confidence=0.75,
        auto_resolve=False,
    )

    r1 = _compute_score(tx_a, email_a, tx_b, email_b, rule)
    r2 = _compute_score(tx_a, email_a, tx_b, email_b, rule)
    assert r1 == r2


# ── Task 2A: N+1 query fix for detect_and_record_duplicates ──────────────────

@pytest.mark.asyncio
async def test_detect_and_record_duplicates_query_count(db_session, mock_user):
    """
    detect_and_record_duplicates with 100 candidate transactions should use
    a constant number of DB queries (<= 5), not 100+ (one per pair).

    The optimization pre-loads all DomainPairRule rows once at the start
    instead of querying per candidate pair.
    """
    uid = str(mock_user.id)
    query_count = 0
    original_execute = db_session.execute

    async def counting_execute(*args, **kwargs):
        nonlocal query_count
        query_count += 1
        return await original_execute(*args, **kwargs)

    db_session.execute = counting_execute

    # Create one existing transaction
    email1 = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                         datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
    tx1 = _make_tx(str(uuid.uuid4()), email1.id, 500.0, date(2026, 4, 10))
    db_session.add_all([email1, tx1])
    await db_session.flush()

    # Create 100 new transactions that are candidates (same amount, within window)
    query_count_before = query_count
    for i in range(100):
        email_new = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                                datetime(2026, 4, 11, 10, 0, tzinfo=UTC))
        tx_new = _make_tx(str(uuid.uuid4()), email_new.id, 500.0, date(2026, 4, 11))
        db_session.add_all([email_new, tx_new])
        await db_session.flush()
        await detect_and_record_duplicates(tx_new, email_new, db_session)

    queries_used = query_count - query_count_before
    # Each call should use a constant number of queries (~4-5), not O(candidates)
    # 100 calls * ~5 queries each = ~500, NOT 100 * 100 = 10,000+
    avg_per_call = queries_used / 100
    assert avg_per_call <= 6, f"Average {avg_per_call:.1f} queries per call, expected <= 6 (was N+1 before fix)"


@pytest.mark.asyncio
async def test_detect_and_record_duplicates_correctness_preserved(db_session, mock_user):
    """
    detect_and_record_duplicates should produce identical results after the
    N+1 query fix — same pairs, same scores, same statuses.
    """
    uid = str(mock_user.id)

    # Create a DomainPairRule for cross-domain testing
    rule = DomainPairRule(
        id=str(uuid.uuid4()),
        domain_a="hdfcbank.com",
        domain_b="swiggy.in",
        confirmed_count=2,
        dismissed_count=0,
        confidence=0.75,
        auto_resolve=False,
    )
    db_session.add(rule)

    # Existing transaction
    email1 = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                         datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
    tx1 = _make_tx(str(uuid.uuid4()), email1.id, 500.0, date(2026, 4, 10))
    db_session.add_all([email1, tx1])
    await db_session.flush()

    # New transaction — should match existing (same_domain_exact)
    email2 = _make_email(str(uuid.uuid4()), uid, "swiggy.in",
                         datetime(2026, 4, 11, 10, 0, tzinfo=UTC))
    tx2 = _make_tx(str(uuid.uuid4()), email2.id, 500.0, date(2026, 4, 11))
    db_session.add_all([email2, tx2])
    await db_session.flush()

    await detect_and_record_duplicates(tx2, email2, db_session)
    await db_session.flush()

    pairs = (await db_session.execute(select(DuplicatePair))).scalars().all()
    assert len(pairs) == 1
    assert pairs[0].rule_source == "same_domain_exact"
    assert pairs[0].status == "auto_resolved"
    assert pairs[0].confidence == 1.0


# ── Task 2B: Intra-batch O(N²) fix for batch_detect_duplicates ───────────────

@pytest.mark.asyncio
async def test_batch_intra_batch_grouped_comparisons(db_session, mock_user):
    """
    batch_detect_duplicates with 500 messages where only 10 share the same
    amount+date should do ~100 comparisons (10²/2), not 250K (500²/2).

    The optimization groups by (amount, txn_date) and only compares within groups.
    """
    uid = str(mock_user.id)
    comparison_count = 0
    original_score = _score_pair_with_rules

    def counting_score(tx_a, email_a, tx_b, email_b, rules):
        nonlocal comparison_count
        comparison_count += 1
        return original_score(tx_a, email_a, tx_b, email_b, rules)

    with patch("app.dedup.service._score_pair_with_rules", side_effect=counting_score):
        # Create 490 transactions with unique amounts (no intra-batch matches possible)
        new_pairs = []
        for i in range(490):
            eid = str(uuid.uuid4())
            tid = str(uuid.uuid4())
            email = _make_email(eid, uid, "swiggy.in",
                                datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
            tx = _make_tx(tid, eid, 100.0 + i, date(2026, 4, 10))  # unique amounts
            new_pairs.append((tx, email))

        # Create 10 transactions with the SAME amount+date (potential duplicates)
        for i in range(10):
            eid = str(uuid.uuid4())
            tid = str(uuid.uuid4())
            email = _make_email(eid, uid, "swiggy.in",
                                datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
            tx = _make_tx(tid, eid, 500.0, date(2026, 4, 10))  # same amount+date
            new_pairs.append((tx, email))

        result = await batch_detect_duplicates(new_pairs, db_session, uid)

    # Only the 10 same-amount+date transactions should be compared with each other
    # That's C(10,2) = 45 comparisons, not C(500,2) = 124,750
    assert comparison_count <= 100, f"Did {comparison_count} comparisons, expected <= 100"
    assert result["checked"] == 500


@pytest.mark.asyncio
async def test_batch_intra_batch_finds_all_duplicate_pairs(db_session, mock_user):
    """
    Verify that the grouped intra-batch dedup still finds all correct duplicate pairs.
    """
    uid = str(mock_user.id)

    # Create 5 transactions with same amount+date (should all match each other)
    new_pairs = []
    for i in range(5):
        eid = str(uuid.uuid4())
        tid = str(uuid.uuid4())
        email = _make_email(eid, uid, "swiggy.in",
                            datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
        tx = _make_tx(tid, eid, 500.0, date(2026, 4, 10))
        new_pairs.append((tx, email))

    result = await batch_detect_duplicates(new_pairs, db_session, uid)

    # 5 transactions with same amount+date from same domain → C(5,2) = 10 pairs
    assert result["same_domain_exact"] == 10
    assert len(result["new_pair_ids"]) == 10


@pytest.mark.asyncio
async def test_batch_intra_batch_all_same_amount_date(db_session, mock_user):
    """
    Edge case: all 500 messages have the same amount+date.
    Should fall back to full O(N²) comparison (correct behavior).
    """
    uid = str(mock_user.id)
    comparison_count = 0
    original_score = _score_pair_with_rules

    def counting_score(tx_a, email_a, tx_b, email_b, rules):
        nonlocal comparison_count
        comparison_count += 1
        return original_score(tx_a, email_a, tx_b, email_b, rules)

    with patch("app.dedup.service._score_pair_with_rules", side_effect=counting_score):
        # All 500 with same amount+date
        new_pairs = []
        for i in range(500):
            eid = str(uuid.uuid4())
            tid = str(uuid.uuid4())
            email = _make_email(eid, uid, "swiggy.in",
                                datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
            tx = _make_tx(tid, eid, 500.0, date(2026, 4, 10))
            new_pairs.append((tx, email))

        result = await batch_detect_duplicates(new_pairs, db_session, uid)

    # All in one group → full C(500,2) = 124,750 comparisons
    expected_comparisons = 500 * 499 // 2
    assert comparison_count == expected_comparisons, f"Expected {expected_comparisons} comparisons, got {comparison_count}"
    assert result["checked"] == 500
    # All same domain → all should be same_domain_exact
    assert result["same_domain_exact"] == expected_comparisons


@pytest.mark.asyncio
async def test_batch_intra_batch_no_false_negatives(db_session, mock_user):
    """
    Verify that transactions with different amounts/dates are correctly
    NOT compared (no false negatives — they truly can't be duplicates).
    """
    uid = str(mock_user.id)

    # Create transactions with different amounts — should NOT match each other
    new_pairs = []
    for i in range(20):
        eid = str(uuid.uuid4())
        tid = str(uuid.uuid4())
        email = _make_email(eid, uid, "swiggy.in",
                            datetime(2026, 4, 10, 10, 0, tzinfo=UTC))
        tx = _make_tx(tid, eid, 100.0 + i * 10, date(2026, 4, 10))  # all different amounts
        new_pairs.append((tx, email))

    result = await batch_detect_duplicates(new_pairs, db_session, uid)

    # No pairs should be found (all amounts are different)
    assert len(result["new_pair_ids"]) == 0
    assert result["same_domain_exact"] == 0
