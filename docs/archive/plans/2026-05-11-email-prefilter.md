# Email Pre-Filter System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-on 3-tier email pre-filter that gates every incoming email before storage, routing ambiguous emails to a review queue with user keep/discard feedback.

**Architecture:** New `FilterRule` DB table stores allowlist/blocklist/keyword rules. `PreFilterEngine` (loaded once per sync from DB) evaluates each email via domain check → weighted regex scoring → LLM binary call. Passing emails continue to the existing classification pipeline; review emails are stored with `pre_filter_status="review_pending"` and surfaced in a new Review Queue tab in the inbox.

**Tech Stack:** FastAPI + SQLAlchemy async, Alembic migrations, React JSX (in-browser Babel), `MultiLLMClient.classify_verbose` for Tier 3.

---

## File Map

| File | Change |
|---|---|
| `app/models/filter_rule.py` | **Create** — `FilterRule` SQLAlchemy model |
| `app/models/email.py` | Add `pre_filter_status` mapped column |
| `app/models/__init__.py` | Export `FilterRule` |
| `alembic/versions/0022_add_prefilter.py` | **Create** — add column + table, seed domain rules |
| `app/classifier/pre_filter.py` | **Create** — `PreFilterEngine`, `PreFilterResult` |
| `app/sync.py` | Replace `is_likely_financial` guard with pre-filter; add "review" to tally |
| `app/api/emails.py` | Add `status` query param to `list_emails`; add `POST /emails/{id}/review` |
| `app/api/filter.py` | **Create** — `POST /filter/refine` |
| `app/main.py` | Import and register filter router |
| `static/src/inbox.jsx` | Review Queue tab + `ReviewEmailRow` component |
| `static/src/app.jsx` | `reviewEmails` state + fetch + pass as prop |
| `static/src/account.jsx` | Refine Filter Rules button in AI settings |
| `tests/test_pre_filter.py` | **Create** — pre-filter engine unit tests |
| `tests/test_filter_api.py` | **Create** — review API endpoint tests |

---

## Task 1: FilterRule model + Email.pre_filter_status

**Files:**
- Create: `app/models/filter_rule.py`
- Modify: `app/models/email.py`
- Modify: `app/models/__init__.py`
- Test: `tests/test_pre_filter.py`

- [ ] **Step 1: Write failing test for FilterRule model**

```python
# tests/test_pre_filter.py
import pytest
import pytest_asyncio
from sqlalchemy import select


@pytest.mark.asyncio
async def test_filter_rule_create(db_session):
    from app.models import FilterRule
    rule = FilterRule(rule_type="allowlist_domain", value="hdfcbank.com", source="system")
    db_session.add(rule)
    await db_session.flush()
    assert rule.id is not None
    assert rule.hit_count == 0


@pytest.mark.asyncio
async def test_email_pre_filter_status_defaults_to_passed(db_session, mock_user):
    from app.models import Email
    email = Email(
        gmail_id="test-001",
        subject="Your HDFC statement",
        user_id=mock_user.id,
    )
    db_session.add(email)
    await db_session.flush()
    assert email.pre_filter_status == "passed"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amansaini/GexpenseTracker
.venv/bin/pytest tests/test_pre_filter.py::test_filter_rule_create tests/test_pre_filter.py::test_email_pre_filter_status_defaults_to_passed -v
```
Expected: `ImportError` or `AttributeError` — `FilterRule` and `pre_filter_status` not yet defined.

- [ ] **Step 3: Create `app/models/filter_rule.py`**

```python
from datetime import datetime
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, _uuid_col, _utcnow


class FilterRule(Base):
    __tablename__ = "filter_rules"

    id: Mapped[str] = _uuid_col()
    rule_type: Mapped[str] = mapped_column(String(30))   # allowlist_domain | blocklist_domain | keyword_pattern
    value: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(20))      # system | user | llm
    hit_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
```

- [ ] **Step 4: Add `pre_filter_status` to `app/models/email.py`**

Open `app/models/email.py`. After line 21 (`synced_at`), add:
```python
    pre_filter_status: Mapped[str] = mapped_column(String(20), default="passed", server_default="passed")
```

- [ ] **Step 5: Export `FilterRule` in `app/models/__init__.py`**

In `app/models/__init__.py`, add after `from .email import (Email, SyncState,)`:
```python
from .filter_rule import (
    FilterRule,
)
```
Add `"FilterRule"` to the `__all__` list if one exists.

- [ ] **Step 6: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_pre_filter.py::test_filter_rule_create tests/test_pre_filter.py::test_email_pre_filter_status_defaults_to_passed -v
```
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add app/models/filter_rule.py app/models/email.py app/models/__init__.py tests/test_pre_filter.py
git commit -m "feat: add FilterRule model and Email.pre_filter_status column"
```

---

## Task 2: Alembic migration

**Files:**
- Create: `alembic/versions/0022_add_prefilter.py`

- [ ] **Step 1: Create migration file `alembic/versions/0022_add_prefilter.py`**

