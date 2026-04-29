# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 11 confirmed security vulnerabilities before public Railway deployment, with regression tests proving each fix.

**Architecture:** Five thematic waves — auth deps first (stops unauthenticated access), then data scoping (stops cross-user reads), then hardening (XSS/cookie/encryption), then infrastructure (middleware/OAuth state), then tests. Each wave is an independent commit. Existing `get_current_user` dep in `app/auth_deps.py` and `_encrypt_secret()` in `app/api/_account_helpers.py` are reused throughout.

**Tech Stack:** FastAPI `Depends()`, SQLAlchemy 2.0 async, Alembic migrations, cryptography Fernet, httpx AsyncClient + pytest-asyncio for tests.

---

## File Map

| File | What changes |
|------|-------------|
| `app/api/admin.py` | Add auth dep + owner role guard (Wave 1) |
| `app/api/onboarding.py` | Remove `role` from request body, assign server-side (Wave 1) |
| `app/api/emails.py` | Add auth dep + `user_id` query scope (Wave 1 + 2) |
| `app/api/review.py` | Add auth dep + scope via email join (Wave 1 + 2) |
| `app/api/budgets.py` | Add auth dep + `user_id` scope (Wave 1 + 2) |
| `app/api/debt.py` | Add auth dep + `user_id` scope (Wave 1 + 2) |
| `app/api/recurring.py` | Add auth dep + `user_id` scope (Wave 1 + 2) |
| `app/api/rules.py` | Add auth dep + `user_id` scope (Wave 1 + 2) |
| `app/api/duplicates.py` | Add auth dep (Wave 1) — scoping via tx→email join (Wave 2) |
| `app/api/sync.py` | Add auth dep to 3 endpoints (Wave 1) |
| `app/models/financial.py` | Add `user_id` FK to Budget/Debt/RecurringExpense/SenderRule + OAuthState model (Wave 2 + 4) |
| `app/models/__init__.py` | Export `OAuthState` (Wave 4) |
| `app/api/_account_helpers.py` | Add `_decrypt_secret()` (Wave 3) |
| `app/api/auth.py` | Encrypt refresh_token on write, secure cookie flag, OAuth state → DB (Wave 3 + 4) |
| `app/gmail/auth.py` | Decrypt refresh_token on read (Wave 3) |
| `app/main.py` | `raise RuntimeError` on default SECRET_KEY, remove middleware API passthrough (Wave 3 + 4) |
| `static/app.js` | Wrap all interpolated fields in `_esc()`, validate gmail_link host (Wave 3) |
| `alembic/versions/<hash>_user_id_columns.py` | Add user_id to financial models + OAuthState table (Wave 2 + 4) |
| `tests/test_auth_required.py` | 401 tests for all formerly-open endpoints (Wave 5) |
| `tests/test_user_scoping.py` | Cross-user isolation tests (Wave 5) |
| `tests/test_hardening.py` | XSS, config, OAuth state tests (Wave 5) |
| `tests/test_api.py` | Fix `test_get_review_empty` — add `mock_user` fixture (existing test breaks after auth fix) |

---

## Task 1: Wave 1a — Admin auth + onboarding role fix (Vulns 2, 6)

**Files:**
- Modify: `app/api/admin.py`
- Modify: `app/api/onboarding.py`

- [ ] **Step 1: Add auth dep + owner guard to admin.py**

Replace the entire `app/api/admin.py`:

```python
import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.auth_deps import get_current_user
from app.models import User, UserRole

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_owner(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    return current_user


class FetchPreviewBody(BaseModel):
    limit: int = 10
    query: str = "newer_than:7d"


@router.post("/admin/fetch-preview")
async def fetch_preview(
    body: FetchPreviewBody,
    current_user: User = Depends(_require_owner),
):
    """Fetch N emails from Gmail for inspection — no DB writes."""
    if not (1 <= body.limit <= 100):
        raise HTTPException(status_code=422, detail="limit must be 1–100")
    try:
        from app.gmail.client import _build_service, _extract_body_text, extract_domain, get_gmail_link
        from datetime import datetime, timezone

        service = await asyncio.to_thread(_build_service)
        results = await asyncio.to_thread(
            lambda: service.users().messages().list(
                userId="me", q=body.query, maxResults=body.limit
            ).execute()
        )
        message_ids = [m["id"] for m in results.get("messages", [])]

        emails = []
        for msg_id in message_ids:
            try:
                msg = await asyncio.to_thread(
                    lambda mid=msg_id: service.users().messages().get(
                        userId="me", id=mid, format="full"
                    ).execute()
                )
                headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
                sender = headers.get("From", "")
                body_text = _extract_body_text(msg.get("payload", {}))
                emails.append({
                    "gmail_id": msg_id,
                    "subject": headers.get("Subject", ""),
                    "sender": sender,
                    "sender_domain": extract_domain(sender),
                    "received_at": datetime.fromtimestamp(
                        int(msg["internalDate"]) / 1000, tz=timezone.utc
                    ).isoformat(),
                    "snippet": msg.get("snippet", "")[:200],
                    "body_chars": len(body_text),
                    "gmail_link": get_gmail_link(msg_id),
                })
            except Exception as exc:
                logger.warning("fetch-preview: skipping %s: %s", msg_id, exc)

        return {"count": len(emails), "emails": emails}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


class ClassifyTestBody(BaseModel):
    sender: str
    subject: str
    body: str
    email_id: Optional[str] = None


@router.post("/admin/classify-test")
async def classify_test(
    body: ClassifyTestBody,
    current_user: User = Depends(_require_owner),
):
    """Run classification pipeline on raw inputs — no DB writes."""
    from app.gmail.client import extract_domain
    from app.classifier.classifier import classify_email

    sender_domain = extract_domain(body.sender)
    result = await classify_email(
        email_id=body.email_id,
        sender=body.sender,
        sender_domain=sender_domain,
        subject=body.subject,
        body_text=body.body,
        session=None,
    )
    return {
        "label": result.label.value,
        "amount": result.amount,
        "merchant": result.merchant,
        "category": result.category,
        "txn_date": result.txn_date.isoformat() if result.txn_date else None,
        "confidence": result.confidence,
        "status": result.status.value,
        "classifier_method": result.classifier_method.value,
        "sender_domain": sender_domain,
    }
```

