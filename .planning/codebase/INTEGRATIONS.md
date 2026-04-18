# External Integrations

**Analysis Date:** 2026-04-11

## APIs & External Services

**Gmail (Google):**
- Gmail REST API v1 - Fetch emails for expense parsing
  - SDK/Client: `google-api-python-client` (`googleapiclient.discovery.build`)
  - Auth: OAuth2 via `google-auth-oauthlib`
  - Credentials stored to disk: `data/token.json` (persisted volume in Docker)
  - Scopes: `gmail.readonly`
  - Implementation: `app/gmail/client.py`, `app/gmail/auth.py`
  - Auth flow endpoints: `GET /api/auth/gmail` → `GET /api/auth/callback`

**LLM Providers (multi-provider with fallback):**
- All providers use OpenAI-compatible `/chat/completions` endpoint via `httpx`
- Client: `app/classifier/llm_client.py` — `MultiLLMClient` with automatic rate-limit fallback
- Priority order (runtime, re-sorted by error rate): Google Gemini → Grok → Scaleway → OpenRouter
- Provider details:
  - **OpenRouter** — `https://openrouter.ai/api/v1`, key: `OPENROUTER_API_KEY`, model: configurable via `LLM_MODEL`
  - **Google Gemini** — `https://generativelanguage.googleapis.com/v1beta/openai`, key: `GOOGLE_AI_API_KEY`, model: `gemini-2.0-flash-exp`
  - **xAI Grok** — `https://api.x.ai/v1`, key: `GROK_API_KEY`, model: `grok-3-mini`
  - **Scaleway** — `https://api.scaleway.ai/v1`, key: `SCALEWAY_API_KEY`, model: `llama-3.3-70b-instruct`
  - **Anthropic** — key: `ANTHROPIC_API_KEY` (configured in settings but no provider registered in current `_build_providers`)

## Data Storage

**Databases:**
- PostgreSQL 16 (production)
  - Connection env var: `DATABASE_URL` (format: `postgresql+asyncpg://...`)
  - Client: SQLAlchemy 2.0 async + asyncpg driver
  - Migrations: Alembic (`alembic/versions/`)
- SQLite (test/dev)
  - Used in tests via `aiosqlite`; `DATABASE_URL` overridden to `sqlite+aiosqlite:///...`

**File Storage:**
- Local filesystem: `data/` directory
  - `data/token.json` — Google OAuth2 credentials (persisted via Docker volume mount)

**Caching:**
- None (no Redis or in-memory cache beyond the in-process `_sync_progress` dict and `_alerts` deque in `app/alerts.py`)

## Authentication & Identity

**Auth Provider:**
- Google OAuth2 (Gmail-only scope, single user)
  - Implementation: `app/gmail/auth.py` — `get_oauth_flow()`, `save_credentials()`, `is_authenticated()`
  - Flow: Authorization Code Grant, redirects to `GOOGLE_REDIRECT_URI`
  - No user accounts/sessions — single-user app, auth state is presence of `data/token.json`

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry or external service)

**Alerts:**
- In-memory deque (`collections.deque`, maxlen=20) in `app/alerts.py`
- Surfaced via `GET /api/stats` or dedicated alerts endpoint on the dashboard
- Sources: `llm` (rate limits, provider failures), other backend events

**Logs:**
- `logging.basicConfig` in `app/main.py` — stdout, INFO level, format: `%(asctime)s %(levelname)s %(name)s: %(message)s`
- No structured logging, no log aggregation service

## CI/CD & Deployment

**Hosting:**
- Docker Compose (single-host, self-hosted)
- `Dockerfile`: python:3.12-slim, non-root `appuser`, runs `entrypoint.sh`

**CI Pipeline:**
- Not detected (no `.github/workflows/`, no CI config files present)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_CLIENT_ID` - Google OAuth2 app client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth2 app client secret
- `GOOGLE_REDIRECT_URI` - OAuth2 redirect (default: `http://localhost:8000/api/auth/callback`)
- At least one LLM key: `OPENROUTER_API_KEY`, `GOOGLE_AI_API_KEY`, `GROK_API_KEY`, or `SCALEWAY_API_KEY`
- `SECRET_KEY` - App secret (insecure default, must override in production)

**Optional env vars:**
- `LLM_PROVIDER` - Primary provider selection (default: `openrouter`)
- `LLM_MODEL` - Model name for OpenRouter (default: `google/gemini-2.0-flash-exp:free`)
- `LLM_CONFIDENCE_THRESHOLD` - Threshold above which rule result is accepted without LLM (default: 0.85)
- `AUTO_CONFIRM_THRESHOLD` - Threshold above which transaction is auto-confirmed (default: 0.75)
- `SYNC_INTERVAL_HOURS` - Gmail sync interval (default: 2)
- `ANTHROPIC_API_KEY` - Not currently used in provider list (reserved)

**Secrets location:**
- `.env` file (not committed to git)
- `data/token.json` - OAuth token file, written at runtime

## Webhooks & Callbacks

**Incoming:**
- `GET /api/auth/callback` - Google OAuth2 redirect after user grants access

**Outgoing:**
- None (no webhooks sent by the app)

---

*Integration audit: 2026-04-11*