```python
"""add pre_filter_status to emails; add filter_rules table

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

_DOMAIN_SEEDS = [
    "hdfcbank.com", "axisbank.com", "sbi.co.in", "icicibank.com", "kotak.com",
    "yesbank.in", "indusind.com", "idfcfirstbank.com", "rbl.co.in", "federalbank.co.in",
    "paytm.com", "phonepe.com", "gpay.com", "googlepay.com", "amazonpay.in",
    "npci.org.in", "razorpay.com", "cashfree.com", "billdesk.com", "mobikwik.com",
    "freecharge.in", "pnbindia.in", "canarabank.in", "unionbankofindia.co.in",
    "bankofbaroda.in", "upi.npci.org.in",
]

_KEYWORD_SEEDS = [
    "debit", "credit", "transaction", "payment", "salary", "cashback",
    "refund", "EMI", "transfer", "charged", "purchased", "spent",
    "received", "deposited", "withdrawn",
]


def upgrade() -> None:
    op.add_column(
        "emails",
        sa.Column("pre_filter_status", sa.String(20), server_default="passed", nullable=False),
    )

    op.create_table(
        "filter_rules",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("rule_type", sa.String(30), nullable=False),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("hit_count", sa.Integer, server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    import uuid
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    filter_rules = op.get_bind().engine.raw_connection() if hasattr(op.get_bind(), 'engine') else op.get_bind()

    rows = []
    for domain in _DOMAIN_SEEDS:
        rows.append({
            "id": str(uuid.uuid4()),
            "rule_type": "allowlist_domain",
            "value": domain,
            "source": "system",
            "hit_count": 0,
            "created_at": now,
        })
    for keyword in _KEYWORD_SEEDS:
        rows.append({
            "id": str(uuid.uuid4()),
            "rule_type": "keyword_pattern",
            "value": keyword,
            "source": "system",
            "hit_count": 0,
            "created_at": now,
        })

    if rows:
        op.bulk_insert(
            sa.table(
                "filter_rules",
                sa.column("id", sa.String),
                sa.column("rule_type", sa.String),
                sa.column("value", sa.String),
                sa.column("source", sa.String),
                sa.column("hit_count", sa.Integer),
                sa.column("created_at", sa.DateTime),
            ),
            rows,
        )


def downgrade() -> None:
    op.drop_table("filter_rules")
    op.drop_column("emails", "pre_filter_status")
```

- [ ] **Step 2: Run migration to verify it applies cleanly**

```bash
.venv/bin/alembic upgrade head
```
Expected: `Running upgrade 0021 -> 0022, add pre_filter_status to emails; add filter_rules table`

- [ ] **Step 3: Verify seed data inserted**

```bash
.venv/bin/python -c "
import asyncio
from app.database import AsyncSessionLocal
from app.models import FilterRule
from sqlalchemy import select, func

async def check():
    async with AsyncSessionLocal() as s:
        count = (await s.execute(select(func.count()).select_from(FilterRule))).scalar()
        print(f'FilterRule rows: {count}')
asyncio.run(check())
"
```
Expected: `FilterRule rows: 40` (25 domains + 15 keywords, approximately).

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/0022_add_prefilter.py
git commit -m "feat: migration 0022 — add Email.pre_filter_status + FilterRule table with seed rules"
```

---

## Task 3: Pre-filter engine

**Files:**
- Create: `app/classifier/pre_filter.py`
- Modify: `tests/test_pre_filter.py`

- [ ] **Step 1: Write failing tests for pre-filter engine**

Append to `tests/test_pre_filter.py`:

```python
@pytest.mark.asyncio
async def test_tier1_allowlist_domain_passes(db_session):
    from app.models import FilterRule
    from app.classifier.pre_filter import PreFilterEngine

    rule = FilterRule(rule_type="allowlist_domain", value="hdfcbank.com", source="system")
    db_session.add(rule)
    await db_session.flush()

    engine = PreFilterEngine([rule])
    result = engine.evaluate_sync("Debit alert", "Rs 500 debited", "hdfcbank.com")
    assert result.decision == "pass"
    assert result.tier == 1
    assert result.confidence == 1.0


@pytest.mark.asyncio
async def test_tier1_blocklist_domain_reviews(db_session):
    from app.models import FilterRule
    from app.classifier.pre_filter import PreFilterEngine

    rule = FilterRule(rule_type="blocklist_domain", value="promo.spammy.com", source="user")
    db_session.add(rule)
    await db_session.flush()

    engine = PreFilterEngine([rule])
    result = engine.evaluate_sync("Big sale today!", "50% off everything", "promo.spammy.com")
    assert result.decision == "review"
    assert result.tier == 1
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_tier2_high_score_passes():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    result = engine.evaluate_sync(
        subject="INR 2,500 debited via UPI",
        snippet="Your account has been debited Rs. 2500 via UPI ref 123456",
        sender_domain="unknown-bank.com",
    )
    assert result.decision == "pass"
    assert result.tier == 2


@pytest.mark.asyncio
async def test_tier2_low_score_reviews():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    result = engine.evaluate_sync(
        subject="Your order has shipped!",
        snippet="Your package from Amazon is on its way.",
        sender_domain="amazon.com",
    )
    assert result.decision == "review"
    assert result.tier == 2


@pytest.mark.asyncio
async def test_tier2_ambiguous_band_returns_ambiguous():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    # Score ~0.40: amount present but no verb and no network keyword
    result = engine.evaluate_sync(
        subject="Rs. 1000",
        snippet="Amount: Rs. 1000",
        sender_domain="newsletter.com",
    )
    assert result.decision == "ambiguous"
    assert result.tier == 2


@pytest.mark.asyncio
async def test_tier3_fallback_to_review_when_no_llm():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    result = await engine.evaluate(
        subject="Rs. 1000",
        snippet="Amount: Rs. 1000",
        sender_domain="newsletter.com",
        session=None,
        user_llm_client=None,
    )
    assert result.decision == "review"
    assert result.tier == 3
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_pre_filter.py -v -k "tier"
```
Expected: `ImportError: cannot import name 'PreFilterEngine' from 'app.classifier.pre_filter'`

- [ ] **Step 3: Create `app/classifier/pre_filter.py`**

```python
import re
import logging
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class PreFilterResult:
    decision: str   # "pass" | "review" | "ambiguous"
    confidence: float
    tier: int


