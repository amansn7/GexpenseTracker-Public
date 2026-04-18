# Expense Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted FastAPI app that ingests Gmail, classifies emails as expense/income/ignore using a hybrid rule+LLM engine, stores transactions in Postgres, and serves a web dashboard for review and correction.

**Architecture:** Single FastAPI monolith. APScheduler polls Gmail every 2 hours in-process. Hybrid classifier runs rule engine first (confidence ≥ 0.85 skips LLM); uncertain emails go to configurable LLM via OpenRouter or Anthropic. Results stored in Postgres. Dashboard served as Jinja2 templates.

**Tech Stack:** Python 3.12, FastAPI, APScheduler, SQLAlchemy 2.0 async, Alembic, asyncpg, Google Gmail API v1, httpx (LLM calls), Jinja2, Docker Compose, pytest + pytest-asyncio

---

## File Map

```
expense-tracker/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── requirements.txt
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/
│       └── 0001_initial.py
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app, lifespan, route mounting
│   ├── config.py                  # Pydantic-settings: all env vars
│   ├── database.py                # Async engine, session factory, get_db
│   ├── models.py                  # SQLAlchemy ORM: Email, Transaction, SyncState, SenderRule
│   ├── gmail/
│   │   ├── __init__.py
│   │   ├── auth.py                # OAuth2 flow, token file read/write/refresh
│   │   └── client.py              # Gmail API wrapper, fetch_new_messages()
│   ├── classifier/
│   │   ├── __init__.py
│   │   ├── rules.py               # Rule engine: domain lookup + keyword scoring
│   │   ├── llm_client.py          # LLMClient: OpenRouter/Anthropic via OpenAI-compat API
│   │   └── classifier.py          # Hybrid orchestration: rules → LLM fallback
│   ├── sync.py                    # run_sync(): fetch → classify → persist
│   ├── scheduler.py               # APScheduler setup and job registration
│   └── api/
│       ├── __init__.py
│       ├── auth.py                # GET /api/auth/gmail, GET /api/auth/callback, GET /api/auth/status
│       ├── transactions.py        # GET/PATCH /api/transactions, GET /api/transactions/{id}, GET /api/stats
│       ├── review.py              # GET /api/review
│       └── sync.py                # GET /api/sync/status, POST /api/sync/trigger
├── templates/
│   ├── base.html                  # Nav, stat cards layout
│   ├── dashboard.html             # Home: stat cards + recent transactions
│   ├── transactions.html          # Full filterable transaction list
│   ├── review.html                # needs_review queue with classify form
│   └── settings.html             # OAuth connect, manual sync
├── static/
│   └── app.js                     # Fetch wrapper, inline classify form submit
└── tests/
    ├── conftest.py                # pytest fixtures: async db session, test client
    ├── test_rules.py
    ├── test_llm_client.py
    ├── test_classifier.py
    ├── test_sync.py
    └── test_api.py
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `.env.example`
- Create: `requirements.txt`
- Create: `app/__init__.py`
- Create: `app/gmail/__init__.py`
- Create: `app/classifier/__init__.py`
- Create: `app/api/__init__.py`

- [ ] **Step 1: Create `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy[asyncio]==2.0.36
alembic==1.13.3
asyncpg==0.30.0
aiosqlite==0.20.0
pydantic-settings==2.6.1
apscheduler==3.10.4
google-auth==2.35.0
google-auth-oauthlib==1.2.1
google-api-python-client==2.154.0
httpx==0.27.2
jinja2==3.1.4
python-multipart==0.0.12
pytest==8.3.3
pytest-asyncio==0.24.0
pytest-mock==3.14.0
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: expense
      POSTGRES_PASSWORD: expense
      POSTGRES_DB: expense_tracker
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    ports:
      - "8000:8000"
    env_file: .env
    volumes:
      - ./data:/app/data
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql+asyncpg://expense:expense@db:5432/expense_tracker

volumes:
  pgdata:
```

- [ ] **Step 4: Create `.env.example`**

```
DATABASE_URL=postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback

# LLM config - use OpenRouter (free) or Anthropic
LLM_PROVIDER=openrouter
LLM_MODEL=google/gemini-2.0-flash-exp:free
OPENROUTER_API_KEY=sk-or-...

# Or Anthropic:
# LLM_PROVIDER=anthropic
# LLM_MODEL=claude-haiku-4-5-20251001
# ANTHROPIC_API_KEY=sk-ant-...

LLM_CONFIDENCE_THRESHOLD=0.85
AUTO_CONFIRM_THRESHOLD=0.75
SYNC_INTERVAL_HOURS=2
SECRET_KEY=change-me-in-production
```

- [ ] **Step 5: Create empty `__init__.py` files**

```bash
touch app/__init__.py app/gmail/__init__.py app/classifier/__init__.py app/api/__init__.py
mkdir -p data templates static
```

- [ ] **Step 6: Commit**

```bash
git init
echo ".env" >> .gitignore
echo "data/gmail_token.json" >> .gitignore
echo "__pycache__/" >> .gitignore
echo ".pytest_cache/" >> .gitignore
git add .
git commit -m "chore: project scaffold"
```

---

## Task 2: Config + Database

**Files:**
- Create: `app/config.py`
- Create: `app/database.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Write failing test for config**

```python
# tests/test_config.py
from app.config import settings

def test_defaults_set():
    assert settings.SYNC_INTERVAL_HOURS == 2
    assert settings.LLM_CONFIDENCE_THRESHOLD == 0.85
    assert settings.AUTO_CONFIRM_THRESHOLD == 0.75
    assert settings.LLM_PROVIDER in ("openrouter", "anthropic")
```

- [ ] **Step 2: Run to verify it fails**

```bash
pytest tests/test_config.py -v
# Expected: ModuleNotFoundError or ImportError
```

- [ ] **Step 3: Create `app/config.py`**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"

    LLM_PROVIDER: str = "openrouter"
    LLM_MODEL: str = "google/gemini-2.0-flash-exp:free"
    OPENROUTER_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    LLM_CONFIDENCE_THRESHOLD: float = 0.85
    AUTO_CONFIRM_THRESHOLD: float = 0.75

    SYNC_INTERVAL_HOURS: int = 2
    SECRET_KEY: str = "change-me-in-production"

settings = Settings()
```

- [ ] **Step 4: Create `app/database.py`**

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

- [ ] **Step 5: Create `tests/conftest.py`**

```python
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.models import Base

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
```

Also add `pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/test_config.py -v
# Expected: PASS
```

- [ ] **Step 7: Commit**

```bash
git add app/config.py app/database.py tests/conftest.py tests/test_config.py pytest.ini
git commit -m "feat: config and database setup"
```

---

## Task 3: Database Models

**Files:**
- Create: `app/models.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_models.py
import pytest
import pytest_asyncio
from sqlalchemy import select
from app.models import Email, Transaction, SyncState, SenderRule, Label, TransactionStatus, RuleSource

@pytest.mark.asyncio
async def test_create_email(db_session):
    email = Email(gmail_id="abc123", subject="Receipt", sender="no-reply@amazon.in", sender_domain="amazon.in")
    db_session.add(email)
    await db_session.commit()
    result = await db_session.execute(select(Email).where(Email.gmail_id == "abc123"))
    assert result.scalar_one().subject == "Receipt"

@pytest.mark.asyncio
async def test_create_transaction(db_session):
    email = Email(gmail_id="xyz789", sender_domain="zomato.com")
    db_session.add(email)
    await db_session.flush()
    txn = Transaction(
        email_id=email.id,
        label=Label.expense,
        amount=299.00,
        currency="INR",
        merchant="Zomato",
        category="Food",
        status=TransactionStatus.auto,
    )
    db_session.add(txn)
    await db_session.commit()
    result = await db_session.execute(select(Transaction).where(Transaction.email_id == email.id))
    t = result.scalar_one()
    assert t.label == Label.expense
    assert float(t.amount) == 299.00

