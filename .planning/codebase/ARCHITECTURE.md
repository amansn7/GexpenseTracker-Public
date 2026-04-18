# Architecture

**Analysis Date:** 2026-04-11

## Pattern Overview

**Overall:** Monolithic async Python web application with layered internal structure

**Key Characteristics:**
- Single FastAPI process handles HTTP, background scheduling, and all business logic
- Full async throughout (asyncio, SQLAlchemy async, httpx async) — sync Gmail API calls are wrapped in `asyncio.to_thread`
- Single-user app (no multi-tenancy, no session management beyond OAuth token file)
- Domain-driven module split: `gmail/`, `classifier/`, `api/`, with `sync.py` orchestrating them

## Layers

**API Layer:**
- Purpose: HTTP request handling, input validation, response formatting
- Location: `app/api/`
- Contains: FastAPI routers — `auth.py`, `transactions.py`, `review.py`, `sync.py`, `rules.py`, `recurring.py`, `stats.py`, `budgets.py`
- Depends on: `app/database.py`, `app/models.py`, `app/sync.py`, `app/alerts.py`
- Used by: FastAPI app in `app/main.py`

**Sync Orchestration Layer:**
- Purpose: Coordinates Gmail fetch + classify pipeline, manages progress state
- Location: `app/sync.py`
- Contains: `run_sync()`, `get_sync_progress()`, in-process `_sync_progress` dict
- Depends on: `app/gmail/client.py`, `app/classifier/classifier.py`, `app/database.py`
- Used by: `app/api/sync.py` (manual trigger), `app/scheduler.py` (scheduled)

**Gmail Integration Layer:**
- Purpose: OAuth2 auth management and email fetching from Gmail API
- Location: `app/gmail/`
- Contains: `client.py` (fetch emails), `auth.py` (OAuth flow, credential persistence)
- Depends on: Google API client library, `data/token.json` (credential file)
- Used by: `app/sync.py`

**Classifier Layer:**
- Purpose: Classify emails as expense/income/ignore and extract financial details
- Location: `app/classifier/`
- Contains: `classifier.py` (orchestration), `rules.py` (rule-based engine), `llm_client.py` (multi-provider LLM)
- Depends on: `app/config.py`, `httpx`
- Used by: `app/sync.py`

**Data Layer:**
- Purpose: Database models, migrations, async session factory
- Location: `app/models.py`, `app/database.py`, `alembic/`
- Contains: SQLAlchemy ORM models, `get_db()` FastAPI dependency, Alembic migrations
- Depends on: PostgreSQL (production) or SQLite (test)
- Used by: all API routers via `Depends(get_db)`, `app/sync.py`

**Config Layer:**
- Purpose: Centralized settings from environment
- Location: `app/config.py`
- Contains: pydantic-settings `Settings` class, singleton `settings` instance
- Depends on: `.env` file
- Used by: All layers

**Frontend Layer:**
- Purpose: Browser-side UI — SPA behavior via vanilla JS
- Location: `static/app.js`, `templates/*.html`
- Contains: Dashboard charts, transaction table, budget/recurring views
- Depends on: REST API endpoints under `/api/`
- Serves: Jinja2 template shells (no SSR data, all data fetched via JS)

## Data Flow

**Gmail Sync (primary flow):**

1. Trigger: APScheduler interval job (`app/scheduler.py`) or `POST /api/sync/trigger`
2. `app/sync.py:run_sync()` reads `SyncState` to get `last_history_id` and email filter
3. `app/gmail/client.py:fetch_new_messages()` calls Gmail API (sync, wrapped in `asyncio.to_thread`)
4. New emails are deduplicated against `Email` table, inserted, flushed to DB
5. All new emails are classified concurrently via `asyncio.gather` (capped at 8 concurrent LLM calls via `asyncio.Semaphore`)
6. For each email: `app/classifier/classifier.py:classify_email()` runs rule engine first, then optionally calls LLM
7. `Transaction` rows are written for each classified email
8. `SyncState` is updated with new `last_history_id`, session committed

**Classification Decision Tree:**
1. Apply sender-domain rules (`app/classifier/rules.py`)
2. If rule confidence >= `LLM_CONFIDENCE_THRESHOLD` (0.85): accept rule label, optionally call LLM extraction-only for financial details
3. If rule confidence == 0.0: mark as `ignore`, `needs_review`
4. Otherwise (partial signal): call LLM `classify` (label + extract)
5. If LLM fails: fall back to rule label or `ignore`

**User Review Flow:**
1. `GET /api/review` returns transactions with `needs_review` status
2. User confirms/corrects via `PATCH /api/transactions/{id}`
3. Correction auto-generates/updates `SenderRule` for that sender domain

## Key Abstractions

**ClassificationResult (dataclass):**
- Purpose: Unified output from classifier, regardless of rule or LLM path
- Examples: `app/classifier/classifier.py`
- Pattern: Dataclass with label, amount, merchant, category, txn_date, confidence, status, method

**MultiLLMClient:**
- Purpose: Transparent multi-provider LLM with automatic rate-limit fallback and priority scoring
- Examples: `app/classifier/llm_client.py`
- Pattern: Singleton `llm_client` instance; providers ranked at call time by `priority_score`

**SyncState (ORM model):**
- Purpose: Persists Gmail sync cursor (`last_history_id`) and email filter setting
- Examples: `app/models.py`, `app/sync.py`
- Pattern: Single row, id=1, updated in-place after each sync

**In-memory Alert Store:**
- Purpose: Non-persistent notifications for LLM/service issues, surfaced on dashboard
- Examples: `app/alerts.py`
- Pattern: `collections.deque(maxlen=20)`, module-level singleton, cleared by user action

## Entry Points

**HTTP Server:**
- Location: `app/main.py`
- Triggers: `uvicorn app.main:app` (via `entrypoint.sh`)
- Responsibilities: Mount static files, register all routers, serve Jinja2 page shells, start/stop APScheduler

**Scheduler:**
- Location: `app/scheduler.py`
- Triggers: FastAPI lifespan startup (skipped when `TESTING=1` env var set)
- Responsibilities: Run `run_sync()` every `SYNC_INTERVAL_HOURS`

**Database Migrations:**
- Location: `alembic/` with versions `0001` through `0004`
- Triggers: Manual `alembic upgrade head` or `entrypoint.sh`

## Error Handling

**Strategy:** Fail-safe with fallback — errors are caught, logged, and either surfaced as alerts or cause graceful degradation

**Patterns:**
- LLM failures: caught per-provider, provider marked failed/rate-limited, next provider tried; if all fail, exception raised and caught in sync orchestrator
- Gmail fetch failures: caught in `run_sync`, progress marked as `error`, exception re-raised
- Per-email classification failures: `asyncio.gather(return_exceptions=True)` — failed emails get `needs_review` transaction inserted, sync continues
- Gmail 404 on message get: skipped with debug log (message deleted between list and get)

## Cross-Cutting Concerns

**Logging:** `logging.basicConfig` in `app/main.py`, INFO level, stdout, module-level loggers (`logger = logging.getLogger(__name__)`) throughout
**Validation:** Pydantic models on API request bodies; SQLAlchemy type checking on ORM writes
**Authentication:** Single-user Google OAuth2; `is_authenticated()` checks token file existence; no middleware enforcement (routes are open except Gmail API calls which raise at service build time)

---

*Architecture analysis: 2026-04-11*