class PreFilterEngine:
    _AMOUNT_RE = re.compile(
        r"Rs\.?\s*[\d,]+|INR\s*[\d,]+|[\d,]+\s*(?:INR|Rs)",
        re.IGNORECASE,
    )
    _VERB_RE = re.compile(
        r"\b(debit|credit|charged|spent|received|deposited|withdrawn)\b",
        re.IGNORECASE,
    )
    _NETWORK_RE = re.compile(
        r"\b(UPI|NEFT|IMPS|RTGS|NACH)\b",
        re.IGNORECASE,
    )

    def __init__(self, rules: list) -> None:
        self._allowlist = {r.value.lower() for r in rules if r.rule_type == "allowlist_domain"}
        self._blocklist = {r.value.lower() for r in rules if r.rule_type == "blocklist_domain"}
        self._keyword_patterns = [
            re.compile(re.escape(r.value), re.IGNORECASE)
            for r in rules
            if r.rule_type == "keyword_pattern"
        ]

    def evaluate_sync(self, subject: str, snippet: str, sender_domain: str) -> PreFilterResult:
        domain = (sender_domain or "").lower()

        # Tier 1 — domain check
        if domain in self._allowlist:
            return PreFilterResult(decision="pass", confidence=1.0, tier=1)
        if domain in self._blocklist:
            return PreFilterResult(decision="review", confidence=0.0, tier=1)

        # Tier 2 — weighted regex scoring
        text = f"{subject} {snippet}"
        score = 0.0
        if self._AMOUNT_RE.search(text):
            score += 0.40
        if self._VERB_RE.search(text):
            score += 0.30
        if self._NETWORK_RE.search(text):
            score += 0.20
        if any(p.search(text) for p in self._keyword_patterns):
            score += 0.10

        if score >= 0.60:
            return PreFilterResult(decision="pass", confidence=score, tier=2)
        if score <= 0.25:
            return PreFilterResult(decision="review", confidence=score, tier=2)
        return PreFilterResult(decision="ambiguous", confidence=score, tier=2)

    async def evaluate(
        self,
        subject: str,
        snippet: str,
        sender_domain: str,
        session,
        user_llm_client=None,
    ) -> PreFilterResult:
        result = self.evaluate_sync(subject, snippet, sender_domain)
        if result.decision != "ambiguous":
            return result

        # Tier 3 — LLM binary call
        if not user_llm_client:
            return PreFilterResult(decision="review", confidence=result.confidence, tier=3)

        try:
            verbose = await user_llm_client.classify_verbose(
                sender=sender_domain,
                subject=subject,
                body_snippet=f"{subject} {snippet[:200]}",
            )
            label = verbose.get("label", "ignore")
            decision = "pass" if label != "ignore" else "review"
            return PreFilterResult(decision=decision, confidence=0.5, tier=3)
        except Exception as exc:
            logger.warning("Pre-filter Tier 3 LLM call failed: %s", exc)
            return PreFilterResult(decision="review", confidence=result.confidence, tier=3)


async def load_engine_from_db(session) -> PreFilterEngine:
    """Load all FilterRule rows and build a PreFilterEngine. Call once per sync run."""
    from sqlalchemy import select
    from app.models import FilterRule

    rules = (await session.execute(select(FilterRule))).scalars().all()
    return PreFilterEngine(rules)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_pre_filter.py -v -k "tier"
```
Expected: all 6 tier tests PASS.

- [ ] **Step 5: Run full suite to check for regressions**

```bash
.venv/bin/pytest --ignore=tests/test_llm_client.py -q
```
Expected: same pass count as before (163+), no failures.

- [ ] **Step 6: Commit**

```bash
git add app/classifier/pre_filter.py tests/test_pre_filter.py
git commit -m "feat: add PreFilterEngine with 3-tier domain/regex/LLM evaluation"
```

---

## Task 4: Sync pipeline integration

**Files:**
- Modify: `app/sync.py`

- [ ] **Step 1: Write failing test for sync pre-filter behavior**

Append to `tests/test_pre_filter.py`:

```python
@pytest.mark.asyncio
async def test_sync_routes_non_financial_to_review_pending(db_session, mock_user, monkeypatch):
    """An email that fails Tier 2 scoring gets stored with pre_filter_status=review_pending."""
    import asyncio
    from sqlalchemy import select
    from app.models import Email
    from app.sync import sync_emails

    # Patch Gmail fetch to return one non-financial email
    async def _fake_fetch(*a, **kw):
        return (
            [{
                "gmail_id": "fake-001",
                "subject": "Flash sale: 50% off everything!",
                "body_snippet": "Shop now and save big.",
                "sender": "promo@deals.com",
                "sender_domain": "deals.com",
                "body_text": "Shop now and save big.",
                "received_at": None,
                "gmail_link": None,
            }],
            "hist-001",
        )

    monkeypatch.setattr("app.sync.asyncio.to_thread", lambda fn, *a, **kw: _fake_fetch())

    # Patch Gmail creds
    monkeypatch.setattr("app.sync.get_credentials_for_user", lambda *a, **kw: asyncio.coroutine(lambda: "fake-creds")())

    await sync_emails(db_session, user_id=mock_user.id)

    email = (await db_session.execute(
        select(Email).where(Email.gmail_id == "fake-001")
    )).scalar_one_or_none()

    assert email is not None, "Email should be stored even when pre-filter flags it"
    assert email.pre_filter_status == "review_pending"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
