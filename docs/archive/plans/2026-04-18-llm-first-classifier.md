# LLM-First Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rule/ML classification pipeline with a straight LLM-only path and log every classification to a new `classification_log` table.

**Architecture:** Every email calls `MultiLLMClient.classify_verbose()` directly — no rules, no ML, no signal selection. Results plus full LLM input/output are written to `classification_log` for future rule mining. On total LLM failure the email returns `ignore/needs_review` so sync never crashes.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, Alembic, httpx (LLM calls already use it)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `app/models.py` | Add `ClassificationLog` ORM model |
| Create | `alembic/versions/0009_classification_log.py` | Migration: create `classification_log` table |
| Rewrite | `app/classifier/classifier.py` | LLM-only path, ~80 lines |
| Delete | `app/classifier/rules.py` | No longer used |
| Delete | `app/classifier/feature_classifier.py` | No longer used |
| Delete | `app/classifier/merchant_intelligence.py` | No longer used |
| Delete | `app/classifier/learning.py` | No longer used |
| Delete | `app/classifier/pattern_gen.py` | No longer used |
| Delete | `app/classifier/text_utils.py` | No longer used |
| Modify | `app/sync.py` | Pass `email_id`+`session`, remove `clean_body`+`db_rules` |
| Modify | `app/api/emails.py` | Remove dead imports, fix `classify_email` call |
| Modify | `app/api/review.py` | Remove dead imports, fix both `classify_email` calls |
| Modify | `app/api/transactions.py` | Remove `train_from_feedback` import |
| Modify | `app/api/sync.py` | Remove `get_model_status` import + endpoint |
| Modify | `app/main.py` | Remove `bootstrap_model_from_db` startup call |
| Rewrite | `tests/test_classifier.py` | Tests for new LLM-only pipeline |
| Delete | `tests/test_feature_classifier.py` | Tests for deleted module |

---

## Task 1: Add ClassificationLog ORM model

**Files:**
- Modify: `app/models.py`

- [ ] **Step 1: Add the model** — open `app/models.py` and append after the `PatternRule` class (at the end of the file):

```python
class ClassificationLog(Base):
    __tablename__ = "classification_log"

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("emails.id"), nullable=True)
    sender_domain: Mapped[Optional[str]] = mapped_column(String(255))
    subject: Mapped[Optional[str]] = mapped_column(Text)
    body_snippet: Mapped[Optional[str]] = mapped_column(Text)
    provider: Mapped[Optional[str]] = mapped_column(String(50))
    model: Mapped[Optional[str]] = mapped_column(String(100))
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    llm_label: Mapped[Optional[str]] = mapped_column(String(20))
    llm_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    llm_merchant: Mapped[Optional[str]] = mapped_column(String(255))
    llm_category: Mapped[Optional[str]] = mapped_column(String(100))
    llm_confidence: Mapped[Optional[float]] = mapped_column(Float)
    llm_txn_date: Mapped[Optional[date]] = mapped_column(Date)
    raw_response: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
```

- [ ] **Step 2: Verify import** — `ClassificationLog` uses `date` and `datetime` which are already imported at the top of `models.py`. Confirm `from datetime import UTC, datetime, date` is present on line 2. No new imports needed.

