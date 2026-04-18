# Technology Stack

**Analysis Date:** 2026-04-11

## Languages

**Primary:**
- Python 3.12 - Backend server, API, sync logic, ML classification
- JavaScript (ES2020+, no transpilation) - Frontend SPA logic in `static/app.js`
- HTML/Jinja2 - Server-rendered page shells in `templates/`

## Runtime

**Environment:**
- Python 3.12 (CPython slim Docker image)
- No Node.js runtime — JS is plain vanilla, served as static files

**Package Manager:**
- pip (no lockfile beyond `requirements.txt`)
- Lockfile: Not present (only `requirements.txt` with pinned versions)

## Frameworks

**Core:**
- FastAPI 0.115.0 - HTTP server, routing, dependency injection, OpenAPI docs
- Uvicorn 0.30.6 (with standard extras) - ASGI server

**ORM / Database:**
- SQLAlchemy 2.0.36 (asyncio flavor) - ORM and query builder
- Alembic 1.13.3 - Database migrations

**Async:**
- asyncpg 0.30.0 - Async PostgreSQL driver (production)
- aiosqlite 0.20.0 - Async SQLite driver (test/dev fallback)
- psycopg2-binary 2.9.10 - Sync PostgreSQL driver (used by Alembic migrations)

**Scheduling:**
- APScheduler 3.10.4 - Recurring Gmail sync job via `AsyncIOScheduler`

**Config:**
- pydantic-settings 2.6.1 - Settings loaded from `.env` via `app/config.py`

**Templating:**
- Jinja2 3.1.4 - HTML template rendering (server-side, thin shells only)

**HTTP Client:**
- httpx 0.27.2 - Async HTTP calls to LLM provider APIs

**Testing:**
- pytest 8.3.3
- pytest-asyncio 0.24.0
- pytest-mock 3.14.0

**Build/Dev:**
- Docker + Docker Compose (PostgreSQL 16-alpine + app container)

## Key Dependencies

**Critical:**
- `fastapi` - Entire API surface and routing
- `sqlalchemy[asyncio]` - All database access
- `google-api-python-client` + `google-auth-oauthlib` - Gmail OAuth2 and API calls
- `httpx` - LLM provider HTTP calls (OpenRouter, Google Gemini, xAI Grok, Scaleway)
- `apscheduler` - Scheduled Gmail sync (every N hours, configurable)

**Infrastructure:**
- `python-multipart` 0.0.12 - Form data parsing for FastAPI
- `pydantic-settings` - All config/env management

## Configuration

**Environment:**
- All settings via `.env` file, read by `app/config.py` (pydantic-settings `BaseSettings`)
- Key required vars: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENROUTER_API_KEY` (or any LLM key)
- Optional LLM provider keys: `GOOGLE_AI_API_KEY`, `GROK_API_KEY`, `SCALEWAY_API_KEY`, `ANTHROPIC_API_KEY`
- `SECRET_KEY` for session security (default is insecure placeholder)

**Build:**
- `Dockerfile` - python:3.12-slim, non-root `appuser`, runs `entrypoint.sh`
- `docker-compose.yml` - PostgreSQL 16-alpine + app; `DATABASE_URL` injected via environment
- `alembic.ini` - Migration configuration
- `pytest.ini` - Test configuration

## Platform Requirements

**Development:**
- Python 3.12+
- PostgreSQL 16 (or SQLite for tests via `aiosqlite`)
- Google Cloud project with Gmail API + OAuth2 credentials

**Production:**
- Docker Compose (single-host)
- PostgreSQL 16 external or containerized
- `.env` with all secrets

---

*Stack analysis: 2026-04-11*