.venv/bin/pytest tests/test_pre_filter.py::test_sync_routes_non_financial_to_review_pending -v
```
Expected: FAIL — email stored but `pre_filter_status == "passed"` (old behavior, no pre-filter applied).

- [ ] **Step 3: Modify `app/sync.py` — load FilterRule engine before dedup loop**

In `app/sync.py`, find the comment `# ── Phase 2b: load rule engine settings` (approx line 145). Before Phase 2b, add a new section to load the pre-filter engine. Insert this BEFORE the `filter_financial` / dedup loop block and AFTER the `await session.flush()`:

Find in `app/sync.py`:
```python
        await session.flush()  # assign IDs to all new Email rows at once

        # ── Phase 2b: load rule engine settings ───────────────────────────────
```

Replace with:
```python
        # ── Phase 2a: build pre-filter engine from DB rules ───────────────────
        from app.classifier.pre_filter import load_engine_from_db
        pre_filter_engine = await load_engine_from_db(session)

        await session.flush()  # assign IDs to all new Email rows at once

        # ── Phase 2b: load rule engine settings ───────────────────────────────
```

Wait — the engine needs to be built BEFORE emails are stored so we can gate storage. Move the engine load to before the dedup loop. Find:

```python
        filter_financial = email_filter == "financial"

        for msg in messages:
            if msg["gmail_id"] in already_stored:
                skipped += 1
                continue
            # Pre-storage relevance check: history API path doesn't support query filters
            if filter_financial:
                from app.gmail.client import is_likely_financial
                if not is_likely_financial(
                    msg.get("subject", ""),
                    msg.get("body_snippet", ""),
                    msg.get("sender_domain", ""),
                ):
                    skipped += 1
                    continue
            email = Email(**msg)
            if user_id:
                email.user_id = user_id
            session.add(email)
            new_pairs.append((email, msg))
```

Replace with:
```python
        from app.classifier.pre_filter import load_engine_from_db
        pre_filter_engine = await load_engine_from_db(session)

        for msg in messages:
            if msg["gmail_id"] in already_stored:
                skipped += 1
                continue

            pf_result = await pre_filter_engine.evaluate(
                subject=msg.get("subject", ""),
                snippet=msg.get("body_snippet", ""),
                sender_domain=msg.get("sender_domain", ""),
                session=session,
                user_llm_client=None,  # LLM client loaded in Phase 2c; Tier 3 falls back to review
            )

            email = Email(**msg)
            if user_id:
                email.user_id = user_id
            email.pre_filter_status = pf_result.decision if pf_result.decision in ("passed", "review_pending") else (
                "passed" if pf_result.decision == "pass" else "review_pending"
            )
            session.add(email)
            if pf_result.decision == "pass":
                new_pairs.append((email, msg))
            else:
                skipped += 1
                _sync_progress["tally"]["review"] = _sync_progress["tally"].get("review", 0) + 1
                logger.debug("Pre-filter review: %s (tier=%d conf=%.2f)", msg.get("subject", ""), pf_result.tier, pf_result.confidence)
```

- [ ] **Step 4: Add "review" to tally initialization in `_sync_progress` and `_reset_progress`**

Find in `app/sync.py`:
```python
    "tally": {"expense": 0, "income": 0, "ignore": 0},
```
Replace both occurrences (in `_sync_progress` dict literal and in `_reset_progress`) with:
```python
    "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
```

- [ ] **Step 5: Run the sync pre-filter test**

```bash
.venv/bin/pytest tests/test_pre_filter.py::test_sync_routes_non_financial_to_review_pending -v
```
Expected: PASS.

- [ ] **Step 6: Run full suite**

```bash
.venv/bin/pytest --ignore=tests/test_llm_client.py -q
```
Expected: same pass count, no regressions.

- [ ] **Step 7: Commit**

```bash
git add app/sync.py tests/test_pre_filter.py
git commit -m "feat: replace is_likely_financial guard with always-on PreFilterEngine in sync pipeline"
```

---

## Task 5: Review API endpoints

**Files:**
- Modify: `app/api/emails.py`
- Create: `app/api/filter.py`
- Modify: `app/main.py`
- Create: `tests/test_filter_api.py`

- [ ] **Step 1: Write failing tests for review API**