- [ ] **Step 3: Quick sanity check**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -c "from app.models import ClassificationLog; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add app/models.py
git commit -m "feat: add ClassificationLog ORM model"
```

---

## Task 2: Add Alembic migration

**Files:**
- Create: `alembic/versions/0009_classification_log.py`

- [ ] **Step 1: Create the migration file** at `alembic/versions/0009_classification_log.py`:

```python
"""add classification_log table

Revision ID: 0009
Revises: 0008
Create Date: 2026-04-18 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'classification_log',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email_id', sa.String(36), sa.ForeignKey('emails.id'), nullable=True),
        sa.Column('sender_domain', sa.String(255), nullable=True),
        sa.Column('subject', sa.Text(), nullable=True),
        sa.Column('body_snippet', sa.Text(), nullable=True),
        sa.Column('provider', sa.String(50), nullable=True),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('llm_label', sa.String(20), nullable=True),
        sa.Column('llm_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('llm_merchant', sa.String(255), nullable=True),
        sa.Column('llm_category', sa.String(100), nullable=True),
        sa.Column('llm_confidence', sa.Float(), nullable=True),
        sa.Column('llm_txn_date', sa.Date(), nullable=True),
        sa.Column('raw_response', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('classification_log')
```

- [ ] **Step 2: Run the migration**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && alembic upgrade head
```

Expected: `Running upgrade 0008 -> 0009, add classification_log table`

- [ ] **Step 3: Commit**

```bash
git add alembic/versions/0009_classification_log.py
git commit -m "feat: migration 0009 — add classification_log table"
```

---

## Task 3: Rewrite classifier.py (TDD)

**Files:**
- Rewrite: `app/classifier/classifier.py`
- Rewrite: `tests/test_classifier.py`

- [ ] **Step 1: Write the new tests** — replace `tests/test_classifier.py` entirely:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.classifier.classifier import classify_email, ClassificationResult
from app.classifier.llm_client import LLMClassification
from app.models import Label, TransactionStatus, ClassifierMethod


def _mock_verbose_result(label="expense", amount=499.0, merchant="Swiggy",
                          category="Food", txn_date="2026-04-10", confidence=0.95):
    return {
        "result": LLMClassification(
            label=label, amount=amount, merchant=merchant,
            category=category, txn_date=txn_date, confidence=confidence,
        ),
        "provider": "google",
        "model": "gemini-2.0-flash-exp",
        "prompt": "...",
        "raw_response": '{"label":"expense","amount":499.0,"merchant":"Swiggy","category":"Food","txn_date":"2026-04-10","confidence":0.95}',
    }


@pytest.mark.asyncio
async def test_classify_email_always_calls_llm():
    """LLM is called for every email — no rule/ML bypass."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()) as mock_llm:
        result = await classify_email(
            email_id="test-id",
            sender="noreply@swiggy.in",
            sender_domain="swiggy.in",
            subject="Your Swiggy order",
            body_text="Rs.499 debited for your order",
        )
    mock_llm.assert_called_once()
    assert result.label == Label.expense
    assert result.classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_classify_email_returns_correct_fields():
    """Result fields map correctly from LLM output."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result(
                   amount=1200.0, merchant="Netflix", category="Entertainment",
                   txn_date="2026-04-15", confidence=0.92)):
        result = await classify_email(
            email_id="e1",
            sender="info@netflix.com",
            sender_domain="netflix.com",
            subject="Your Netflix subscription",
            body_text="Rs.1200 charged",
        )
    assert result.amount == 1200.0
    assert result.category == "Entertainment"
    assert result.confidence == 0.92


@pytest.mark.asyncio
async def test_classify_email_high_confidence_is_auto():
    """confidence >= AUTO_CONFIRM_THRESHOLD → status=auto."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result(confidence=0.95)):
        result = await classify_email(
            email_id="e2", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit alert", body_text="Rs.500 debited",
        )
    assert result.status == TransactionStatus.auto


@pytest.mark.asyncio
async def test_classify_email_low_confidence_is_needs_review():
    """confidence below threshold → status=needs_review."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result(confidence=0.5)):
        result = await classify_email(
            email_id="e3", sender="s@unknown.com", sender_domain="unknown.com",
            subject="Something", body_text="Some body",
        )
    assert result.status == TransactionStatus.needs_review


@pytest.mark.asyncio
async def test_classify_email_llm_failure_returns_ignore_no_exception():
    """All LLM providers fail → returns ignore/needs_review, does NOT raise."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, side_effect=RuntimeError("No providers")):
        result = await classify_email(
            email_id="e4", sender="s@x.com", sender_domain="x.com",
            subject="Hi", body_text="Hello",
        )
    assert result.label == Label.ignore
    assert result.confidence == 0.0
    assert result.status == TransactionStatus.needs_review
    assert result.classifier_method == ClassifierMethod.llm