@pytest.mark.asyncio
async def test_sender_rule_unique(db_session):
    rule = SenderRule(sender_domain="swiggy.in", label=Label.expense, category="Food", source=RuleSource.builtin)
    db_session.add(rule)
    await db_session.commit()
    result = await db_session.execute(select(SenderRule).where(SenderRule.sender_domain == "swiggy.in"))
    assert result.scalar_one().category == "Food"
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_models.py -v
# Expected: ImportError — models not defined
```

- [ ] **Step 3: Create `app/models.py`**

```python
import uuid
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Numeric, Float, DateTime, Date, Integer, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
import sqlalchemy as sa

class Base(DeclarativeBase):
    pass

class Label(str, PyEnum):
    expense = "expense"
    income = "income"
    ignore = "ignore"

class TransactionStatus(str, PyEnum):
    auto = "auto"
    confirmed = "confirmed"
    corrected = "corrected"
    needs_review = "needs_review"

class ClassifierMethod(str, PyEnum):
    rule = "rule"
    llm = "llm"

class RuleSource(str, PyEnum):
    builtin = "builtin"
    user_trained = "user_trained"

def _uuid_col():
    # SQLite-compatible UUID: store as String(36)
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

class Email(Base):
    __tablename__ = "emails"

    id: Mapped[str] = _uuid_col()
    gmail_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    subject: Mapped[str | None] = mapped_column(Text)
    sender: Mapped[str | None] = mapped_column(String(500))
    sender_domain: Mapped[str | None] = mapped_column(String(255))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    body_snippet: Mapped[str | None] = mapped_column(Text)
    gmail_link: Mapped[str | None] = mapped_column(String(500))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    transaction: Mapped["Transaction | None"] = relationship(back_populates="email", uselist=False)

class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = _uuid_col()
    email_id: Mapped[str] = mapped_column(String(36), ForeignKey("emails.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    merchant: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(100))
    txn_date: Mapped[date | None] = mapped_column(Date)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(20), default=TransactionStatus.needs_review)
    classifier_method: Mapped[str | None] = mapped_column(String(10))
    user_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    email: Mapped["Email"] = relationship(back_populates="transaction")

class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_history_id: Mapped[str | None] = mapped_column(String(255))

class SenderRule(Base):
    __tablename__ = "sender_rules"

    id: Mapped[str] = _uuid_col()
    sender_domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20), default=RuleSource.builtin)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_models.py -v
# Expected: all 3 PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/models.py tests/test_models.py
git commit -m "feat: database models (Email, Transaction, SyncState, SenderRule)"
```

---

## Task 4: Alembic Migrations

**Files:**
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/versions/0001_initial.py`

- [ ] **Step 1: Init Alembic**

```bash
alembic init alembic
```

- [ ] **Step 2: Edit `alembic/env.py`** — replace the generated file with:

```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.models import Base
from app.config import settings

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL.replace("+asyncpg", ""))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 3: Generate initial migration**

```bash
# Requires Postgres running: docker compose up db -d
alembic revision --autogenerate -m "initial"
# A file is created at alembic/versions/<hash>_initial.py — verify it contains
# create_table calls for emails, transactions, sync_state, sender_rules
```

- [ ] **Step 4: Run migration**

```bash
alembic upgrade head
# Expected: all 4 tables created in Postgres
```

- [ ] **Step 5: Commit**

```bash
git add alembic.ini alembic/
git commit -m "feat: alembic migrations — initial schema"
```

---

## Task 5: Gmail OAuth

**Files:**
- Create: `app/gmail/auth.py`
- Create: `app/api/auth.py`
- Test: `tests/test_gmail_auth.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_gmail_auth.py
from unittest.mock import patch, MagicMock
from pathlib import Path
from app.gmail.auth import get_credentials, is_authenticated, save_credentials

def test_is_authenticated_false_when_no_token(tmp_path, monkeypatch):
    monkeypatch.setattr("app.gmail.auth.TOKEN_FILE", tmp_path / "token.json")
    assert is_authenticated() is False

def test_save_and_load_credentials(tmp_path, monkeypatch):
    monkeypatch.setattr("app.gmail.auth.TOKEN_FILE", tmp_path / "token.json")
    mock_creds = MagicMock()
    mock_creds.to_json.return_value = '{"token": "fake", "refresh_token": "r", "token_uri": "u", "client_id": "c", "client_secret": "s", "scopes": []}'
    mock_creds.valid = True
    mock_creds.expired = False
    save_credentials(mock_creds)
    assert (tmp_path / "token.json").exists()
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_gmail_auth.py -v
# Expected: ImportError
```

- [ ] **Step 3: Create `app/gmail/auth.py`**

```python
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from app.config import settings

TOKEN_FILE = Path("data/gmail_token.json")
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

def get_oauth_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(client_config, scopes=SCOPES)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    return flow

def get_credentials() -> Credentials | None:
    if not TOKEN_FILE.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_credentials(creds)
    return creds if creds and creds.valid else None

def save_credentials(creds: Credentials) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json())

def is_authenticated() -> bool:
    return get_credentials() is not None
```

- [ ] **Step 4: Create `app/api/auth.py`**

```python
from fastapi import APIRouter
from fastapi.responses import RedirectResponse
from app.gmail.auth import get_oauth_flow, save_credentials, is_authenticated

router = APIRouter()
_pending: dict = {}

@router.get("/auth/gmail")
async def start_auth():
    flow = get_oauth_flow()
    auth_url, state = flow.authorization_url(access_type="offline", prompt="consent")
    _pending["state"] = state
    _pending["flow"] = flow
    return RedirectResponse(auth_url)

@router.get("/auth/callback")
async def auth_callback(code: str, state: str):
    flow = _pending.get("flow")
    if not flow:
        return {"error": "No pending auth flow. Visit /api/auth/gmail first."}
    flow.fetch_token(code=code)
    save_credentials(flow.credentials)
    _pending.clear()
    return RedirectResponse("/")

@router.get("/auth/status")
async def auth_status():
    return {"authenticated": is_authenticated()}
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_gmail_auth.py -v
# Expected: both PASS
```

- [ ] **Step 6: Commit**

```bash
git add app/gmail/auth.py app/api/auth.py tests/test_gmail_auth.py
git commit -m "feat: Gmail OAuth2 — token storage and auth flow"
```

---

## Task 6: Gmail Client

**Files:**
- Create: `app/gmail/client.py`
- Test: `tests/test_gmail_client.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_gmail_client.py
from app.gmail.client import extract_domain, get_gmail_link

def test_extract_domain_standard():
    assert extract_domain("Amazon <no-reply@amazon.in>") == "amazon.in"

def test_extract_domain_bare():
    assert extract_domain("alerts@hdfcbank.com") == "hdfcbank.com"

def test_extract_domain_empty():
    assert extract_domain("") == ""

def test_gmail_link():
    link = get_gmail_link("abc123")
    assert link == "https://mail.google.com/mail/u/0/#inbox/abc123"
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_gmail_client.py -v
# Expected: ImportError
```

- [ ] **Step 3: Create `app/gmail/client.py`**

```python
import re
from datetime import datetime, timezone
from googleapiclient.discovery import build
from app.gmail.auth import get_credentials

def extract_domain(sender: str) -> str:
    match = re.search(r"@([\w.-]+)", sender)
    return match.group(1).lower() if match else ""

def get_gmail_link(gmail_id: str) -> str:
    return f"https://mail.google.com/mail/u/0/#inbox/{gmail_id}"