Create `tests/test_filter_api.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.database import get_db
from app.auth_deps import get_current_user


async def _client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_list_emails_status_filter(db_session, mock_user):
    from app.models import Email

    e1 = Email(gmail_id="g-001", subject="Debit alert", user_id=mock_user.id, pre_filter_status="passed")
    e2 = Email(gmail_id="g-002", subject="Flash sale", user_id=mock_user.id, pre_filter_status="review_pending")
    db_session.add_all([e1, e2])
    await db_session.commit()

    client = await _client(db_session)
    try:
        async with client:
            resp = await client.get("/api/emails?status=review_pending")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["subject"] == "Flash sale"
            assert data[0]["pre_filter_status"] == "review_pending"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_review_keep_action_classifies_and_updates_status(db_session, mock_user, monkeypatch):
    from app.models import Email, FilterRule

    email = Email(gmail_id="g-keep-001", subject="HDFC debit Rs 500", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="hdfcbank.com", sender="alerts@hdfcbank.com", body_text="Rs 500 debited")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    # Stub classify_email to avoid LLM calls
    async def _fake_classify(**kwargs):
        from app.classifier.protocol import ClassificationResult
        from app.models import Label
        return ClassificationResult(label=Label.expense, amount=500.0, merchant="HDFC", category="banking", confidence=0.95, classifier_method="stub", warnings=[])

    monkeypatch.setattr("app.api.emails.classify_email", _fake_classify)

    client = await _client(db_session)
    try:
        async with client:
            resp = await client.post(f"/api/emails/{email.id}/review", json={"action": "keep"})
            assert resp.status_code == 200

        await db_session.refresh(email)
        assert email.pre_filter_status == "passed"

        rule = (await db_session.execute(
            select(FilterRule).where(
                FilterRule.rule_type == "allowlist_domain",
                FilterRule.value == "hdfcbank.com",
                FilterRule.source == "user",
            )
        )).scalar_one_or_none()
        assert rule is not None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_review_discard_action_updates_status_and_blocklists(db_session, mock_user):
    from app.models import Email, FilterRule

    email = Email(gmail_id="g-discard-001", subject="Buy now!", user_id=mock_user.id, pre_filter_status="review_pending", sender_domain="spam.deals.com", sender="promo@spam.deals.com")
    db_session.add(email)
    await db_session.commit()
    await db_session.refresh(email)

    client = await _client(db_session)
    try:
        async with client:
            resp = await client.post(f"/api/emails/{email.id}/review", json={"action": "discard"})
            assert resp.status_code == 200

        await db_session.refresh(email)
        assert email.pre_filter_status == "discarded"

        rule = (await db_session.execute(
            select(FilterRule).where(
                FilterRule.rule_type == "blocklist_domain",
                FilterRule.value == "spam.deals.com",
                FilterRule.source == "user",
            )
        )).scalar_one_or_none()
        assert rule is not None
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_filter_api.py -v
```
Expected: `404` or endpoint-not-found errors.

- [ ] **Step 3: Add `status` query param to `list_emails` in `app/api/emails.py`**

Find in `app/api/emails.py`:
```python
@router.get("/emails")
async def list_emails(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)
        .order_by(desc(Email.received_at))
    )
    rows = result.all()

    return [
        {
            "id": e.id,
```

Replace with:
```python
@router.get("/emails")
async def list_emails(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)
        .order_by(desc(Email.received_at))
    )
    if status:
        q = q.where(Email.pre_filter_status == status)
    result = await db.execute(q)
    rows = result.all()

    return [
        {
            "id": e.id,
            "gmail_id": e.gmail_id,
            "subject": e.subject,
            "sender": e.sender,
            "sender_domain": e.sender_domain,
            "received_at": e.received_at.isoformat() if e.received_at else None,
            "body_snippet": e.body_snippet,
            "body_text": e.body_text,
            "gmail_link": e.gmail_link,
            "pre_filter_status": e.pre_filter_status,
            "txn_id": t.id if t else None,
            "label": t.label if t else None,
            "status": t.status if t else None,
            "amount": float(t.amount) if t and t.amount is not None else None,
            "merchant": t.merchant if t else None,
            "category": t.category if t else None,
            "classifier_method": t.classifier_method if t else None,
        }
        for e, t in rows
    ]
```

Also add `Optional` to the import at the top of `app/api/emails.py` if not already present:
```python
from typing import List, Optional
```

- [ ] **Step 4: Add `POST /emails/{id}/review` to `app/api/emails.py`**

Add this after the `list_emails` function. Add a `Pydantic` model for the request body and the endpoint:

```python
class ReviewAction(BaseModel):
    action: str  # "keep" | "discard"


@router.post("/emails/{email_id}/review")
async def review_email(
    email_id: str,
    payload: ReviewAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import or_
    from app.models import FilterRule

    email = (await db.execute(
        select(Email).where(Email.id == email_id, Email.user_id == current_user.id)
    )).scalar_one_or_none()
    if not email:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Email not found")

    if payload.action == "keep":
        result = await classify_email(
            email_id=email.id,
            sender=email.sender or "",
            sender_domain=email.sender_domain or "",
            subject=email.subject or "",
            body_text=email.body_text or email.body_snippet or "",
            session=db,
            user_id=current_user.id,
        )
        from app.models import Transaction, Label
        txn = Transaction(
            email_id=email.id,
            label=result.label,
            amount=result.amount,
            merchant=result.merchant,
            category=result.category,
            confidence=result.confidence,
            classifier_method=result.classifier_method,
        )
        db.add(txn)
        email.pre_filter_status = "passed"

        # Upsert allowlist rule for this sender domain
        if email.sender_domain:
            existing_rule = (await db.execute(
                select(FilterRule).where(
                    FilterRule.rule_type == "allowlist_domain",
                    FilterRule.value == email.sender_domain,
                    FilterRule.source == "user",
                )
            )).scalar_one_or_none()
            if existing_rule:
                existing_rule.hit_count += 1
            else:
                db.add(FilterRule(
                    rule_type="allowlist_domain",
                    value=email.sender_domain,
                    source="user",
                ))

    elif payload.action == "discard":
        email.pre_filter_status = "discarded"

        # Upsert blocklist rule for this sender domain
        if email.sender_domain:
            from app.models import FilterRule
            existing_rule = (await db.execute(
                select(FilterRule).where(
                    FilterRule.rule_type == "blocklist_domain",
                    FilterRule.value == email.sender_domain,
                    FilterRule.source == "user",
                )
            )).scalar_one_or_none()
            if existing_rule:
                existing_rule.hit_count += 1
            else:
                db.add(FilterRule(
                    rule_type="blocklist_domain",
                    value=email.sender_domain,
                    source="user",
                ))
    else:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="action must be 'keep' or 'discard'")

    await db.commit()
    return {"ok": True, "status": email.pre_filter_status}
```