@pytest.mark.asyncio
async def test_classify_email_writes_log_when_session_provided():
    """When a session is passed, a ClassificationLog row is added."""
    mock_session = MagicMock()
    mock_session.add = MagicMock()

    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()):
        await classify_email(
            email_id="e5", sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.100 debited",
            session=mock_session,
        )
    mock_session.add.assert_called_once()
    log_row = mock_session.add.call_args[0][0]
    from app.models import ClassificationLog
    assert isinstance(log_row, ClassificationLog)
    assert log_row.email_id == "e5"
    assert log_row.provider == "google"
    assert log_row.llm_label == "expense"


@pytest.mark.asyncio
async def test_classify_email_no_session_does_not_crash():
    """session=None (default) → no log write, no crash."""
    with patch("app.classifier.classifier.llm_client.classify_verbose",
               new_callable=AsyncMock, return_value=_mock_verbose_result()):
        result = await classify_email(
            email_id=None, sender="s@bank.com", sender_domain="bank.com",
            subject="Debit", body_text="Rs.100 debited",
        )
    assert result.label == Label.expense
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -m pytest tests/test_classifier.py -v 2>&1 | head -40
```

Expected: multiple failures — `classify_email` still has old signature.

- [ ] **Step 3: Rewrite `app/classifier/classifier.py`** — replace the entire file:

```python
import time
import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Label, TransactionStatus, ClassifierMethod, ClassificationLog
from app.classifier.llm_client import llm_client
from app.classifier.merchant import normalize_merchant
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    label: Label
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    txn_date: Optional[date]
    confidence: float
    status: TransactionStatus
    classifier_method: ClassifierMethod


def _parse_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


async def classify_email(
    email_id: Optional[str],
    sender: str,
    sender_domain: str,
    subject: str,
    body_text: str,
    session: Optional[AsyncSession] = None,
) -> ClassificationResult:
    t0 = time.monotonic()
    provider = "none"
    model_name = "none"
    raw_response = ""
    llm_result = None

    try:
        verbose = await llm_client.classify_verbose(sender, subject, body_text[:3000])
        llm_result = verbose["result"]
        provider = verbose["provider"]
        model_name = verbose["model"]
        raw_response = verbose["raw_response"]
    except Exception as exc:
        logger.error("LLM classification failed for email %s: %s", email_id, exc)
        from app.alerts import add_alert
        add_alert("error", f"LLM classification failed: {exc}", source="classifier")

    latency_ms = round((time.monotonic() - t0) * 1000)

    if llm_result:
        raw_merchant = llm_result.merchant
        merchant, _ = normalize_merchant(raw_merchant) if raw_merchant else (None, 0.0)
        label = Label(llm_result.label)
        amount = llm_result.amount
        category = llm_result.category
        confidence = llm_result.confidence
        txn_date = _parse_date(llm_result.txn_date)
    else:
        raw_merchant = None
        merchant = None
        label = Label.ignore
        amount = None
        category = None
        confidence = 0.0
        txn_date = None

    status = (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )

    if session is not None:
        try:
            session.add(ClassificationLog(
                email_id=email_id,
                sender_domain=sender_domain,
                subject=subject,
                body_snippet=body_text[:3000],
                provider=provider,
                model=model_name,
                latency_ms=latency_ms,
                llm_label=llm_result.label if llm_result else None,
                llm_amount=llm_result.amount if llm_result else None,
                llm_merchant=raw_merchant,
                llm_category=llm_result.category if llm_result else None,
                llm_confidence=llm_result.confidence if llm_result else None,
                llm_txn_date=_parse_date(llm_result.txn_date) if llm_result else None,
                raw_response=raw_response,
            ))
        except Exception as log_exc:
            logger.warning("Failed to write classification log: %s", log_exc)

    return ClassificationResult(
        label=label,
        amount=amount,
        merchant=merchant,
        category=category,
        txn_date=txn_date,
        confidence=confidence,
        status=status,
        classifier_method=ClassifierMethod.llm,
    )
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -m pytest tests/test_classifier.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/classifier/classifier.py tests/test_classifier.py
git commit -m "feat: LLM-first classifier — always calls LLM, logs to classification_log"
```

---

## Task 4: Update sync.py

**Files:**
- Modify: `app/sync.py`

- [ ] **Step 1: Remove dead imports** — in `app/sync.py`, remove these two lines:

```python
# DELETE these lines:
from app.classifier.text_utils import clean_body
```

Also remove `SenderRule` from the models import line and remove `Label` if only used by `_load_db_rules`. Check the import line — keep only what's still needed: `Email, Transaction, SyncState`.

- [ ] **Step 2: Delete `_load_db_rules`** — remove the entire function (lines ~64-66):

```python
# DELETE this entire function:
async def _load_db_rules(session: AsyncSession) -> dict:
    result = await session.execute(select(SenderRule))
    return {r.sender_domain: (Label(r.label), r.category) for r in result.scalars().all()}