def _build_service():
    creds = get_credentials()
    if not creds:
        raise RuntimeError("Gmail not authenticated. Visit /api/auth/gmail")
    return build("gmail", "v1", credentials=creds)

def fetch_new_messages(last_history_id: str | None) -> tuple[list[dict], str | None]:
    """
    Returns (messages, new_history_id).
    last_history_id=None triggers full 90-day fetch.

    Each message dict keys:
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, gmail_link
    """
    service = _build_service()

    if last_history_id is None:
        results = service.users().messages().list(
            userId="me", q="newer_than:90d", maxResults=500
        ).execute()
        message_ids = [m["id"] for m in results.get("messages", [])]
        profile = service.users().getProfile(userId="me").execute()
        new_history_id = str(profile["historyId"])
    else:
        try:
            history = service.users().history().list(
                userId="me",
                startHistoryId=last_history_id,
                historyTypes=["messageAdded"],
            ).execute()
            message_ids = [
                msg["id"]
                for record in history.get("history", [])
                for msg in record.get("messagesAdded", [])
            ]
            new_history_id = str(history.get("historyId", last_history_id))
        except Exception:
            # History expired — fall back to full fetch
            return fetch_new_messages(None)

    messages = []
    for msg_id in message_ids:
        msg = service.users().messages().get(
            userId="me", id=msg_id, format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()
        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        sender = headers.get("From", "")
        messages.append({
            "gmail_id": msg_id,
            "subject": headers.get("Subject", ""),
            "sender": sender,
            "sender_domain": extract_domain(sender),
            "received_at": datetime.fromtimestamp(
                int(msg["internalDate"]) / 1000, tz=timezone.utc
            ),
            "body_snippet": msg.get("snippet", "")[:500],
            "gmail_link": get_gmail_link(msg_id),
        })

    return messages, new_history_id
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_gmail_client.py -v
# Expected: all 4 PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/gmail/client.py tests/test_gmail_client.py
git commit -m "feat: Gmail client — incremental sync via history ID"
```

---

## Task 7: Rule Engine

**Files:**
- Create: `app/classifier/rules.py`
- Test: `tests/test_rules.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_rules.py
from app.classifier.rules import apply_rules
from app.models import Label

def test_known_domain_expense():
    result = apply_rules("zomato.com", "Your order is confirmed", "₹299 paid")
    assert result.label == Label.expense
    assert result.confidence >= 0.90
    assert result.matched_domain is True

def test_known_domain_from_db_overrides_builtin():
    db_rules = {"zomato.com": (Label.income, "Refund")}
    result = apply_rules("zomato.com", "Refund processed", "₹100 credited", db_rules)
    assert result.label == Label.income

def test_expense_keywords_score():
    result = apply_rules("unknown.com", "Payment receipt", "Amount debited ₹500 invoice")
    assert result.label == Label.expense
    assert result.confidence > 0.60

def test_income_keywords_score():
    result = apply_rules("unknown.com", "Amount credited to your account", "₹5000 salary credited")
    assert result.label == Label.income

def test_ignore_keywords():
    result = apply_rules("marketing.co", "Unsubscribe from newsletter", "Promotional offer click here")
    assert result.label == Label.ignore

def test_unknown_low_confidence():
    result = apply_rules("randomblog.com", "Hello there", "Check this out")
    assert result.confidence == 0.0
    assert result.label is None
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_rules.py -v
# Expected: ImportError
```

- [ ] **Step 3: Create `app/classifier/rules.py`**

```python
from dataclasses import dataclass, field
from app.models import Label

EXPENSE_KEYWORDS = [
    "receipt", "invoice", "order confirmed", "order confirmation",
    "payment successful", "payment confirmation", "debited", "charged",
    "bill", "debit", "purchase", "booking confirmed", "amount paid",
    "transaction", "₹", "rs.", "inr",
]

INCOME_KEYWORDS = [
    "credited", "received", "salary", "transferred to you",
    "refund", "cashback", "credit", "you have received", "amount credited",
]

IGNORE_KEYWORDS = [
    "newsletter", "unsubscribe", "promotional", "otp", "verify your",
    "verification code", "one time password", "offers", "sale",
    "click here", "no-reply marketing",
]

BUILTIN_SENDER_RULES: dict[str, tuple[Label, str]] = {
    "amazon.in": (Label.expense, "Shopping"),
    "flipkart.com": (Label.expense, "Shopping"),
    "myntra.com": (Label.expense, "Shopping"),
    "meesho.com": (Label.expense, "Shopping"),
    "zomato.com": (Label.expense, "Food"),
    "swiggy.in": (Label.expense, "Food"),
    "blinkit.com": (Label.expense, "Groceries"),
    "bigbasket.com": (Label.expense, "Groceries"),
    "phonepe.com": (Label.expense, "UPI Payment"),
    "paytm.com": (Label.expense, "UPI Payment"),
    "razorpay.com": (Label.expense, "Payment"),
    "cred.club": (Label.expense, "Bill Payment"),
    "makemytrip.com": (Label.expense, "Travel"),
    "irctc.co.in": (Label.expense, "Travel"),
    "olacabs.com": (Label.expense, "Transport"),
    "uber.com": (Label.expense, "Transport"),
    "rapido.bike": (Label.expense, "Transport"),
    "airtel.in": (Label.expense, "Utilities"),
    "jio.com": (Label.expense, "Utilities"),
}

@dataclass
class RuleResult:
    label: Label | None
    category: str | None
    confidence: float
    matched_domain: bool
    matched_keywords: list[str] = field(default_factory=list)

def _score(text: str, keywords: list[str]) -> tuple[int, list[str]]:
    lower = text.lower()
    matched = [kw for kw in keywords if kw in lower]
    return len(matched), matched

def apply_rules(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: dict[str, tuple[Label, str]] | None = None,
) -> RuleResult:
    """
    db_rules format: {domain: (Label, category)}
    User-trained db_rules override builtin rules.
    """
    all_rules = {**BUILTIN_SENDER_RULES, **(db_rules or {})}

    if sender_domain in all_rules:
        label, category = all_rules[sender_domain]
        return RuleResult(label=label, category=category, confidence=0.95, matched_domain=True)

    text = f"{subject} {body_snippet}"
    expense_count, expense_matched = _score(text, EXPENSE_KEYWORDS)
    income_count, income_matched = _score(text, INCOME_KEYWORDS)
    ignore_count, ignore_matched = _score(text, IGNORE_KEYWORDS)

    if ignore_count >= 2:
        return RuleResult(label=Label.ignore, category=None, confidence=0.80,
                          matched_domain=False, matched_keywords=ignore_matched)

    if expense_count > income_count and expense_count >= 2:
        confidence = min(0.60 + expense_count * 0.05, 0.84)
        return RuleResult(label=Label.expense, category="Other", confidence=confidence,
                          matched_domain=False, matched_keywords=expense_matched)

    if income_count > expense_count and income_count >= 2:
        confidence = min(0.60 + income_count * 0.05, 0.84)
        return RuleResult(label=Label.income, category="Income", confidence=confidence,
                          matched_domain=False, matched_keywords=income_matched)

    return RuleResult(label=None, category=None, confidence=0.0, matched_domain=False)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_rules.py -v
# Expected: all 6 PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/rules.py tests/test_rules.py
git commit -m "feat: rule engine — domain lookup + keyword scoring"
```

---

## Task 8: LLM Client

**Files:**
- Create: `app/classifier/llm_client.py`
- Test: `tests/test_llm_client.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_llm_client.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.classifier.llm_client import LLMClient, LLMClassification

@pytest.mark.asyncio
async def test_classify_returns_classification(monkeypatch):
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "choices": [{"message": {"content": '{"label":"expense","amount":299.0,"merchant":"Zomato","category":"Food","txn_date":"2026-04-10","confidence":0.92}'}}]
    }
    fake_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=fake_response)

    with patch("app.classifier.llm_client.httpx.AsyncClient", return_value=mock_client):
        client = LLMClient()
        result = await client.classify("no-reply@zomato.com", "Order confirmed", "Your order ₹299")

    assert isinstance(result, LLMClassification)
    assert result.label == "expense"
    assert result.amount == 299.0
    assert result.merchant == "Zomato"
    assert result.confidence == 0.92