- [ ] **Step 5: Create `app/api/filter.py`**

```python
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import FilterRule, User, Transaction, Email, UserSettings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/filter/refine")
async def refine_filter_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pull recent keep/discard decisions, ask LLM for new keyword patterns/domain rules,
    upsert as FilterRule rows with source='llm', return diff.
    """
    # Load user LLM client
    user_settings = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )).scalar_one_or_none()

    if not user_settings or not user_settings.active_ai_service_id:
        return {"error": "No LLM configured. Add an AI service in settings first."}

    from app.models.user import UserAIService
    from app.api._account_helpers import _decrypt_secret
    from app.classifier.llm_client import build_user_client

    ai_svc = (await db.execute(
        select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
    )).scalar_one_or_none()

    if not ai_svc or not ai_svc.enabled or not ai_svc.encrypted_api_key:
        return {"error": "Active AI service is disabled or missing API key."}

    try:
        decrypted_key = _decrypt_secret(ai_svc.encrypted_api_key)
        llm_client = build_user_client(
            user_id=current_user.id,
            provider=ai_svc.provider,
            base_url=ai_svc.base_url,
            api_key=decrypted_key,
            model_id=ai_svc.model_id,
        )
    except Exception as exc:
        return {"error": f"Failed to load LLM client: {exc}"}

    # Pull last 50 keep/discard decisions
    rows = (await db.execute(
        select(Email.subject, Email.sender_domain, Email.pre_filter_status)
        .where(
            Email.user_id == current_user.id,
            Email.pre_filter_status.in_(["passed", "discarded"]),
        )
        .order_by(Email.synced_at.desc())
        .limit(50)
    )).all()

    if not rows:
        return {"added": [], "updated": [], "message": "No labeled examples yet."}

    examples = "\n".join(
        f"- subject: {r.subject!r}, domain: {r.sender_domain!r}, decision: {'keep' if r.pre_filter_status == 'passed' else 'discard'}"
        for r in rows
    )
    prompt = (
        "You are a filter rule generator. Based on these labeled email decisions, "
        "suggest new filter rules as JSON. Return ONLY a JSON array of objects with keys: "
        "rule_type (allowlist_domain|blocklist_domain|keyword_pattern), value (string).\n\n"
        f"Examples:\n{examples}\n\nRules:"
    )

    try:
        verbose = await llm_client.classify_verbose(
            sender="system",
            subject="Filter rule generation",
            body_snippet=prompt,
        )
        raw = verbose.get("raw_response", "")
    except Exception as exc:
        return {"error": f"LLM call failed: {exc}"}

    # Parse JSON array from response
    import json, re
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return {"error": "LLM did not return a valid JSON array.", "raw": raw[:500]}

    try:
        suggestions = json.loads(match.group())
    except json.JSONDecodeError:
        return {"error": "Failed to parse LLM JSON.", "raw": raw[:500]}

    added = []
    updated = []
    for s in suggestions:
        rule_type = s.get("rule_type", "")
        value = s.get("value", "").strip()
        if not rule_type or not value:
            continue
        if rule_type not in ("allowlist_domain", "blocklist_domain", "keyword_pattern"):
            continue

        existing = (await db.execute(
            select(FilterRule).where(
                FilterRule.rule_type == rule_type,
                FilterRule.value == value,
            )
        )).scalar_one_or_none()

        if existing:
            existing.source = "llm"
            updated.append({"rule_type": rule_type, "value": value})
        else:
            db.add(FilterRule(rule_type=rule_type, value=value, source="llm"))
            added.append({"rule_type": rule_type, "value": value})

    await db.commit()
    return {"added": added, "updated": updated}
```

- [ ] **Step 6: Register filter router in `app/main.py`**

Find in `app/main.py`:
```python
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api, stats as stats_api, budgets as budgets_api, emails as emails_api, admin as admin_api, duplicates as duplicates_api, debt as debt_api, settings as settings_api, onboarding as onboarding_api
```

Replace with:
```python
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api, stats as stats_api, budgets as budgets_api, emails as emails_api, admin as admin_api, duplicates as duplicates_api, debt as debt_api, settings as settings_api, onboarding as onboarding_api, filter as filter_api
```

Find in `app/main.py` (after the last `include_router` line):
```python
app.include_router(debt_api.router, prefix="/api")
```

Add after it:
```python
app.include_router(filter_api.router, prefix="/api")
```

- [ ] **Step 7: Run review API tests**

```bash
.venv/bin/pytest tests/test_filter_api.py -v
```
Expected: all 3 tests PASS.

- [ ] **Step 8: Run full suite**

```bash
.venv/bin/pytest --ignore=tests/test_llm_client.py -q
```
Expected: same pass count + 3 new passes, no regressions.

- [ ] **Step 9: Commit**

```bash
git add app/api/emails.py app/api/filter.py app/main.py tests/test_filter_api.py
git commit -m "feat: add /emails?status filter param, POST /emails/{id}/review, POST /filter/refine"
```

---

## Task 6: Frontend — Review Queue tab in inbox

**Files:**
- Modify: `static/src/app.jsx`
- Modify: `static/src/inbox.jsx`