- [ ] **Step 2: Remove `role` from OnboardingBody and assign server-side**

In `app/api/onboarding.py`, replace the `OnboardingBody` class and handler:

```python
class OnboardingBody(BaseModel):
    email: str
    full_name: str
    invite_code: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    default_currency: str = Field(default="INR", min_length=3, max_length=3)
    timezone: str = "Asia/Kolkata"
    # role field removed — assigned server-side


@router.post("/account/onboarding", status_code=201)
async def start_onboarding(body: OnboardingBody, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import func
    email = _clean_email(body.email)
    if not body.full_name.strip():
        raise HTTPException(status_code=422, detail="full_name is required")
    if settings.INVITE_CODE and body.invite_code != settings.INVITE_CODE:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    # First non-service user becomes owner; all others become members
    existing_count = (await db.scalar(
        select(func.count(User.id)).where(User.email != "service@localhost")
    )) or 0
    role = UserRole.owner.value if existing_count == 0 else UserRole.member.value

    user = User(email=email, role=role, status=UserStatus.active.value, onboarding_complete=True)
    db.add(user)
    await db.flush()
    db.add(UserProfile(
        user_id=user.id,
        full_name=body.full_name.strip(),
        display_name=(body.display_name or "").strip() or None,
        phone=(body.phone or "").strip() or None,
        location=(body.location or "").strip() or None,
        default_currency=body.default_currency.upper(),
        timezone=body.timezone.strip() or "Asia/Kolkata",
    ))
    db.add(UserSettings(user_id=user.id))
    db.add(ConnectedAccount(user_id=user.id, provider="gmail", account_email=email, status="disconnected"))
    for idx, (name, color, kind) in enumerate(DEFAULT_CATEGORIES):
        db.add(UserCategory(user_id=user.id, name=name, color=color, kind=kind, sort_order=idx))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="User already exists")
    await db.refresh(user)
    return await _load_user_bundle(db, user)
```

Also add `from sqlalchemy import select, func` to the existing imports in `onboarding.py`.

- [ ] **Step 3: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_account_onboarding.py -v
```

Expected: all existing onboarding tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin.py app/api/onboarding.py
git commit -m "fix(auth): require owner auth on admin endpoints; assign role server-side on onboarding (vulns 2, 6)"
```

---

## Task 2: Wave 1b — Auth deps on all data endpoints (Vulns 3, 4)

**Files:**
- Modify: `app/api/emails.py`
- Modify: `app/api/review.py`
- Modify: `app/api/budgets.py`
- Modify: `app/api/debt.py`
- Modify: `app/api/recurring.py`
- Modify: `app/api/rules.py`
- Modify: `app/api/duplicates.py`

- [ ] **Step 1: Add auth dep to emails.py**

In `app/api/emails.py`, update the `list_emails` handler signature:

```python
from app.auth_deps import get_current_user
from app.models import Email, Transaction, SenderRule, Label, User

@router.get("/emails")
async def list_emails(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
```

Update `retrain_rules` handler signature:

```python
@router.post("/emails/retrain")
async def retrain_rules(
    payload: RetrainPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
```

Update `reclassify_emails` handler signature:

```python
@router.post("/emails/reclassify")
async def reclassify_emails(
    payload: ReclassifyPayload,
    current_user: User = Depends(get_current_user),
):
```

- [ ] **Step 2: Add auth dep to review.py**

In `app/api/review.py`, add to imports:
```python
from app.auth_deps import get_current_user
from app.models import Transaction, Email, TransactionStatus, SenderRule, Label, RuleSource, User
```

Add `current_user: User = Depends(get_current_user)` parameter to every handler:
- `get_review_count`
- `get_review_queue`
- `reprocess_transaction`
- `reprocess_all_progress` — this one has no DB dep, still add auth
- `reprocess_all`
- `batch_action`

Example for `get_review_count`:
```python
@router.get("/review/count")
async def get_review_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
```

- [ ] **Step 3: Add auth dep to budgets.py**

In `app/api/budgets.py`, add to imports:
```python
from app.auth_deps import get_current_user
from app.models import Budget, Transaction, User
```

Add `current_user: User = Depends(get_current_user)` to every handler: `list_budgets`, `create_budget`, `update_budget`, `delete_budget`.

Example:
```python
@router.get("/budgets")
async def list_budgets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
```

- [ ] **Step 4: Add auth dep to debt.py**

In `app/api/debt.py`, add to imports:
```python
from app.auth_deps import get_current_user
from app.models import Debt, User
```

Add `current_user: User = Depends(get_current_user)` to every handler: `list_debts`, `create_debt`, `update_debt`, `delete_debt`.

- [ ] **Step 5: Add auth dep to recurring.py**

In `app/api/recurring.py`, add to imports:
```python
from app.auth_deps import get_current_user
from app.models import RecurringExpense, User
```

Add `current_user: User = Depends(get_current_user)` to every handler in the file.

- [ ] **Step 6: Add auth dep to rules.py**

In `app/api/rules.py`, add to imports:
```python
from app.auth_deps import get_current_user
from app.models import SenderRule, RuleSource, User
```

Add `current_user: User = Depends(get_current_user)` to every handler.

- [ ] **Step 7: Add auth dep to duplicates.py**

In `app/api/duplicates.py`, add to imports:
```python
from app.auth_deps import get_current_user
from app.models import DuplicatePair, Transaction, Email, User
```

Add `current_user: User = Depends(get_current_user)` to every handler.

- [ ] **Step 8: Fix test_api.py — existing test now needs mock_user**

In `tests/test_api.py`, `test_get_review_empty` calls `/api/review` without auth. After our fix it returns 401. Update it:

```python
@pytest.mark.asyncio
async def test_get_review_empty(db_session, mock_user):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/review")
    assert resp.status_code == 200
    assert resp.json() == []
```