```

- [ ] **Step 3: Update `_run_sync_inner`** — find the Phase 2/3 section and make these changes:

**Remove** the `db_rules` load line:
```python
# DELETE:
db_rules = await _load_db_rules(session)
```

**Update** `_classify_one` to use the new `classify_email` signature:
```python
async def _classify_one(email: Email, msg: dict) -> ClassificationResult:
    nonlocal done_counter
    async with sem:
        result = await classify_email(
            email_id=email.id,
            sender=msg["sender"],
            sender_domain=msg["sender_domain"],
            subject=msg["subject"] or "",
            body_text=msg.get("body_text") or msg.get("body_snippet") or "",
            session=session,
        )
    done_counter += 1
    _sync_progress["current"] = skipped + done_counter
    _add_preview(msg, result.label.value, result.category, result.amount)
    return result
```

- [ ] **Step 4: Verify sync.py imports compile**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -c "from app.sync import run_sync; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add app/sync.py
git commit -m "fix: sync.py — use new classify_email signature, remove db_rules+clean_body"
```

---

## Task 5: Fix API callers

**Files:**
- Modify: `app/api/emails.py`
- Modify: `app/api/review.py`
- Modify: `app/api/transactions.py`
- Modify: `app/api/sync.py`
- Modify: `app/main.py`

- [ ] **Step 1: Fix `app/api/emails.py`**

Replace the import block at the top:
```python
# REMOVE these imports:
from app.classifier.classifier import classify_email, trace_classification_pipeline
from app.classifier.feature_classifier import train_from_feedback
from app.classifier.rules import diagnose_email
from app.classifier.text_utils import clean_body

# REPLACE WITH:
from app.classifier.classifier import classify_email
```

Replace the `_body()` helper:
```python
def _body(email: Email) -> str:
    return email.body_text or email.body_snippet or ""
```

Find the `classify_email(...)` call in `reclassify_emails` (around line 341) and update it to the new signature. It will look something like:
```python
result = await classify_email(
    email_id=email.id,
    sender=email.sender or "",
    sender_domain=email.sender_domain or "",
    subject=email.subject or "",
    body_text=_body(email),
    session=db,
)
```

Remove any `train_from_feedback(...)` calls in the same file. Remove any `diagnose_email(...)` calls and their associated endpoints if they exist.

- [ ] **Step 2: Fix `app/api/review.py`**

Remove these imports:
```python
# REMOVE:
from app.classifier.feature_classifier import train_from_feedback
from app.classifier.rules import diagnose_email  # if present
```

Remove `SenderRule` import and the `db_rules` loading block in both `reprocess_transaction` and `_bulk_reprocess_task`.

Update both `classify_email(...)` calls to new signature:

In `reprocess_transaction` (around line 96):
```python
result = await classify_email(
    email_id=e.id,
    sender=e.sender or "",
    sender_domain=e.sender_domain or "",
    subject=e.subject or "",
    body_text=e.body_text or e.body_snippet or "",
    session=db,
)
```