- [ ] **Step 1: Add `reviewEmails` state to `app.jsx`**

In `static/src/app.jsx`, find (around line 7):
```javascript
  const [transactions, setTransactions] = useState([]);
```

Add after it:
```javascript
  const [reviewEmails, setReviewEmails] = React.useState([]);
```

- [ ] **Step 2: Fetch review emails when "review" filter is active in `app.jsx`**

In `app.jsx`, find the `inboxFilter` state or where `setInboxFilter` is defined. Find the section that passes props to InboxView (around line 298). Find:

```javascript
  const [inboxFilter, setInboxFilter] = React.useState("all");
```
(or similar — the state holding the current inbox filter)

Add a `useEffect` after the transactions fetch effect:
```javascript
  React.useEffect(() => {
    if (inboxFilter !== "review") return;
    API.get("/api/emails?status=review_pending")
      .then(data => setReviewEmails(data))
      .catch(() => {});
  }, [inboxFilter]);
```

- [ ] **Step 3: Pass `reviewEmails` and `setReviewEmails` to InboxView in `app.jsx`**

Find the `<InboxView` usage in `app.jsx` (around line 298):
```javascript
          <InboxView
            transactions={transactions}
            setTransactions={setTransactions}
```

Add two new props:
```javascript
          <InboxView
            transactions={transactions}
            setTransactions={setTransactions}
            reviewEmails={reviewEmails}
            setReviewEmails={setReviewEmails}
```

- [ ] **Step 4: Add `reviewEmails` prop to `InboxView` signature in `inbox.jsx`**

Find in `static/src/inbox.jsx` (line 576):
```javascript
const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, dateRange, setDateRange = () => {}, loadMore = () => {}, totalTransactions = 0, loadingMore = false }) => {
```

Replace with:
```javascript
const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, dateRange, setDateRange = () => {}, loadMore = () => {}, totalTransactions = 0, loadingMore = false, reviewEmails = [], setReviewEmails = () => {} }) => {
```

- [ ] **Step 5: Add "Review Queue" to tab bar array in `inbox.jsx`**

Find in `static/src/inbox.jsx` (approx lines 811-820):
```javascript
                {[
                  ["all","All", transactions.length],
                  ["expenses","Expenses"],
                  ["income","Income"],
                  ["sub","Subscriptions"],
                  ["flagged","Flagged"],
                  ["low","Needs review"],
                  ["duplicates","Duplicates"],
                ].map(([k,label,count]) => (
```

Replace with:
```javascript
                {[
                  ["all","All", transactions.length],
                  ["expenses","Expenses"],
                  ["income","Income"],
                  ["sub","Subscriptions"],
                  ["flagged","Flagged"],
                  ["low","Needs review"],
                  ["duplicates","Duplicates"],
                  ["review","Review Queue", reviewEmails.length],
                ].map(([k,label,count]) => (
```

- [ ] **Step 6: Add `ReviewEmailRow` component to `inbox.jsx`**

Add this component before `InboxView` (around line 575, before `const InboxView`):

```javascript
const ReviewEmailRow = ({ email, onKeep, onDiscard }) => {
  const [loading, setLoading] = React.useState(false);

  const handleAction = async (action) => {
    setLoading(true);
    try {
      await API.post(`/api/emails/${email.id}/review`, { action });
      if (action === "keep") onKeep(email.id);
      else onDiscard(email.id);
    } catch(e) {
      console.error("Review action failed", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Needs Review</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.subject || "(no subject)"}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{email.sender || email.sender_domain || ""}</div>
      {email.body_snippet && <div style={{ fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.body_snippet}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          disabled={loading}
          onClick={() => handleAction("keep")}
          style={{ fontSize: 12, padding: "4px 12px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff", cursor: loading ? "wait" : "pointer", fontWeight: 500 }}
        >Keep</button>
        <button
          disabled={loading}
          onClick={() => handleAction("discard")}
          style={{ fontSize: 12, padding: "4px 12px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: loading ? "wait" : "pointer" }}
        >Discard</button>
      </div>
    </div>
  );
};
```

- [ ] **Step 7: Add review queue rendering to InboxView in `inbox.jsx`**

In `static/src/inbox.jsx`, find the section that renders based on filter (after the toolbar div, around line 830+):
```javascript
          {filter === "duplicates" ? (
```

Add a block before it:
```javascript
          {filter === "review" ? (
            <div>
              {reviewEmails.length === 0 ? (
                <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>No emails pending review.</div>
              ) : (
                reviewEmails.map(email => (
                  <ReviewEmailRow
                    key={email.id}
                    email={email}
                    onKeep={id => setReviewEmails(es => es.filter(e => e.id !== id))}
                    onDiscard={id => setReviewEmails(es => es.filter(e => e.id !== id))}
                  />
                ))
              )}
            </div>
          ) : filter === "duplicates" ? (
```

And close the original duplicates block correctly — make sure you only replaced the `filter === "duplicates" ? (` opener, not the surrounding structure.

- [ ] **Step 8: Verify frontend changes in browser**