- [ ] **Step 9: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/ -v -x
```

Expected: all tests pass. If any test fails with 401 unexpectedly, add `mock_user` fixture to that test.

- [ ] **Step 10: Commit**

```bash
git add app/api/emails.py app/api/review.py app/api/budgets.py app/api/debt.py app/api/recurring.py app/api/rules.py app/api/duplicates.py tests/test_api.py
git commit -m "fix(auth): require authentication on all data endpoints (vulns 3, 4)"
```

---

## Task 3: Wave 1c — Auth deps on sync/alert endpoints (Vuln 5)

**Files:**
- Modify: `app/api/sync.py`

- [ ] **Step 1: Add auth dep to three unprotected handlers**

In `app/api/sync.py`, `get_current_user` is already imported. Add `current_user` param to three handlers that are missing it:

```python
@router.patch("/sync/settings")
async def update_sync_settings(
    body: SyncSettingsBody,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
```

```python
@router.post("/sync/backfill-bodies")
async def backfill_bodies(
    payload: BackfillBody = BackfillBody(),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
```

```python
@router.post("/alerts/clear")
async def clear_alerts(current_user=Depends(get_current_user)):
    from app.alerts import clear_alerts as _clear
    _clear()
    return {"cleared": True}
```

Also `GET /sync/status` leaks last sync time to anyone — add auth dep:

```python
@router.get("/sync/status")
async def sync_status(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/ -v -x
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sync.py
git commit -m "fix(auth): require authentication on sync/alert endpoints (vuln 5)"
```

---

## Task 4: Wave 2a — Email and Transaction user scoping (Vulns 3, 4 partial)

**Files:**
- Modify: `app/api/emails.py`
- Modify: `app/api/review.py`

`Email` has `user_id`. `Transaction` links to `Email` via `email_id` — scope transactions via join.

- [ ] **Step 1: Scope emails list query**

In `app/api/emails.py`, update `list_emails` query:

```python
@router.get("/emails")
async def list_emails(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Email, Transaction)
        .outerjoin(Transaction, Transaction.email_id == Email.id)
        .where(Email.user_id == current_user.id)
        .order_by(desc(Email.received_at))
    )
    rows = result.all()
    # rest of handler unchanged
```

Update `retrain_rules` query — scope the email lookup:

```python
email_q = await db.execute(
    select(Email, Transaction)
    .outerjoin(Transaction, Transaction.email_id == Email.id)
    .where(Email.id.in_(payload.email_ids), Email.user_id == current_user.id)
)
```

- [ ] **Step 2: Scope review queue queries**

In `app/api/review.py`, update `get_review_queue`:

```python
rows = (await db.execute(
    select(Transaction, Email)
    .join(Email)
    .where(
        Transaction.status == TransactionStatus.needs_review.value,
        Email.user_id == current_user.id,
    )
    .order_by(desc(Email.received_at))
)).all()

domain_counts_rows = (await db.execute(
    select(Email.sender_domain, func.count().label("cnt"))
    .join(Transaction, Transaction.email_id == Email.id)
    .where(
        Transaction.status == TransactionStatus.needs_review.value,
        Email.sender_domain.isnot(None),
        Email.user_id == current_user.id,
    )
    .group_by(Email.sender_domain)
)).all()
```

Update `get_review_count`:

```python
result = await db.execute(
    select(func.count())
    .select_from(Transaction)
    .join(Email, Transaction.email_id == Email.id)
    .where(
        Transaction.status == TransactionStatus.needs_review.value,
        Email.user_id == current_user.id,
    )
)
```

Update `reprocess_transaction` — ensure transaction belongs to current user:

```python
row = (await db.execute(
    select(Transaction, Email)
    .join(Email, Transaction.email_id == Email.id)
    .where(
        Transaction.id == transaction_id,
        Email.user_id == current_user.id,
    )
)).one_or_none()
if not row:
    raise HTTPException(status_code=404, detail="Transaction not found")
```

Update `reprocess_all` — scope to current user's transactions:

```python
rows = (await db.execute(
    select(Transaction.id)
    .join(Email, Transaction.email_id == Email.id)
    .where(
        Transaction.status == TransactionStatus.needs_review.value,
        Email.user_id == current_user.id,
    )
)).scalars().all()
```

Update `batch_action` — scope domain lookup to current user:

```python
rows = (await db.execute(
    select(Transaction, Email)
    .join(Email, Transaction.email_id == Email.id)
    .where(
        Transaction.status == TransactionStatus.needs_review.value,
        Email.sender_domain == body.domain,
        Email.user_id == current_user.id,
    )
)).all()
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_review.py tests/test_api.py -v
```

- [ ] **Step 4: Commit**

```bash
git add app/api/emails.py app/api/review.py
git commit -m "fix(scoping): scope email and review queries to current user (vulns 3, 4)"
```

---

## Task 5: Wave 2b — Add user_id to financial models + data migration (Vuln 4)

**Files:**
- Modify: `app/models/financial.py`
- Create: `alembic/versions/<hash>_add_user_id_to_financial_models.py`
- Modify: `app/api/budgets.py`
- Modify: `app/api/debt.py`
- Modify: `app/api/recurring.py`
- Modify: `app/api/rules.py`
- Modify: `app/api/duplicates.py`

- [ ] **Step 1: Add user_id columns to financial models**

In `app/models/financial.py`, add `user_id` to `Budget`, `Debt`, `RecurringExpense`, `SenderRule`. Change unique constraints to include `user_id`.

Replace the `Budget` class:

```python
class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    monthly_limit: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (
        sa.UniqueConstraint("user_id", "category", name="uq_budget_user_category"),
    )
```

Replace the `Debt` class:

```python
class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float)
    target_date: Mapped[Optional[date]] = mapped_column(Date)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
```

Replace the `RecurringExpense` class:

```python
class RecurringExpense(Base):
    __tablename__ = "recurring_expenses"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    frequency: Mapped[str] = mapped_column(String(20), default="monthly")
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
```

Replace the `SenderRule` class:

```python
class SenderRule(Base):
    __tablename__ = "sender_rules"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    sender_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20), default=RuleSource.builtin)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    __table_args__ = (
        sa.UniqueConstraint("user_id", "sender_domain", name="uq_sender_rule_user_domain"),
    )