In `_bulk_reprocess_task` (around line 194):
```python
result = await classify_email(
    email_id=e.id,
    sender=e.sender or "",
    sender_domain=e.sender_domain or "",
    subject=e.subject or "",
    body_text=e.body_text or e.body_snippet or "",
    session=session,
)
```

Remove any `train_from_feedback(...)` calls.

- [ ] **Step 3: Fix `app/api/transactions.py`**

Remove:
```python
# REMOVE:
from app.classifier.feature_classifier import train_from_feedback
```

Remove any calls to `train_from_feedback(...)` in the file body.

- [ ] **Step 4: Fix `app/api/sync.py`**

Remove:
```python
# REMOVE:
from app.classifier.feature_classifier import get_model_status
```

Remove the `ml_status` endpoint function that calls `get_model_status()`. It typically looks like:
```python
# REMOVE this endpoint:
@router.get("/sync/ml-status")
async def ml_status():
    return get_model_status()
```

- [ ] **Step 5: Fix `app/main.py`**

Remove the startup `bootstrap_model_from_db` call. Find the `lifespan` function and remove:
```python
# REMOVE these lines from lifespan():
from app.classifier.feature_classifier import bootstrap_model_from_db
await bootstrap_model_from_db(...)  # or however it's called
```

- [ ] **Step 6: Verify all API modules import cleanly**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -c "
from app.api.emails import router
from app.api.review import router
from app.api.transactions import router
from app.api.sync import router
from app.main import app
print('All imports OK')
"
```

Expected: `All imports OK`

- [ ] **Step 7: Commit**

```bash
git add app/api/emails.py app/api/review.py app/api/transactions.py app/api/sync.py app/main.py
git commit -m "fix: remove dead classifier imports from all API modules"
```

---

## Task 6: Delete dead classifier files

**Files:**
- Delete: `app/classifier/rules.py`
- Delete: `app/classifier/feature_classifier.py`
- Delete: `app/classifier/merchant_intelligence.py`
- Delete: `app/classifier/learning.py`
- Delete: `app/classifier/pattern_gen.py`
- Delete: `app/classifier/text_utils.py`
- Delete: `tests/test_feature_classifier.py`

- [ ] **Step 1: Delete the files**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && \
  rm app/classifier/rules.py \
     app/classifier/feature_classifier.py \
     app/classifier/merchant_intelligence.py \
     app/classifier/learning.py \
     app/classifier/pattern_gen.py \
     app/classifier/text_utils.py \
     tests/test_feature_classifier.py
```

- [ ] **Step 2: Verify no remaining imports of deleted modules**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && \
  grep -r "from app.classifier.rules\|from app.classifier.feature_classifier\|from app.classifier.merchant_intelligence\|from app.classifier.learning\|from app.classifier.pattern_gen\|from app.classifier.text_utils" --include="*.py" .
```

Expected: no output (zero matches).

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: `tests/test_classifier.py` passes. Any pre-existing failures in other test files are acceptable as long as no new failures are introduced by this change.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete rule engine, ML classifier, and dead classifier modules"
```

---

## Task 7: Final verification

- [ ] **Step 1: Import the full app**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -c "from app.main import app; print('App loads OK')"
```

Expected: `App loads OK`

- [ ] **Step 2: Run classifier tests one final time**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && python -m pytest tests/test_classifier.py -v
```

Expected: 7 tests, all PASS.

- [ ] **Step 3: Confirm classification_log migration is applied**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker && alembic current
```

Expected: `0009 (head)`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: LLM-first classifier pipeline complete

- classify_email() always calls LLM via classify_verbose()
- classification_log table records every LLM call for future rule mining
- deleted rules.py, feature_classifier.py, merchant_intelligence.py,
  learning.py, pattern_gen.py, text_utils.py
- sync.py, review.py, emails.py, transactions.py updated to new signature

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