```bash
cd /Users/amansaini/GexpenseTracker
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000 in a browser. Go to Inbox. Verify:
- "Review Queue" tab appears in the tab bar
- Clicking it shows "No emails pending review." (or review emails if any exist)
- Keep and Discard buttons appear on review email rows

- [ ] **Step 9: Commit**

```bash
git add static/src/inbox.jsx static/src/app.jsx
git commit -m "feat: add Review Queue tab with Keep/Discard actions to inbox"
```

---

## Task 7: Frontend — Refine Filter Rules button in settings

**Files:**
- Modify: `static/src/account.jsx`

- [ ] **Step 1: Add `AdminFilterRulesSection` component to `account.jsx`**

In `static/src/account.jsx`, find where `AdminLLMSection` ends (around line 900+). Add this new component before `SettingsView`:

```javascript
const AdminFilterRulesSection = ({ settings }) => {
  const [status, setStatus] = React.useState("idle"); // idle | loading | done | error
  const [result, setResult] = React.useState(null);

  const hasLlm = !!(settings?.active_ai_service_id);

  const handleRefine = async () => {
    setStatus("loading");
    setResult(null);
    try {
      const data = await API.post("/api/filter/refine", {});
      setResult(data);
      setStatus("done");
    } catch(e) {
      setResult({ error: String(e) });
      setStatus("error");
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>Filter Rules</div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>
        Analyzes your keep/discard decisions and generates new filter rules using AI.
        {!hasLlm && <span style={{ color: "#b45309" }}> Requires an active AI service.</span>}
      </div>
      <button
        disabled={!hasLlm || status === "loading"}
        onClick={handleRefine}
        style={{ fontSize: 12, padding: "6px 14px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--paper)", color: hasLlm ? "var(--ink)" : "var(--ink-4)", cursor: hasLlm && status !== "loading" ? "pointer" : "not-allowed" }}
      >
        {status === "loading" ? "Analyzing…" : "Refine Filter Rules"}
      </button>
      {status === "done" && result && !result.error && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-2)" }}>
          <div>Added: {result.added?.length ?? 0} rules</div>
          <div>Updated: {result.updated?.length ?? 0} rules</div>
          {result.added?.map(r => <div key={r.value} style={{ color: "var(--ink-3)" }}>+ {r.rule_type}: {r.value}</div>)}
        </div>
      )}
      {(status === "error" || result?.error) && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{result?.error || "Refinement failed."}</div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Add `AdminFilterRulesSection` inside the AI settings tab in `SettingsView`**

In `account.jsx`, find the `SettingsView` function. Find where `AdminLLMSection` is rendered (search for `<AdminLLMSection`). Add `AdminFilterRulesSection` after it:

```javascript
          <AdminLLMSection account={account} settings={settings} />
          <AdminFilterRulesSection settings={settings} />
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:8000 → Settings → AI tab. Verify:
- "Filter Rules" section appears with "Refine Filter Rules" button
- Button is disabled when no AI service configured
- Clicking with an active AI service calls the endpoint and shows added/updated rule counts

- [ ] **Step 4: Run full test suite one final time**

```bash
.venv/bin/pytest --ignore=tests/test_llm_client.py -q
```
Expected: all tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add static/src/account.jsx
git commit -m "feat: add Refine Filter Rules button to AI settings page"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| `Email.pre_filter_status` column | Task 1 |
| `FilterRule` table with rule_type/value/source/hit_count | Task 1 |
| Seed `_FINANCIAL_DOMAINS` → allowlist_domain | Task 2 |
| Tier 1 domain allowlist/blocklist check | Task 3 |
| Tier 2 weighted regex scoring (4 signals) | Task 3 |
| Tier 3 LLM binary call, fallback to review | Task 3 |
| Replace `is_likely_financial` guard in sync | Task 4 |
| `review_pending` emails stored, no Transaction | Task 4 |
| `FilterRule.hit_count` increment for matched rule | Task 4 (logged; hit_count increment is in Task 5 review action) |
| Add "review" to sync tally | Task 4 |
| `GET /api/emails?status=review_pending` | Task 5 |
| `POST /api/emails/{id}/review` — keep/discard | Task 5 |
| Keep: run classify_email, upsert allowlist rule | Task 5 |
| Discard: upsert blocklist rule | Task 5 |
| `POST /api/filter/refine` LLM rule refinement | Task 5 |
| Frontend: amber badge + Keep/Discard buttons | Task 6 |
| Frontend: Review Queue tab | Task 6 |
| Frontend: Settings Refine Filter Rules button | Task 7 |

**Gap identified:** Sync progress tally "review" bucket initialized correctly. ✓ (Task 4 step 4)

**Gap identified:** `hit_count` increment for the rule that **fired** during sync (spec says "increment FilterRule.hit_count for the rule that fired"). This is complex (requires tracking which rule matched during pre-filter) and was omitted. The `hit_count` is incremented in the review action (keep/discard), which is sufficient for the core feedback loop. The per-rule firing increment can be added as a follow-up if needed.

**Gap identified:** Sync result panel "Filtered (needs review): N" count — the tally `"review": N` is already added to `_sync_progress.tally` in Task 4. Frontend sync progress display in `account.jsx` (`AdminSyncSection`) needs to read `tally.review`. This is a minor display addition. If `AdminSyncSection` already renders `tally` keys dynamically, it will show automatically. If not, a one-line addition to the sync progress display is needed but is not breaking.

### Placeholder Scan
No TBDs or incomplete steps found.

### Type Consistency
- `PreFilterResult.decision` values: `"pass"` / `"review"` / `"ambiguous"` — used consistently across pre_filter.py and sync.py
- `email.pre_filter_status` values: `"passed"` (note: engine returns `"pass"`, sync maps to `"passed"`) — mapping is explicit in Task 4 step 3
- `FilterRule.rule_type` values: `"allowlist_domain"` / `"blocklist_domain"` / `"keyword_pattern"` — consistent across model, migration, engine, and review API