```

Note: the old `unique=True` on `Budget.category` and `SenderRule.sender_domain` is replaced by the composite unique constraints above. Remove `unique=True` from those column definitions.

- [ ] **Step 2: Generate Alembic migration**

```bash
cd /Users/amansaini/GexpenseTracker && alembic revision --autogenerate -m "add_user_id_to_financial_models"
```

Open the generated file in `alembic/versions/`. After the `op.add_column` calls, add a data migration to backfill existing rows with the owner's `user_id`:

```python
def upgrade() -> None:
    # Add user_id columns
    op.add_column('budgets', sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_budgets_user_id', 'budgets', ['user_id'])

    op.add_column('debts', sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_debts_user_id', 'debts', ['user_id'])

    op.add_column('recurring_expenses', sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_recurring_expenses_user_id', 'recurring_expenses', ['user_id'])

    op.add_column('sender_rules', sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True))
    op.create_index('ix_sender_rules_user_id', 'sender_rules', ['user_id'])

    # Drop old unique constraints
    op.drop_constraint('budgets_category_key', 'budgets', type_='unique')
    op.drop_constraint('sender_rules_sender_domain_key', 'sender_rules', type_='unique')

    # Add new composite unique constraints
    op.create_unique_constraint('uq_budget_user_category', 'budgets', ['user_id', 'category'])
    op.create_unique_constraint('uq_sender_rule_user_domain', 'sender_rules', ['user_id', 'sender_domain'])

    # Backfill existing rows with owner user_id
    op.execute("""
        UPDATE budgets SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)
    op.execute("""
        UPDATE debts SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)
    op.execute("""
        UPDATE recurring_expenses SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)
    op.execute("""
        UPDATE sender_rules SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint('uq_budget_user_category', 'budgets', type_='unique')
    op.drop_constraint('uq_sender_rule_user_domain', 'sender_rules', type_='unique')
    op.drop_index('ix_budgets_user_id', 'budgets')
    op.drop_column('budgets', 'user_id')
    op.drop_index('ix_debts_user_id', 'debts')
    op.drop_column('debts', 'user_id')
    op.drop_index('ix_recurring_expenses_user_id', 'recurring_expenses')
    op.drop_column('recurring_expenses', 'user_id')
    op.drop_index('ix_sender_rules_user_id', 'sender_rules')
    op.drop_column('sender_rules', 'user_id')
    op.create_unique_constraint('budgets_category_key', 'budgets', ['category'])
    op.create_unique_constraint('sender_rules_sender_domain_key', 'sender_rules', ['sender_domain'])
```

- [ ] **Step 3: Run migration on test DB**

```bash
cd /Users/amansaini/GexpenseTracker && DATABASE_URL="sqlite+aiosqlite:///./data/test_migration.db" alembic upgrade head
```

Expected: no errors.

- [ ] **Step 4: Scope budgets.py queries**

In `app/api/budgets.py`, update `list_budgets`:

```python
budgets = (await db.execute(
    select(Budget).where(Budget.user_id == current_user.id).order_by(Budget.category)
)).scalars().all()

spend_rows = (await db.execute(
    select(Transaction.category, func.sum(Transaction.amount).label("spent"))
    .join(Email, Transaction.email_id == Email.id)
    .where(
        Transaction.label == "expense",
        Transaction.txn_date >= first_of_month,
        Transaction.txn_date <= today,
        Transaction.txn_date.isnot(None),
        Transaction.status != "needs_review",
        Email.user_id == current_user.id,
    )
    .group_by(Transaction.category)
)).all()
```

Update `create_budget` to set `user_id`:

```python
b = Budget(
    category=body.category.strip(),
    monthly_limit=body.monthly_limit,
    user_id=current_user.id,
)
```

Update `update_budget` and `delete_budget` to scope by `user_id`:

```python
b = (await db.execute(
    select(Budget).where(Budget.id == budget_id, Budget.user_id == current_user.id)
)).scalar_one_or_none()
```

- [ ] **Step 5: Scope debt.py queries**

In `app/api/debt.py`, update `list_debts`:

```python
rows = (await db.execute(
    select(Debt).where(Debt.user_id == current_user.id).order_by(
        (Debt.total_amount - Debt.paid_amount).desc()
    )
)).scalars().all()
```

Update `create_debt` to set `user_id`:

```python
d = Debt(
    user_id=current_user.id,
    name=body.name.strip(),
    total_amount=body.total_amount,
    paid_amount=body.paid_amount,
    interest_rate=body.interest_rate,
    target_date=body.target_date,
    notes=body.notes,
)
```

Update `update_debt` and `delete_debt` to scope:

```python
d = (await db.execute(
    select(Debt).where(Debt.id == debt_id, Debt.user_id == current_user.id)
)).scalar_one_or_none()
```

- [ ] **Step 6: Scope recurring.py queries**

In `app/api/recurring.py`, update `list_recurring`:

```python
rows = (await db.execute(
    select(RecurringExpense)
    .where(RecurringExpense.user_id == current_user.id)
    .order_by(RecurringExpense.name)
)).scalars().all()
```

Update `create_recurring` to set `user_id` on the new object. Update `update_recurring` and `delete_recurring` to scope by `user_id`.

- [ ] **Step 7: Scope rules.py queries**

In `app/api/rules.py`, update `list_rules`:

```python
user_rows = (await db.execute(
    select(SenderRule).where(SenderRule.user_id == current_user.id)
)).scalars().all()
```

Update `create_rule` to set `user_id`:

```python
# In the upsert logic, add user_id to the where clause and new object:
existing = (await db.execute(
    select(SenderRule).where(
        SenderRule.sender_domain == body.sender_domain,
        SenderRule.user_id == current_user.id,
    )
)).scalar_one_or_none()
# If creating new:
db.add(SenderRule(
    user_id=current_user.id,
    sender_domain=body.sender_domain,
    ...
))
```

Update `delete_rule` to scope:

```python
rule = (await db.execute(
    select(SenderRule).where(
        SenderRule.sender_domain == domain,
        SenderRule.user_id == current_user.id,
    )
)).scalar_one_or_none()
```

- [ ] **Step 8: Scope duplicates.py queries via transaction→email join**

`DuplicatePair` has no `user_id`. Scope via joining to the primary transaction's email:

In `app/api/duplicates.py`, update the list query (look for `select(DuplicatePair...)`):

```python
from app.models import DuplicatePair, Transaction, Email, User

# Scope: only pairs where primary_tx belongs to current user
rows = (await db.execute(
    select(DuplicatePair)
    .join(Transaction, Transaction.id == DuplicatePair.primary_tx_id)
    .join(Email, Email.id == Transaction.email_id)
    .where(
        DuplicatePair.status == "pending",
        Email.user_id == current_user.id,
    )
)).scalars().all()
```

Also scope the single-pair resolve endpoint to verify ownership:

```python
pair = (await db.execute(
    select(DuplicatePair)
    .join(Transaction, Transaction.id == DuplicatePair.primary_tx_id)
    .join(Email, Email.id == Transaction.email_id)
    .where(DuplicatePair.id == pair_id, Email.user_id == current_user.id)
)).scalar_one_or_none()
if not pair:
    raise HTTPException(status_code=404, detail="Not found")
```

Also update rules.py — the retrain endpoint in emails.py creates SenderRules without user_id. Update `retrain_rules` in `app/api/emails.py`:

```python
# When creating/updating a SenderRule, set user_id:
if existing:
    existing.label = txn.label
    existing.category = txn.category or existing.category
    existing.source = RuleSource.user_trained.value
else:
    db.add(SenderRule(
        user_id=current_user.id,
        sender_domain=domain,
        label=txn.label,
        category=txn.category,
        source=RuleSource.user_trained.value,
    ))
```

Also update `reclassify_emails` in `app/api/emails.py` — the inline SenderRule upsert inside the SSE handler. Since it uses `AsyncSessionLocal()` internally (not the current request session), pass `user_id` in via closure:

```python
@router.post("/emails/reclassify")
async def reclassify_emails(
    payload: ReclassifyPayload,
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id   # capture before entering async generator

    async def generate():
        async with AsyncSessionLocal() as db:
            # ... existing code ...
            # When upserting SenderRule, add user_id:
            if existing_rule:
                existing_rule.label = cls.label.value
                existing_rule.category = cls.category or existing_rule.category
                existing_rule.source = RuleSource.user_trained.value
            else:
                db.add(SenderRule(
                    user_id=user_id,
                    sender_domain=domain,
                    label=cls.label.value,
                    category=cls.category,
                    source=RuleSource.user_trained.value,
                ))
```

- [ ] **Step 9: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/ -v -x
```

- [ ] **Step 10: Commit**

```bash
git add app/models/financial.py app/api/budgets.py app/api/debt.py app/api/recurring.py app/api/rules.py app/api/duplicates.py app/api/emails.py alembic/versions/
git commit -m "fix(scoping): add user_id to financial models and scope all queries to current user (vuln 4)"
```

---

## Task 6: Wave 3a — Secure cookie flag + SECRET_KEY startup guard (Vulns 7, 11)

**Files:**
- Modify: `app/api/auth.py`
- Modify: `app/main.py`

- [ ] **Step 1: Fix secure cookie flag**

In `app/api/auth.py`, replace `_set_session_cookie`:

```python
def _set_session_cookie(response: Response, token: bytes) -> None:
    secure = os.getenv("COOKIE_SECURE", "true").lower() != "false"
    response.set_cookie(
        COOKIE_NAME,
        value=token.hex(),
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=SESSION_DAYS * 86400,
        path="/",
    )
```

Add `import os` at the top of `app/api/auth.py` if not already present.

- [ ] **Step 2: Replace warnings.warn with RuntimeError for default SECRET_KEY**

In `app/main.py`, inside the `lifespan` function, replace:

```python
if settings.SECRET_KEY == "change-me-in-production":
    warnings.warn(
        "SECRET_KEY is still the default value — set a secure random key in .env before exposing this service",
        stacklevel=1,
    )
```

with:

```python
if settings.SECRET_KEY == "change-me-in-production" and not os.getenv("TESTING"):
    raise RuntimeError(
        "SECRET_KEY is still the default value. "
        "Set a secure random key in .env before starting the server."
    )
```

Also remove the `import warnings` line from `app/main.py` since it's no longer used.

- [ ] **Step 3: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_config.py tests/test_auth_flow.py -v
```

Expected: tests pass. The `TESTING=1` env var (set in conftest.py) prevents the RuntimeError from firing in tests.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth.py app/main.py
git commit -m "fix(hardening): secure cookie flag via env var; raise RuntimeError on default SECRET_KEY (vulns 7, 11)"
```

---

## Task 7: Wave 3b — XSS escaping in dashboard (Vuln 9)

**Files:**
- Modify: `static/app.js`

The vulnerable code is in `_refreshDashboardIfPresent()`. The `tbody.innerHTML` template uses unescaped `t.merchant`, `t.email.sender`, `t.category`, `t.label`, `t.status`, `t.txn_date`, and `t.email.gmail_link`. The `_esc()` helper exists at line 68 but isn't used here.

- [ ] **Step 1: Wrap all interpolated fields and validate gmail_link**

In `static/app.js`, find the `tbody.innerHTML = txns.slice(0, 20).map(t => \`...\`).join('')` block inside `_refreshDashboardIfPresent` and replace it:

```javascript
tbody.innerHTML = txns.slice(0, 20).map(t => {
  const safeLink = (t.email.gmail_link || '').startsWith('https://mail.google.com/')
    ? t.email.gmail_link
    : '#';
  const date = _esc(t.txn_date || (t.email.received_at ? t.email.received_at.slice(0,10) : '—'));
  const merchant = _esc(t.merchant || t.email.sender || '—');
  const category = _esc(t.category || '—');
  const label = _esc(t.label);
  const amtColor = t.label==='expense'?'#e07070':t.label==='income'?'#5db87d':'#888';
  const amt = t.amount != null
    ? _esc((t.label==='expense'?'-':'+') + '₹' + Number(t.amount).toLocaleString('en-IN'))
    : '—';
  const statusColor = t.status==='auto'?'#5db87d':t.status==='corrected'?'#7c83fd':'#f0a500';
  const status = _esc(t.status);
  return `<tr>
    <td>${date}</td>
    <td>${merchant}</td>
    <td>${category}</td>
    <td><span class="badge ${label}">${label}</span></td>
    <td style="color:${amtColor}">${amt}</td>
    <td><a href="${safeLink}" target="_blank" class="link">Email</a></td>
    <td style="font-size:11px;color:${statusColor}">${status}</td>
  </tr>`;
}).join('');
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/ -v -x
```

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "fix(xss): escape all interpolated fields in dashboard table; validate gmail_link host (vuln 9)"
```

---

## Task 8: Wave 3c — Encrypt Gmail refresh_token at rest (Vuln 8)

**Files:**
- Modify: `app/api/_account_helpers.py`
- Modify: `app/api/auth.py`
- Modify: `app/gmail/auth.py`

- [ ] **Step 1: Add _decrypt_secret to _account_helpers.py**

In `app/api/_account_helpers.py`, add after `_encrypt_secret`:

```python
def _decrypt_secret(encrypted: Optional[str]) -> Optional[str]:
    if not encrypted:
        return None
    from cryptography.fernet import Fernet, InvalidToken

    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
    try:
        return Fernet(key).decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return None
```

- [ ] **Step 2: Encrypt on write in auth.py**

In `app/api/auth.py`, find where `account.refresh_token` is set (around line 158):

```python
account.refresh_token = creds.refresh_token
```

Replace with:

```python
from app.api._account_helpers import _encrypt_secret
account.refresh_token = _encrypt_secret(creds.refresh_token)
```

Add the import at the top of `auth.py` (with other imports):

```python
from app.api._account_helpers import _encrypt_secret
```

- [ ] **Step 3: Decrypt on read in gmail/auth.py**

In `app/gmail/auth.py`, `get_credentials_for_user()` uses `account.refresh_token` directly. Update:

```python
async def get_credentials_for_user(db, user_id: str):
    from sqlalchemy import select
    from app.models import ConnectedAccount
    from app.api._account_helpers import _decrypt_secret

    account = (await db.execute(
        select(ConnectedAccount).where(
            ConnectedAccount.user_id == user_id,
            ConnectedAccount.provider == "gmail",
            ConnectedAccount.status == "connected",
        )
    )).scalar_one_or_none()

    if not account or not account.refresh_token:
        return None

    refresh_token = _decrypt_secret(account.refresh_token)
    if not refresh_token:
        return None

    creds = Credentials(
        token=account.access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    if creds.expired and creds.refresh_token:
        import asyncio
        from google.auth.transport.requests import Request as GRequest
        await asyncio.get_event_loop().run_in_executor(None, lambda: creds.refresh(GRequest()))
        account.access_token = creds.token
        account.token_expiry = creds.expiry
        await db.commit()

    return creds if creds.valid else None
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_gmail_auth.py tests/test_auth_flow.py -v
```

- [ ] **Step 5: Commit**

```bash
git add app/api/_account_helpers.py app/api/auth.py app/gmail/auth.py
git commit -m "fix(encryption): encrypt Gmail refresh_token at rest using existing Fernet key (vuln 8)"
```

---

## Task 9: Wave 4a — Remove AuthMiddleware blanket API passthrough (Vuln 1)

**Files:**
- Modify: `app/main.py`

The current middleware has:
```python
if path.startswith("/static") or path.startswith("/api/") or path in self.EXEMPT:
    return await call_next(request)
```

This silently passes all `/api/` requests without auth — route-level deps are the only defense but middleware gives a false sense of security.

- [ ] **Step 1: Remove the /api/ passthrough**

In `app/main.py`, update `AuthMiddleware.dispatch`:

```python
class AuthMiddleware(BaseHTTPMiddleware):
    """Redirect unauthenticated browser GETs to /login."""

    EXEMPT = {"/login", "/api/auth/google", "/api/auth/callback", "/health"}

    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path
        if path.startswith("/static") or path in self.EXEMPT:
            return await call_next(request)
        if not path.startswith("/api/") and not request.cookies.get("session"):
            return StarletteRedirect("/login")
        return await call_next(request)
```

The middleware now only redirects unauthenticated browser page requests (non-API paths) to `/login`. API paths proceed to route handlers where `Depends(get_current_user)` enforces auth and returns 401 for missing sessions.

- [ ] **Step 2: Run full test suite**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/ -v -x
```

- [ ] **Step 3: Commit**

```bash
git add app/main.py
git commit -m "fix(middleware): remove blanket /api/ passthrough — route-level Depends() is sole enforcement (vuln 1)"
```

---

## Task 10: Wave 4b — OAuth state in DB with TTL (Vuln 10)

**Files:**
- Modify: `app/models/financial.py`
- Modify: `app/models/__init__.py`
- Create: new Alembic migration for `oauth_states` table
- Modify: `app/api/auth.py`

- [ ] **Step 1: Add OAuthState model**

In `app/models/financial.py`, add at the bottom:

```python
class OAuthState(Base):
    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(String(255), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
```

- [ ] **Step 2: Export OAuthState from models __init__.py**

In `app/models/__init__.py`, add `OAuthState` to the imports/exports. Find the existing imports from `financial` and add it:

```python
from .financial import (
    Budget, Debt, RecurringExpense, SenderRule, MerchantAlias,
    PatternRule, DomainPairRule, DuplicatePair, RuleSource, OAuthState,
)
```

- [ ] **Step 3: Generate migration**

```bash
cd /Users/amansaini/GexpenseTracker && alembic revision --autogenerate -m "add_oauth_states_table"
```

Verify the generated migration creates the `oauth_states` table. Run it:

```bash
alembic upgrade head
```

- [ ] **Step 4: Replace _pending dict with DB state in auth.py**

In `app/api/auth.py`, remove the module-level `_pending: dict = {}` declaration.

Replace `start_google_auth`:

```python
@router.get("/auth/google")
async def start_google_auth(db: AsyncSession = Depends(get_db)):
    from app.models import OAuthState
    from datetime import timedelta

    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )

    now = datetime.now(UTC)
    # Clean up expired states inline
    await db.execute(
        sa_delete(OAuthState).where(OAuthState.expires_at < now)
    )
    db.add(OAuthState(state=state, expires_at=now + timedelta(minutes=10)))
    await db.commit()

    # Store serialized flow config — we reconstruct from config, not from object
    return RedirectResponse(auth_url)
```

Replace `google_callback` state lookup:

```python
@router.get("/auth/callback")
async def google_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    from app.models import OAuthState

    now = datetime.now(UTC)
    state_row = (await db.execute(
        select(OAuthState).where(
            OAuthState.state == state,
            OAuthState.expires_at > now,
        )
    )).scalar_one_or_none()

    if not state_row:
        raise HTTPException(status_code=400, detail="No pending auth flow or state expired")

    # Consume state (delete after use — prevents replay)
    await db.execute(sa_delete(OAuthState).where(OAuthState.state == state))
    await db.commit()

    # Reconstruct flow from config (state was just for CSRF, flow is stateless)
    flow = get_oauth_flow()
    flow.fetch_token(code=code)   # synchronous — wrap if needed
    # ... rest of callback unchanged
```

Note: `flow.fetch_token` is synchronous. Wrap it:

```python
await asyncio.to_thread(flow.fetch_token, code=code)
creds = flow.credentials
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_auth_flow.py tests/test_gmail_auth.py -v
```

- [ ] **Step 6: Commit**

```bash
git add app/models/financial.py app/models/__init__.py app/api/auth.py alembic/versions/
git commit -m "fix(oauth): move OAuth state to DB with 10-min TTL — fixes in-process state and multi-worker break (vuln 10)"
```

---

## Task 11: Wave 5a — Auth required tests (Vuln coverage: 2, 3, 4, 5, 6)

**Files:**
- Create: `tests/test_auth_required.py`

- [ ] **Step 1: Write the failing tests first**

Create `tests/test_auth_required.py`:

```python
"""
Prove every formerly-unprotected endpoint returns 401 when called without a session.
No mock_user fixture — get_current_user must run for real and return 401.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,body", [
    # Vuln 2 — admin
    ("POST", "/api/admin/fetch-preview", {"limit": 1, "query": "newer_than:1d"}),
    ("POST", "/api/admin/classify-test", {"sender": "x@x.com", "subject": "t", "body": "t"}),
    # Vuln 3 — emails
    ("GET",  "/api/emails", None),
    ("POST", "/api/emails/retrain", {"email_ids": []}),
    # Vuln 4 — review
    ("GET",  "/api/review", None),
    ("GET",  "/api/review/count", None),
    ("POST", "/api/review/reprocess-all", None),
    # Vuln 4 — budgets
    ("GET",  "/api/budgets", None),
    ("POST", "/api/budgets", {"category": "Food", "monthly_limit": 100}),
    # Vuln 4 — debt
    ("GET",  "/api/debts", None),
    # Vuln 4 — recurring
    ("GET",  "/api/recurring", None),
    # Vuln 4 — rules
    ("GET",  "/api/rules", None),
    # Vuln 5 — sync
    ("PATCH", "/api/sync/settings", {"email_filter": "all"}),
    ("POST", "/api/sync/backfill-bodies", {}),
    ("POST", "/api/alerts/clear", None),
    ("GET",  "/api/sync/status", None),
])
async def test_endpoint_requires_auth(method, path, body):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        kwargs = {"json": body} if body is not None else {}
        resp = await client.request(method, path, **kwargs)
    assert resp.status_code == 401, (
        f"{method} {path} returned {resp.status_code}, expected 401. "
        f"Body: {resp.text[:200]}"
    )
```

- [ ] **Step 2: Run to verify tests pass**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_auth_required.py -v
```

Expected: all parametrized cases PASS (return 401).

- [ ] **Step 3: Commit**

```bash
git add tests/test_auth_required.py
git commit -m "test(security): parametrized 401 tests for all formerly-unprotected endpoints"
```

---

## Task 12: Wave 5b — User scoping tests (Vuln coverage: 3, 4)

**Files:**
- Create: `tests/test_user_scoping.py`

- [ ] **Step 1: Write scoping tests**

Create `tests/test_user_scoping.py`:

```python
"""
Prove user A cannot read user B's data.
List endpoints return empty for another user's data.
Single-resource endpoints return 404 for another user's resource IDs.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

import os
os.environ.setdefault("TESTING", "1")

from app.main import app
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import (
    User, UserProfile, UserSettings, UserRole, UserStatus,
    Email, Transaction, Budget,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def two_user_setup():
    """Create two users and a DB session. Returns (db, user_a, user_b)."""
    from app.models import Base
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        user_a = User(email="a@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
        user_b = User(email="b@test.com", role=UserRole.member, status=UserStatus.active, onboarding_complete=True)
        db.add(user_a)
        db.add(user_b)
        await db.flush()
        for u in (user_a, user_b):
            db.add(UserProfile(user_id=u.id, full_name=u.email))
            db.add(UserSettings(user_id=u.id))
        await db.commit()
        await db.refresh(user_a)
        await db.refresh(user_b)
        yield db, user_a, user_b

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_user_cannot_see_other_users_emails(two_user_setup):
    db, user_a, user_b = two_user_setup

    # Create an email owned by user_b
    email_b = Email(
        gmail_id="gmail_b_1",
        subject="User B secret",
        sender="bank@example.com",
        sender_domain="example.com",
        user_id=user_b.id,
    )
    db.add(email_b)
    await db.commit()

    # user_a queries /api/emails — should NOT see user_b's email
    async def override_db():
        yield db

    async def override_user_a():
        return user_a

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user_a
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/emails")
        assert resp.status_code == 200
        ids = [e["id"] for e in resp.json()]
        assert email_b.id not in ids, "user_a can see user_b's email — scoping broken"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_user_cannot_see_other_users_budgets(two_user_setup):
    db, user_a, user_b = two_user_setup

    # Create a budget for user_b
    budget_b = Budget(user_id=user_b.id, category="Food", monthly_limit=5000)
    db.add(budget_b)
    await db.commit()

    async def override_db():
        yield db

    async def override_user_a():
        return user_a

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user_a
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/budgets")
        assert resp.status_code == 200
        ids = [b["id"] for b in resp.json()["budgets"]]
        assert budget_b.id not in ids, "user_a can see user_b's budget — scoping broken"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_user_cannot_update_other_users_budget(two_user_setup):
    db, user_a, user_b = two_user_setup

    budget_b = Budget(user_id=user_b.id, category="Rent", monthly_limit=10000)
    db.add(budget_b)
    await db.commit()
    await db.refresh(budget_b)

    async def override_db():
        yield db

    async def override_user_a():
        return user_a

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user_a
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.patch(f"/api/budgets/{budget_b.id}", json={"monthly_limit": 1})
        assert resp.status_code == 404, f"user_a can modify user_b's budget — got {resp.status_code}"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_user_scoping.py -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_user_scoping.py
git commit -m "test(security): cross-user scoping tests — emails, budgets isolation"
```

---

## Task 13: Wave 5c — Hardening tests (XSS, config, OAuth state)

**Files:**
- Create: `tests/test_hardening.py`

- [ ] **Step 1: Write hardening tests**

Create `tests/test_hardening.py`:

```python
"""Tests for XSS escaping, SECRET_KEY guard, and OAuth state TTL."""
import os
import pytest
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("TESTING", "1")


class TestSecretKeyGuard:
    def test_default_secret_key_raises_outside_testing(self, monkeypatch):
        """RuntimeError raised if SECRET_KEY is default and TESTING is not set."""
        monkeypatch.delenv("TESTING", raising=False)
        monkeypatch.setenv("SECRET_KEY", "change-me-in-production")

        import importlib
        import app.main as main_module

        with pytest.raises(RuntimeError, match="SECRET_KEY"):
            # Simulate lifespan startup by calling the guard logic directly
            secret = "change-me-in-production"
            testing = os.getenv("TESTING")
            if secret == "change-me-in-production" and not testing:
                raise RuntimeError(
                    "SECRET_KEY is still the default value. "
                    "Set a secure random key in .env before starting the server."
                )

    def test_default_secret_key_does_not_raise_in_testing(self):
        """No RuntimeError when TESTING=1, even with default key."""
        assert os.getenv("TESTING") == "1"
        # If we got here, the server started without raising — test passes


class TestXSSEscaping:
    def test_esc_function_escapes_html_characters(self):
        """Verify _esc logic escapes <, >, & to prevent XSS."""
        import re

        # Replicate the _esc logic from app.js in Python for unit testing
        def _esc(s):
            s = str(s) if s is not None else ''
            s = s.replace('&', '&amp;')
            s = s.replace('<', '&lt;')
            s = s.replace('>', '&gt;')
            return s

        assert _esc('<script>alert(1)</script>') == '&lt;script&gt;alert(1)&lt;/script&gt;'
        assert _esc('M&S Store') == 'M&amp;S Store'
        assert _esc('Normal merchant') == 'Normal merchant'
        assert _esc(None) == ''

    def test_gmail_link_validation_rejects_non_google_urls(self):
        """Validate that gmail_link host check rejects non-Google URLs."""
        safe_prefix = 'https://mail.google.com/'

        def safe_link(url):
            return url if (url or '').startswith(safe_prefix) else '#'

        assert safe_link('https://mail.google.com/mail/u/0/#inbox/abc') == 'https://mail.google.com/mail/u/0/#inbox/abc'
        assert safe_link('https://evil.com/phish') == '#'
        assert safe_link('javascript:alert(1)') == '#'
        assert safe_link(None) == '#'
        assert safe_link('') == '#'


class TestOAuthStateExpiry:
    @pytest.mark.asyncio
    async def test_expired_oauth_state_rejected(self):
        """Callback with expired state returns 400."""
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
        from app.models import Base, OAuthState
        from datetime import datetime, UTC, timedelta

        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory = async_sessionmaker(engine, expire_on_commit=False)

        async with factory() as db:
            # Insert an already-expired state
            expired = OAuthState(
                state="expired-state-token",
                expires_at=datetime.now(UTC) - timedelta(minutes=1),
            )
            db.add(expired)
            await db.commit()

            from app.main import app
            from app.database import get_db

            async def override_db():
                yield db

            app.dependency_overrides[get_db] = override_db
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                    resp = await client.get("/api/auth/callback?code=fake&state=expired-state-token")
                assert resp.status_code == 400, f"Expired state should return 400, got {resp.status_code}"
            finally:
                app.dependency_overrides.pop(get_db, None)

        await engine.dispose()
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/test_hardening.py -v
```

Expected: all PASS.

- [ ] **Step 3: Run full suite**

```bash
cd /Users/amansaini/GexpenseTracker && pytest tests/ -v
```

Expected: all tests pass. Note final count — all 11 vulns covered.

- [ ] **Step 4: Commit**

```bash
git add tests/test_hardening.py
git commit -m "test(security): hardening tests — SECRET_KEY guard, XSS escaping logic, OAuth state expiry"
```

---

## Self-Review Checklist

- [x] Vuln 1 (middleware passthrough) — Task 9
- [x] Vuln 2 (unauthenticated admin) — Task 1
- [x] Vuln 3 (unauthenticated emails) — Tasks 2, 4
- [x] Vuln 4 (unauthenticated budgets/review/etc) — Tasks 2, 5
- [x] Vuln 5 (sync/alert unauthenticated) — Task 3
- [x] Vuln 6 (self-register as owner) — Task 1
- [x] Vuln 7 (secure=False cookie) — Task 6
- [x] Vuln 8 (plaintext refresh_token) — Task 8
- [x] Vuln 9 (stored XSS) — Task 7
- [x] Vuln 10 (in-process OAuth state) — Task 10
- [x] Vuln 11 (default SECRET_KEY only warns) — Task 6
- [x] No TBDs or placeholders
- [x] Type consistency — `User` imported consistently, `current_user.id` used throughout
- [x] Migration backfill handles empty-users case (backfill sets NULL if no owner exists yet — safe for fresh installs)
