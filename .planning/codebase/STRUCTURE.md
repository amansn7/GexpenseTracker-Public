# Codebase Structure

**Analysis Date:** 2026-04-11

## Directory Layout

```
GexpenseTracker/
├── app/                    # All Python application code
│   ├── main.py             # FastAPI app factory, router registration, page routes
│   ├── config.py           # Pydantic-settings Settings class, singleton `settings`
│   ├── database.py         # Async engine, session factory, get_db() dependency
│   ├── models.py           # SQLAlchemy ORM models (all tables in one file)
│   ├── sync.py             # Gmail sync orchestration + progress state
│   ├── scheduler.py        # APScheduler setup for periodic sync
│   ├── alerts.py           # In-memory alert store
│   ├── api/                # FastAPI routers (one file per resource)
│   │   ├── auth.py         # /api/auth/* — Google OAuth2
│   │   ├── transactions.py # /api/transactions — CRUD
│   │   ├── review.py       # /api/review — needs_review queue
│   │   ├── sync.py         # /api/sync/* — trigger, progress, status
│   │   ├── rules.py        # /api/rules — sender rules CRUD
│   │   ├── recurring.py    # /api/recurring — recurring expenses CRUD
│   │   ├── stats.py        # /api/stats — analytics aggregates
│   │   └── budgets.py      # /api/budgets — budget limits CRUD
│   ├── classifier/         # Email classification logic
│   │   ├── classifier.py   # classify_email() orchestrator (rules + LLM)
│   │   ├── rules.py        # Rule-based engine (sender domain matching)
│   │   └── llm_client.py   # MultiLLMClient with multi-provider fallback
│   └── gmail/              # Gmail API integration
│       ├── client.py       # fetch_new_messages() — Gmail API calls
│       └── auth.py         # OAuth2 flow, token storage
├── alembic/                # Database migration scripts
│   ├── versions/
│   │   ├── 0001_initial.py
│   │   ├── 0002_email_filter.py
│   │   ├── 0003_recurring.py
│   │   └── 0004_budgets.py
│   └── env.py              # Alembic async migration runner config
├── templates/              # Jinja2 HTML page shells (thin, data loaded by JS)
│   ├── base.html           # Shared layout, nav
│   ├── dashboard.html
│   ├── transactions.html
│   ├── review.html
│   ├── settings.html
│   ├── recurring.html
│   └── budgets.html
├── static/
│   └── app.js              # All frontend JS (vanilla, no build step)
├── tests/                  # Pytest test suite
│   ├── conftest.py         # Fixtures (test DB, app client)
│   ├── test_api.py
│   ├── test_classifier.py
│   ├── test_config.py
│   ├── test_gmail_auth.py
│   ├── test_gmail_client.py
│   ├── test_llm_client.py
│   ├── test_models.py
│   ├── test_rules.py
│   └── test_sync.py
├── data/                   # Runtime data (Docker volume mount)
│   └── token.json          # Google OAuth2 token (written at runtime, not committed)
├── docs/                   # Project documentation
├── Dockerfile
├── docker-compose.yml
├── entrypoint.sh           # Container entrypoint (runs alembic upgrade + uvicorn)
├── alembic.ini
├── pytest.ini
└── requirements.txt
```

## Directory Purposes

**`app/`:**
- Purpose: All Python server-side code
- Contains: FastAPI app, ORM models, business logic, integrations
- Key files: `app/main.py` (entry), `app/models.py` (schema), `app/sync.py` (core pipeline)

**`app/api/`:**
- Purpose: One FastAPI `APIRouter` per resource domain
- Contains: Route handlers, Pydantic request/response models defined inline
- Key files: `app/api/transactions.py`, `app/api/sync.py`, `app/api/stats.py`

**`app/classifier/`:**
- Purpose: All classification logic — rules engine and LLM client
- Contains: `classify_email()` orchestrator, rule matching, multi-provider LLM
- Key files: `app/classifier/classifier.py`, `app/classifier/llm_client.py`

**`app/gmail/`:**
- Purpose: Gmail API integration and OAuth
- Contains: Message fetching, OAuth2 flow, token persistence
- Key files: `app/gmail/client.py`, `app/gmail/auth.py`

**`alembic/versions/`:**
- Purpose: Sequential migration files, numbered `0001`–`000N`
- Generated: Partially (Alembic-generated stubs, manually completed)
- Committed: Yes

**`static/`:**
- Purpose: Static frontend assets served directly
- Contains: Single `app.js` (all frontend logic)
- No build step — plain JavaScript, no npm, no bundler

**`templates/`:**
- Purpose: Jinja2 page shells — layout and initial HTML only
- Contains: `base.html` + one template per page route
- Note: No SSR data injection; all dynamic data fetched via JS from `/api/`

**`data/`:**
- Purpose: Runtime-written files (not committed)
- Contains: `token.json` (Google OAuth credential)
- Generated: Yes (written by `app/gmail/auth.py:save_credentials()`)
- Committed: No (Docker volume, `.gitignore` expected)

**`tests/`:**
- Purpose: Pytest test suite
- Contains: One test file per module, shared fixtures in `conftest.py`
- Uses SQLite in-memory DB for tests

## Key File Locations

**Entry Points:**
- `app/main.py`: FastAPI app factory, all router mounts, Jinja2 page routes, scheduler lifecycle
- `entrypoint.sh`: Container start — runs `alembic upgrade head` then `uvicorn`

**Configuration:**
- `app/config.py`: All settings, sourced from `.env`
- `alembic.ini`: Alembic migration config
- `pytest.ini`: Pytest settings (asyncio mode, test paths)
- `docker-compose.yml`: Local dev orchestration

**Core Logic:**
- `app/sync.py`: Gmail sync pipeline (the most important file in the app)
- `app/classifier/classifier.py`: Classification decision tree
- `app/classifier/llm_client.py`: LLM multi-provider client
- `app/models.py`: All ORM table definitions

**Testing:**
- `tests/conftest.py`: Test DB setup, async client fixtures

## Naming Conventions

**Files:**
- Modules: `snake_case.py`
- API routers: named after resource noun (`transactions.py`, `budgets.py`)
- Tests: `test_{module}.py`

**Directories:**
- Lowercase, short nouns (`api/`, `classifier/`, `gmail/`)

## Where to Add New Code

**New API endpoint / resource:**
- Create router: `app/api/{resource}.py`
- Register in: `app/main.py` — add `app.include_router()`
- Add page template: `templates/{resource}.html`
- Add nav link: `templates/base.html`

**New ORM model / table:**
- Add class to: `app/models.py`
- Generate migration: `alembic revision --autogenerate -m "description"` → edit → `alembic upgrade head`

**New classifier rule or LLM provider:**
- Rules: `app/classifier/rules.py`
- New LLM provider: `app/classifier/llm_client.py` — add `_Provider` in `_build_providers()`

**New scheduled job:**
- `app/scheduler.py` — add `scheduler.add_job()`

**Utilities / shared helpers:**
- Keep in closest relevant module (no separate `utils/` directory exists)
- Cross-cutting helpers (like alerts): `app/{name}.py` at app root level

**Tests:**
- New test file: `tests/test_{module}.py`
- Shared fixtures: `tests/conftest.py`

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by GSD mapper)
- Committed: Conditionally

**`.claude/`:**
- Purpose: Claude Code skills and agent configuration
- Committed: Yes

**`docs/`:**
- Purpose: Project planning specs and superpowers plans
- Committed: Yes

---

*Structure analysis: 2026-04-11*