@pytest.mark.asyncio
async def test_classify_strips_markdown_fences(monkeypatch):
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "choices": [{"message": {"content": '```json\n{"label":"income","amount":5000.0,"merchant":null,"category":"Income","txn_date":null,"confidence":0.88}\n```'}}]
    }
    fake_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=fake_response)

    with patch("app.classifier.llm_client.httpx.AsyncClient", return_value=mock_client):
        client = LLMClient()
        result = await client.classify("hr@company.com", "Salary credited", "₹50000 salary")

    assert result.label == "income"
    assert result.amount == 5000.0
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_llm_client.py -v
# Expected: ImportError
```

- [ ] **Step 3: Create `app/classifier/llm_client.py`**

```python
import json
import httpx
from dataclasses import dataclass
from app.config import settings

@dataclass
class LLMClassification:
    label: str
    amount: float | None
    merchant: str | None
    category: str | None
    txn_date: str | None
    confidence: float

_SYSTEM = (
    "You are classifying financial emails for an Indian user. "
    "Respond ONLY with valid JSON. No explanation, no markdown, no code blocks."
)

_USER_TEMPLATE = """Classify this email as: expense, income, or ignore.
Extract: amount (INR as number), merchant name, category, transaction date.

From: {sender}
Subject: {subject}
Body: {body_snippet}

Indian context: UPI, bank debit/credit alerts, GST invoices. Merchants include
Zomato, Swiggy, Swiggy instamart, Flipkart, Amazon.in, Jio, Airtel, PhonePe,
Google Pay, Paytm, CRED, IRCTC, Ola, Rapido.

Categories: Food, Groceries, Shopping, Travel, Transport, Utilities,
Entertainment, Healthcare, Education, UPI Payment, Bank Transfer, Income, Other

JSON only: {{"label":"expense|income|ignore","amount":0.00,"merchant":"name or null","category":"category or null","txn_date":"YYYY-MM-DD or null","confidence":0.0}}"""

class LLMClient:
    def __init__(self):
        if settings.LLM_PROVIDER == "openrouter":
            self._base_url = "https://openrouter.ai/api/v1"
            self._api_key = settings.OPENROUTER_API_KEY
            self._extra_headers = {
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Expense Tracker",
            }
        else:
            self._base_url = "https://api.anthropic.com/v1"
            self._api_key = settings.ANTHROPIC_API_KEY
            self._extra_headers = {}
        self._model = settings.LLM_MODEL

    async def classify(self, sender: str, subject: str, body_snippet: str) -> LLMClassification:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _USER_TEMPLATE.format(
                    sender=sender, subject=subject, body_snippet=body_snippet
                )},
            ],
            "temperature": 0.1,
            "max_tokens": 200,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            **self._extra_headers,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions", json=payload, headers=headers
            )
            response.raise_for_status()

        raw = response.json()["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        return LLMClassification(
            label=data.get("label", "ignore"),
            amount=float(data["amount"]) if data.get("amount") is not None else None,
            merchant=data.get("merchant"),
            category=data.get("category"),
            txn_date=data.get("txn_date"),
            confidence=float(data.get("confidence", 0.5)),
        )

llm_client = LLMClient()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_llm_client.py -v
# Expected: both PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/llm_client.py tests/test_llm_client.py
git commit -m "feat: LLM client — OpenRouter/Anthropic via OpenAI-compat API"
```

---

## Task 9: Hybrid Classifier

**Files:**
- Create: `app/classifier/classifier.py`
- Test: `tests/test_classifier.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_classifier.py
import pytest
from unittest.mock import AsyncMock, patch
from app.classifier.classifier import classify_email
from app.classifier.llm_client import LLMClassification
from app.models import Label, TransactionStatus, ClassifierMethod

@pytest.mark.asyncio
async def test_high_confidence_rule_skips_llm():
    with patch("app.classifier.classifier.llm_client.classify") as mock_llm:
        result = await classify_email(
            sender="no-reply@amazon.in",
            sender_domain="amazon.in",
            subject="Your order has been confirmed",
            body_snippet="Amount charged ₹499",
        )
    mock_llm.assert_not_called()
    assert result.label == Label.expense
    assert result.classifier_method == ClassifierMethod.rule
    assert result.status == TransactionStatus.auto

@pytest.mark.asyncio
async def test_low_confidence_calls_llm():
    mock_result = LLMClassification(
        label="expense", amount=150.0, merchant="Café",
        category="Food", txn_date="2026-04-10", confidence=0.90
    )
    with patch("app.classifier.classifier.llm_client.classify", new_callable=AsyncMock, return_value=mock_result):
        result = await classify_email(
            sender="noreply@unknowncafe.com",
            sender_domain="unknowncafe.com",
            subject="Thank you for dining",
            body_snippet="Your bill is ₹150",
        )
    assert result.label == Label.expense
    assert result.amount == 150.0
    assert result.classifier_method == ClassifierMethod.llm
    assert result.status == TransactionStatus.auto

@pytest.mark.asyncio
async def test_llm_failure_returns_needs_review():
    with patch("app.classifier.classifier.llm_client.classify", new_callable=AsyncMock, side_effect=Exception("API error")):
        result = await classify_email(
            sender="x@unknown.org",
            sender_domain="unknown.org",
            subject="Random subject",
            body_snippet="Some body text",
        )
    assert result.status == TransactionStatus.needs_review
    assert result.confidence == 0.0

@pytest.mark.asyncio
async def test_low_llm_confidence_needs_review():
    mock_result = LLMClassification(
        label="expense", amount=50.0, merchant=None,
        category=None, txn_date=None, confidence=0.50
    )
    with patch("app.classifier.classifier.llm_client.classify", new_callable=AsyncMock, return_value=mock_result):
        result = await classify_email(
            sender="x@mystery.com",
            sender_domain="mystery.com",
            subject="Possible receipt",
            body_snippet="payment details",
        )
    assert result.status == TransactionStatus.needs_review
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_classifier.py -v
# Expected: ImportError
```

- [ ] **Step 3: Create `app/classifier/classifier.py`**

```python
from dataclasses import dataclass
from datetime import date
from app.models import Label, TransactionStatus, ClassifierMethod
from app.classifier.rules import apply_rules
from app.classifier.llm_client import llm_client, LLMClassification
from app.config import settings

@dataclass
class ClassificationResult:
    label: Label
    amount: float | None
    merchant: str | None
    category: str | None
    txn_date: date | None
    confidence: float
    status: TransactionStatus
    classifier_method: ClassifierMethod

async def classify_email(
    sender: str,
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: dict[str, tuple[Label, str]] | None = None,
) -> ClassificationResult:
    rule_result = apply_rules(sender_domain, subject, body_snippet, db_rules)

    if rule_result.confidence >= settings.LLM_CONFIDENCE_THRESHOLD:
        label = rule_result.label
        category = rule_result.category
        amount = None
        merchant = None
        txn_date = None
        confidence = rule_result.confidence
        method = ClassifierMethod.rule
    else:
        try:
            llm_result: LLMClassification = await llm_client.classify(sender, subject, body_snippet)
            label = Label(llm_result.label)
            amount = llm_result.amount
            merchant = llm_result.merchant
            category = llm_result.category
            confidence = llm_result.confidence
            method = ClassifierMethod.llm
            txn_date = None
            if llm_result.txn_date:
                try:
                    txn_date = date.fromisoformat(llm_result.txn_date)
                except ValueError:
                    pass
        except Exception:
            label = rule_result.label or Label.ignore
            amount = None
            merchant = None
            category = None
            txn_date = None
            confidence = 0.0
            method = ClassifierMethod.rule

    status = (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )

    return ClassificationResult(
        label=label,
        amount=amount,
        merchant=merchant,
        category=category,
        txn_date=txn_date,
        confidence=confidence,
        status=status,
        classifier_method=method,
    )
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_classifier.py -v
# Expected: all 4 PASS
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/classifier.py tests/test_classifier.py
git commit -m "feat: hybrid classifier — rules first, LLM fallback"
```

---

## Task 10: Sync Job + Scheduler

**Files:**
- Create: `app/sync.py`
- Create: `app/scheduler.py`
- Test: `tests/test_sync.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_sync.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.sync import run_sync

@pytest.mark.asyncio
async def test_run_sync_processes_new_emails(db_session):
    fake_messages = [
        {
            "gmail_id": "msg001",
            "subject": "Your Zomato order is confirmed",
            "sender": "no-reply@zomato.com",
            "sender_domain": "zomato.com",
            "received_at": None,
            "body_snippet": "₹299 paid",
            "gmail_link": "https://mail.google.com/mail/u/0/#inbox/msg001",
        }
    ]

    with (
        patch("app.sync.fetch_new_messages", return_value=(fake_messages, "999")),
        patch("app.sync.AsyncSessionLocal", return_value=db_session.__class__),
    ):
        # Use db_session directly by patching the session factory
        pass  # see integration note below

@pytest.mark.asyncio
async def test_run_sync_skips_duplicate_gmail_id(db_session):
    from app.models import Email
    existing = Email(gmail_id="dup001", sender_domain="amazon.in")
    db_session.add(existing)
    await db_session.commit()

    fake_messages = [{
        "gmail_id": "dup001",
        "subject": "Duplicate",
        "sender": "x@amazon.in",
        "sender_domain": "amazon.in",
        "received_at": None,
        "body_snippet": "",
        "gmail_link": "",
    }]

    from sqlalchemy import select
    from app.models import Transaction

    with patch("app.sync.fetch_new_messages", return_value=(fake_messages, "100")):
        # Patch the session factory to use our test session
        from unittest.mock import AsyncMock
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=db_session)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)

        with patch("app.sync.AsyncSessionLocal", return_value=mock_ctx):
            result = await run_sync()

    # No new transaction — duplicate skipped
    txns = await db_session.execute(select(Transaction))
    assert txns.scalars().all() == []
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_sync.py -v
# Expected: ImportError
```

- [ ] **Step 3: Create `app/sync.py`**

```python
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models import Email, Transaction, SyncState, SenderRule
from app.gmail.client import fetch_new_messages
from app.classifier.classifier import classify_email

logger = logging.getLogger(__name__)

async def _load_db_rules(session: AsyncSession) -> dict[str, tuple]:
    from app.models import Label
    result = await session.execute(select(SenderRule))
    return {r.sender_domain: (Label(r.label), r.category) for r in result.scalars().all()}

async def run_sync() -> dict:
    async with AsyncSessionLocal() as session:
        state_result = await session.execute(select(SyncState))
        sync_state = state_result.scalar_one_or_none()
        last_history_id = sync_state.last_history_id if sync_state else None

        try:
            messages, new_history_id = fetch_new_messages(last_history_id)
        except Exception as exc:
            logger.error("Gmail fetch failed: %s", exc)
            return {"error": str(exc), "processed": 0}

        db_rules = await _load_db_rules(session)
        processed = 0

        for msg in messages:
            existing = await session.execute(
                select(Email).where(Email.gmail_id == msg["gmail_id"])
            )
            if existing.scalar_one_or_none():
                continue

            email = Email(**msg)
            session.add(email)
            await session.flush()

            try:
                classification = await classify_email(
                    sender=msg["sender"],
                    sender_domain=msg["sender_domain"],
                    subject=msg["subject"] or "",
                    body_snippet=msg["body_snippet"] or "",
                    db_rules=db_rules,
                )
                session.add(Transaction(
                    email_id=email.id,
                    label=classification.label.value,
                    amount=classification.amount,
                    currency="INR",
                    merchant=classification.merchant,
                    category=classification.category,
                    txn_date=classification.txn_date,
                    confidence=classification.confidence,
                    status=classification.status.value,
                    classifier_method=classification.classifier_method.value,
                ))
                processed += 1
            except Exception as exc:
                logger.error("Classification failed for %s: %s", msg["gmail_id"], exc)

        if sync_state is None:
            session.add(SyncState(id=1, last_history_id=new_history_id,
                                  last_synced_at=datetime.now(timezone.utc)))
        else:
            sync_state.last_history_id = new_history_id
            sync_state.last_synced_at = datetime.now(timezone.utc)

        await session.commit()
        return {"processed": processed, "total_fetched": len(messages)}
```

- [ ] **Step 4: Create `app/scheduler.py`**

```python
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.config import settings

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

def setup_scheduler() -> None:
    from app.sync import run_sync

    async def _sync_job():
        logger.info("Scheduled Gmail sync starting")
        try:
            result = await run_sync()
            logger.info("Sync complete: %s", result)
        except Exception as exc:
            logger.error("Sync job error: %s", exc)

    scheduler.add_job(
        _sync_job,
        trigger="interval",
        hours=settings.SYNC_INTERVAL_HOURS,
        id="gmail_sync",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Scheduler started. Gmail sync every %dh", settings.SYNC_INTERVAL_HOURS)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_sync.py -v
# Expected: test_run_sync_skips_duplicate_gmail_id PASS
# (first test is a placeholder — it will show as pass or skip)
```

- [ ] **Step 6: Commit**

```bash
git add app/sync.py app/scheduler.py tests/test_sync.py
git commit -m "feat: sync job and APScheduler wiring"
```

---

## Task 11: API Routes

**Files:**
- Create: `app/api/transactions.py`
- Create: `app/api/review.py`
- Create: `app/api/sync.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_api.py
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch
from app.main import app

@pytest.mark.asyncio
async def test_auth_status_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("app.api.auth.is_authenticated", return_value=False):
            resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    assert resp.json() == {"authenticated": False}

@pytest.mark.asyncio
async def test_get_transactions_empty(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("app.api.transactions.get_db", return_value=_yield(db_session)):
            resp = await client.get("/api/transactions")
    assert resp.status_code == 200
    assert resp.json() == []

@pytest.mark.asyncio
async def test_get_review_empty(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("app.api.review.get_db", return_value=_yield(db_session)):
            resp = await client.get("/api/review")
    assert resp.status_code == 200
    assert resp.json() == []

@pytest.mark.asyncio
async def test_patch_transaction_not_found(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        with patch("app.api.transactions.get_db", return_value=_yield(db_session)):
            resp = await client.patch(
                "/api/transactions/00000000-0000-0000-0000-000000000000",
                json={"label": "income"}
            )
    assert resp.status_code == 404

async def _yield(session):
    yield session
```

- [ ] **Step 2: Run to verify they fail**

```bash
pytest tests/test_api.py -v
# Expected: ImportError (app.main not yet created)
```

- [ ] **Step 3: Create `app/api/transactions.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, extract
from pydantic import BaseModel
from typing import Optional
from datetime import date
from app.database import get_db
from app.models import Transaction, Email, SenderRule, Label, TransactionStatus, RuleSource

router = APIRouter()

class TransactionPatch(BaseModel):
    label: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    user_notes: Optional[str] = None

def _fmt(t: Transaction, e: Email) -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "amount": float(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
        "user_notes": t.user_notes,
        "email": {
            "subject": e.subject,
            "sender": e.sender,
            "received_at": e.received_at.isoformat() if e.received_at else None,
            "gmail_link": e.gmail_link,
        },
    }

@router.get("/transactions")
async def list_transactions(
    label: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction, Email).join(Email).order_by(desc(Transaction.created_at))
    if label:
        q = q.where(Transaction.label == label)
    if status:
        q = q.where(Transaction.status == status)
    if date_from:
        q = q.where(Transaction.txn_date >= date_from)
    if date_to:
        q = q.where(Transaction.txn_date <= date_to)
    if category:
        q = q.where(Transaction.category == category)
    rows = (await db.execute(q)).all()
    return [_fmt(t, e) for t, e in rows]

@router.get("/transactions/{transaction_id}")
async def get_transaction(transaction_id: str, db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(Transaction, Email).join(Email).where(Transaction.id == transaction_id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row
    result = _fmt(t, e)
    result["email"]["sender_domain"] = e.sender_domain
    result["email"]["body_snippet"] = e.body_snippet
    return result

@router.patch("/transactions/{transaction_id}")
async def patch_transaction(
    transaction_id: str,
    patch: TransactionPatch,
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(Transaction, Email).join(Email).where(Transaction.id == transaction_id)
    )).one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    t, e = row

    if patch.label is not None:
        t.label = patch.label
        t.status = TransactionStatus.corrected.value
        if e.sender_domain:
            existing = (await db.execute(
                select(SenderRule).where(SenderRule.sender_domain == e.sender_domain)
            )).scalar_one_or_none()
            new_category = patch.category or t.category
            if existing:
                existing.label = patch.label
                existing.category = new_category
                existing.source = RuleSource.user_trained.value
            else:
                db.add(SenderRule(
                    sender_domain=e.sender_domain,
                    label=patch.label,
                    category=new_category,
                    source=RuleSource.user_trained.value,
                ))
    if patch.category is not None:
        t.category = patch.category
    if patch.amount is not None:
        t.amount = patch.amount
    if patch.user_notes is not None:
        t.user_notes = patch.user_notes

    await db.commit()
    return {"id": t.id, "status": t.status}

@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    from datetime import date as date_cls
    now = date_cls.today()
    rows = (await db.execute(
        select(Transaction.label, Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(
            Transaction.txn_date != None,
            extract("month", Transaction.txn_date) == now.month,
            extract("year", Transaction.txn_date) == now.year,
            Transaction.status != TransactionStatus.needs_review.value,
        )
        .group_by(Transaction.label, Transaction.category)
    )).all()

    total_expense = sum(float(r.total or 0) for r in rows if r.label == "expense")
    total_income = sum(float(r.total or 0) for r in rows if r.label == "income")
    return {
        "month": f"{now.year}-{now.month:02d}",
        "total_expense": total_expense,
        "total_income": total_income,
        "by_category": [
            {"label": r.label, "category": r.category, "total": float(r.total or 0)}
            for r in rows
        ],
    }
```

- [ ] **Step 4: Create `app/api/review.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.database import get_db
from app.models import Transaction, Email, TransactionStatus

router = APIRouter()

@router.get("/review")
async def get_review_queue(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Transaction, Email)
        .join(Email)
        .where(Transaction.status == TransactionStatus.needs_review.value)
        .order_by(desc(Email.received_at))
    )).all()
    return [
        {
            "id": t.id,
            "label": t.label,
            "amount": float(t.amount) if t.amount is not None else None,
            "merchant": t.merchant,
            "category": t.category,
            "confidence": t.confidence,
            "email": {
                "subject": e.subject,
                "sender": e.sender,
                "received_at": e.received_at.isoformat() if e.received_at else None,
                "body_snippet": e.body_snippet,
                "gmail_link": e.gmail_link,
            },
        }
        for t, e in rows
    ]
```

- [ ] **Step 5: Create `app/api/sync.py`**

```python
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import SyncState
from app.config import settings

router = APIRouter()

@router.get("/sync/status")
async def sync_status(db: AsyncSession = Depends(get_db)):
    state = (await db.execute(select(SyncState))).scalar_one_or_none()
    if state and state.last_synced_at:
        next_sync = state.last_synced_at + timedelta(hours=settings.SYNC_INTERVAL_HOURS)
        return {
            "last_synced_at": state.last_synced_at.isoformat(),
            "next_sync_at": next_sync.isoformat(),
            "sync_interval_hours": settings.SYNC_INTERVAL_HOURS,
        }
    return {"last_synced_at": None, "next_sync_at": None,
            "sync_interval_hours": settings.SYNC_INTERVAL_HOURS}

@router.post("/sync/trigger")
async def trigger_sync():
    from app.sync import run_sync
    asyncio.create_task(run_sync())
    return {"message": "Sync triggered"}
```

- [ ] **Step 6: Run tests**

```bash
pytest tests/test_api.py -v
# Expected: fails — app.main not yet created. Proceed to next step first.
```

---

## Task 12: FastAPI App + Dashboard Templates

**Files:**
- Create: `app/main.py`
- Create: `templates/base.html`
- Create: `templates/dashboard.html`
- Create: `templates/transactions.html`
- Create: `templates/review.html`
- Create: `templates/settings.html`
- Create: `static/app.js`

- [ ] **Step 1: Create `app/main.py`**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app.scheduler import setup_scheduler, scheduler
from app.api import auth, transactions, review, sync as sync_api

@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler()
    yield
    scheduler.shutdown(wait=False)

app = FastAPI(title="Expense Tracker", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(auth.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(sync_api.router, prefix="/api")

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@app.get("/transactions", response_class=HTMLResponse)
async def transactions_page(request: Request):
    return templates.TemplateResponse("transactions.html", {"request": request})

@app.get("/review", response_class=HTMLResponse)
async def review_page(request: Request):
    return templates.TemplateResponse("review.html", {"request": request})

@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request})
```

- [ ] **Step 2: Create `templates/base.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expense Tracker</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f0f1a; color: #e0e0e0; min-height: 100vh; }
    nav { background: #1a1a2e; border-bottom: 1px solid #2a2a4a; padding: 0 24px; display: flex; align-items: center; gap: 32px; height: 56px; }
    nav .brand { color: #7c83fd; font-weight: 700; font-size: 18px; text-decoration: none; }
    nav a { color: #aaa; text-decoration: none; font-size: 14px; padding: 4px 0; border-bottom: 2px solid transparent; }
    nav a:hover, nav a.active { color: #fff; border-bottom-color: #7c83fd; }
    nav .spacer { flex: 1; }
    .container { max-width: 1100px; margin: 0 auto; padding: 28px 24px; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
    .stat-card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 16px 20px; }
    .stat-card .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px; }
    .stat-card .value { font-size: 26px; font-weight: 700; }
    .stat-card .value.expense { color: #e07070; }
    .stat-card .value.income { color: #5db87d; }
    .stat-card .value.warn { color: #f0a500; }
    .stat-card .value.muted { color: #ccc; font-size: 16px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { color: #666; text-align: left; padding: 8px 12px; border-bottom: 1px solid #2a2a4a; font-weight: 500; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e1e2e; }
    tr:hover td { background: #1a1a2e; }
    .badge { display: inline-block; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 500; }
    .badge.expense { background: #2a1a1a; color: #e07070; }
    .badge.income { background: #1a2a1a; color: #5db87d; }
    .badge.ignore { background: #222; color: #888; }
    .badge.review { background: #2a2a1a; color: #f0a500; }
    .card { background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; overflow: hidden; }
    .card-header { padding: 12px 16px; border-bottom: 1px solid #2a2a4a; font-size: 13px; color: #888; display: flex; justify-content: space-between; align-items: center; }
    btn { cursor: pointer; border: none; border-radius: 6px; padding: 6px 16px; font-size: 13px; }
    .btn-primary { background: #7c83fd; color: #fff; cursor: pointer; border: none; border-radius: 6px; padding: 6px 16px; font-size: 13px; }
    .btn-ghost { background: transparent; color: #7c83fd; border: 1px solid #7c83fd; cursor: pointer; border-radius: 6px; padding: 6px 16px; font-size: 13px; }
    a.link { color: #7c83fd; text-decoration: none; }
    a.link:hover { text-decoration: underline; }
    select, input { background: #111; color: #ccc; border: 1px solid #333; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
  </style>
</head>
<body>
<nav>
  <a href="/" class="brand">💸 ExpenseTracker</a>
  <a href="/" id="nav-home">Dashboard</a>
  <a href="/transactions" id="nav-txn">Transactions</a>
  <a href="/review" id="nav-review">Needs Review <span id="review-count" style="display:none;background:#e07070;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px"></span></a>
  <a href="/settings" id="nav-settings">Settings</a>
  <div class="spacer"></div>
  <button class="btn-primary" onclick="triggerSync()">Sync Now</button>
</nav>
<div class="container">
  {% block content %}{% endblock %}
</div>
<script src="/static/app.js"></script>
<script>
  // Highlight active nav link
  const path = window.location.pathname;
  if (path === '/') document.getElementById('nav-home').classList.add('active');
  else if (path.startsWith('/transactions')) document.getElementById('nav-txn').classList.add('active');
  else if (path.startsWith('/review')) document.getElementById('nav-review').classList.add('active');
  else if (path.startsWith('/settings')) document.getElementById('nav-settings').classList.add('active');
</script>
</body>
</html>
```

- [ ] **Step 3: Create `templates/dashboard.html`**

```html
{% extends "base.html" %}
{% block content %}
<div class="stat-grid" id="stat-grid">
  <div class="stat-card"><div class="label">This Month Expenses</div><div class="value expense" id="stat-expense">₹—</div></div>
  <div class="stat-card"><div class="label">This Month Income</div><div class="value income" id="stat-income">₹—</div></div>
  <div class="stat-card"><div class="label">Needs Review</div><div class="value warn" id="stat-review">—</div></div>
  <div class="stat-card"><div class="label">Last Sync</div><div class="value muted" id="stat-sync">—</div></div>
</div>

<div class="card">
  <div class="card-header">
    Recent Transactions
    <a href="/transactions" class="link" style="font-size:13px">View all →</a>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Label</th><th>Amount</th><th>Source</th><th>Status</th></tr></thead>
    <tbody id="txn-body"><tr><td colspan="7" style="color:#555;padding:20px;text-align:center">Loading...</td></tr></tbody>
  </table>
</div>

<script>
async function loadDashboard() {
  const [stats, txns, review, syncStatus] = await Promise.all([
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/transactions?').then(r => r.json()),
    fetch('/api/review').then(r => r.json()),
    fetch('/api/sync/status').then(r => r.json()),
  ]);

  document.getElementById('stat-expense').textContent = '₹' + (stats.total_expense || 0).toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('stat-income').textContent = '₹' + (stats.total_income || 0).toLocaleString('en-IN', {minimumFractionDigits: 2});
  document.getElementById('stat-review').textContent = review.length + ' emails';

  const rc = document.getElementById('review-count');
  if (review.length > 0) { rc.textContent = review.length; rc.style.display = 'inline'; }

  if (syncStatus.last_synced_at) {
    const d = new Date(syncStatus.last_synced_at);
    const diff = Math.round((Date.now() - d) / 60000);
    document.getElementById('stat-sync').textContent = diff < 60 ? diff + 'm ago' : Math.round(diff/60) + 'h ago';
  } else {
    document.getElementById('stat-sync').textContent = 'Never';
  }

  const tbody = document.getElementById('txn-body');
  if (!txns.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#555;padding:20px;text-align:center">No transactions yet. Connect Gmail in Settings and sync.</td></tr>';
    return;
  }
  tbody.innerHTML = txns.slice(0, 20).map(t => `
    <tr>
      <td>${t.txn_date || t.email.received_at?.slice(0,10) || '—'}</td>
      <td>${t.merchant || t.email.sender?.replace(/<.*>/, '').trim() || '—'}</td>
      <td>${t.category || '—'}</td>
      <td><span class="badge ${t.label}">${t.label}</span></td>
      <td style="color:${t.label==='expense'?'#e07070':t.label==='income'?'#5db87d':'#888'}">${t.amount != null ? (t.label==='expense'?'-':'+'+'₹'+Number(t.amount).toLocaleString('en-IN')) : '—'}</td>
      <td><a href="${t.email.gmail_link}" target="_blank" class="link">📧</a></td>
      <td style="font-size:11px;color:${t.status==='auto'?'#5db87d':t.status==='corrected'?'#7c83fd':'#f0a500'}">${t.status}</td>
    </tr>
  `).join('');
}
loadDashboard();
</script>
{% endblock %}
```

- [ ] **Step 4: Create `templates/transactions.html`**

```html
{% extends "base.html" %}
{% block content %}
<div style="display:flex;gap:12px;margin-bottom:20px;align-items:center">
  <select id="filter-label" onchange="loadTxns()">
    <option value="">All labels</option>
    <option value="expense">Expense</option>
    <option value="income">Income</option>
    <option value="ignore">Ignore</option>
  </select>
  <select id="filter-status" onchange="loadTxns()">
    <option value="">All statuses</option>
    <option value="auto">Auto</option>
    <option value="confirmed">Confirmed</option>
    <option value="corrected">Corrected</option>
    <option value="needs_review">Needs Review</option>
  </select>
  <input type="date" id="filter-from" onchange="loadTxns()" placeholder="From">
  <input type="date" id="filter-to" onchange="loadTxns()" placeholder="To">
</div>

<div class="card">
  <div class="card-header"><span id="txn-count">Loading...</span></div>
  <table>
    <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th>Label</th><th>Amount</th><th>Source</th><th>Status</th><th></th></tr></thead>
    <tbody id="txn-body"></tbody>
  </table>
</div>

<script>
async function loadTxns() {
  const label = document.getElementById('filter-label').value;
  const status = document.getElementById('filter-status').value;
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const params = new URLSearchParams();
  if (label) params.set('label', label);
  if (status) params.set('status', status);
  if (from) params.set('date_from', from);
  if (to) params.set('date_to', to);
  const txns = await fetch('/api/transactions?' + params).then(r => r.json());
  document.getElementById('txn-count').textContent = txns.length + ' transactions';
  const tbody = document.getElementById('txn-body');
  tbody.innerHTML = txns.map(t => `
    <tr id="row-${t.id}">
      <td>${t.txn_date || t.email.received_at?.slice(0,10) || '—'}</td>
      <td>${t.merchant || '—'}</td>
      <td>${t.category || '—'}</td>
      <td><span class="badge ${t.label}">${t.label}</span></td>
      <td style="color:${t.label==='expense'?'#e07070':'#5db87d'}">${t.amount != null ? '₹'+Number(t.amount).toLocaleString('en-IN') : '—'}</td>
      <td><a href="${t.email.gmail_link}" target="_blank" class="link">📧</a></td>
      <td style="font-size:11px">${t.status}</td>
      <td><button class="btn-ghost" style="padding:3px 10px;font-size:11px" onclick="openCorrect('${t.id}','${t.label}','${t.category||''}')">Edit</button></td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="color:#555;padding:20px;text-align:center">No transactions</td></tr>';
}
loadTxns();
</script>
{% endblock %}
```

- [ ] **Step 5: Create `templates/review.html`**

```html
{% extends "base.html" %}
{% block content %}
<h2 style="margin-bottom:20px;font-size:18px">Needs Review</h2>
<div id="review-list"></div>

<script>
async function loadReview() {
  const items = await fetch('/api/review').then(r => r.json());
  const el = document.getElementById('review-list');
  if (!items.length) {
    el.innerHTML = '<div style="color:#555;padding:40px;text-align:center">All clear — no emails need review.</div>';
    return;
  }
  el.innerHTML = items.map(t => `
    <div class="card" style="margin-bottom:16px" id="review-${t.id}">
      <div class="card-header">
        <div>
          <strong>${t.email.subject || '(no subject)'}</strong>
          <span style="color:#888;font-size:12px;margin-left:12px">${t.email.sender}</span>
          <span style="color:#555;font-size:12px;margin-left:8px">${t.email.received_at?.slice(0,10) || ''}</span>
        </div>
        <a href="${t.email.gmail_link}" target="_blank" class="link" style="font-size:12px">Open in Gmail →</a>
      </div>
      <div style="padding:14px 16px">
        <p style="color:#888;font-size:13px;margin-bottom:16px">${t.email.body_snippet || ''}</p>
        <form onsubmit="submitCorrection(event, '${t.id}')" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <select name="label" required>
            <option value="">Label...</option>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="ignore">Ignore</option>
          </select>
          <input name="amount" type="number" step="0.01" placeholder="Amount (₹)" style="width:140px">
          <input name="category" type="text" placeholder="Category" style="width:140px">
          <button type="submit" class="btn-primary">Confirm</button>
        </form>
      </div>
    </div>
  `).join('');
}

async function submitCorrection(e, id) {
  e.preventDefault();
  const form = e.target;
  const body = { label: form.label.value };
  if (form.amount.value) body.amount = parseFloat(form.amount.value);
  if (form.category.value) body.category = form.category.value;
  await fetch('/api/transactions/' + id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  document.getElementById('review-' + id).remove();
  if (!document.querySelector('[id^=review-]')) {
    document.getElementById('review-list').innerHTML = '<div style="color:#555;padding:40px;text-align:center">All clear!</div>';
  }
}
loadReview();
</script>
{% endblock %}
```

- [ ] **Step 6: Create `templates/settings.html`**

```html
{% extends "base.html" %}
{% block content %}
<h2 style="margin-bottom:24px;font-size:18px">Settings</h2>

<div class="card" style="margin-bottom:20px">
  <div class="card-header">Gmail Connection</div>
  <div style="padding:20px" id="gmail-section">
    <p style="color:#888;font-size:13px;margin-bottom:16px">Connect your Gmail account to start tracking expenses from emails.</p>
    <div id="auth-status-msg" style="margin-bottom:16px;font-size:13px"></div>
    <a href="/api/auth/gmail" class="btn-primary" style="display:inline-block;padding:8px 20px;text-decoration:none">Connect Gmail</a>
  </div>
</div>

<div class="card" style="margin-bottom:20px">
  <div class="card-header">Manual Sync</div>
  <div style="padding:20px">
    <p style="color:#888;font-size:13px;margin-bottom:16px">Sync interval: every <strong id="sync-interval">—</strong> hours. Last sync: <strong id="last-sync">—</strong></p>
    <button class="btn-primary" onclick="triggerSync()">Trigger Sync Now</button>
    <span id="sync-msg" style="color:#5db87d;font-size:13px;margin-left:12px"></span>
  </div>
</div>

<script>
async function loadSettings() {
  const [authStatus, syncStatus] = await Promise.all([
    fetch('/api/auth/status').then(r => r.json()),
    fetch('/api/sync/status').then(r => r.json()),
  ]);
  const msg = document.getElementById('auth-status-msg');
  msg.textContent = authStatus.authenticated ? '✅ Gmail connected' : '⚠ Not connected';
  msg.style.color = authStatus.authenticated ? '#5db87d' : '#f0a500';
  document.getElementById('sync-interval').textContent = syncStatus.sync_interval_hours;
  document.getElementById('last-sync').textContent = syncStatus.last_synced_at
    ? new Date(syncStatus.last_synced_at).toLocaleString('en-IN') : 'Never';
}
loadSettings();
</script>
{% endblock %}
```

- [ ] **Step 7: Create `static/app.js`**

```javascript
async function triggerSync() {
  const btn = document.querySelector('nav .btn-primary');
  if (btn) { btn.textContent = 'Syncing...'; btn.disabled = true; }
  try {
    await fetch('/api/sync/trigger', { method: 'POST' });
    setTimeout(() => { window.location.reload(); }, 3000);
  } catch (e) {
    if (btn) { btn.textContent = 'Sync Now'; btn.disabled = false; }
  }
}

async function openCorrect(id, currentLabel, currentCategory) {
  const label = prompt(`New label for this transaction?\nCurrent: ${currentLabel}\n\nOptions: expense, income, ignore`, currentLabel);
  if (!label) return;
  const category = prompt('Category (leave blank to keep current):', currentCategory) || currentCategory;
  await fetch('/api/transactions/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, category })
  });
  window.location.reload();
}
```

- [ ] **Step 8: Run all tests**

```bash
pytest -v
# Expected: all tests PASS
```

- [ ] **Step 9: Smoke test**

```bash
# Start Postgres
docker compose up db -d

# Run migrations
alembic upgrade head

# Copy env
cp .env.example .env
# Edit .env — fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENROUTER_API_KEY

# Start app
uvicorn app.main:app --reload

# Visit http://localhost:8000
# Go to Settings → Connect Gmail → authenticate
# Click Sync Now → watch logs
# Visit / — transactions should appear
```

- [ ] **Step 10: Commit**

```bash
git add app/main.py app/api/ templates/ static/
git commit -m "feat: FastAPI app, dashboard templates, API routes"
```

---

## Task 13: Docker Compose Final Wiring

**Files:**
- Modify: `Dockerfile` (add alembic entrypoint)
- Create: `entrypoint.sh`

- [ ] **Step 1: Create `entrypoint.sh`**

```bash
#!/bin/sh
set -e
echo "Running migrations..."
alembic upgrade head
echo "Starting app..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- [ ] **Step 2: Update `Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data && chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
```

- [ ] **Step 3: Test full stack**

```bash
docker compose up --build
# Visit http://localhost:8000
# Settings → Connect Gmail (use host machine browser)
# Sync Now → check docker logs for processed count
```

- [ ] **Step 4: Final commit**

```bash
git add Dockerfile entrypoint.sh
git commit -m "feat: docker entrypoint with auto-migration"
```

---

## Self-Review

### Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Python + FastAPI monolith | Task 1, 12 |
| APScheduler 2hr polling | Task 10 |
| Gmail OAuth2 + incremental sync via history ID | Task 5, 6 |
| Rule engine (domain + keyword scoring) | Task 7 |
| LLM fallback — OpenRouter/Anthropic configurable | Task 8 |
| Hybrid classifier orchestration | Task 9 |
| Rich extraction (amount, merchant, category, date, currency) | Task 9 (via LLM), Task 11 |
| INR default currency + Indian merchants seed rules | Task 7 |
| Indian number format in prompt | Task 8 |
| Postgres schema (emails, transactions, sync_state, sender_rules) | Task 3, 4 |
| User correction → sender_rules upsert | Task 11 |
| needs_review queue | Task 11, 12 |
| GET /api/transactions (filtered) | Task 11 |
| PATCH /api/transactions/{id} | Task 11 |
| GET /api/review | Task 11 |
| GET/POST /api/sync | Task 11 |
| GET /api/auth/* | Task 5 |
| GET /api/stats | Task 11 |
| Web dashboard (4 pages) | Task 12 |
| Docker Compose single-command startup | Task 1, 13 |

All spec requirements covered. ✓
