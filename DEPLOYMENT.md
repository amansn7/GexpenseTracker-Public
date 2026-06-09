# MoneyFlow Deployment Guide

MoneyFlow supports three deployment modes, each with different tradeoffs:

| Mode | Dependencies | Effort | Best For |
|------|-------------|--------|----------|
| **Local (bare metal)** | Python 3.12+ | Minimal | Personal testing, development |
| **Local (Docker)** | Docker | Minimal | Isolated personal use |
| **Cloud (Docker Compose)** | Docker, PostgreSQL 16, Redis 7 | Medium | Self-hosted multi-user |
| **Railway** | Railway account | Low | Production hosted |

---

## Prerequisites

- Python 3.11+ (3.12 recommended)
- pip and venv
- Node.js 20+ (for frontend development — pre-built dist/ included)
- Docker + Docker Compose (for containerized deployments)
- A [Google Cloud Console](https://console.cloud.google.com/) project with Gmail API enabled (cloud mode only)

---

## 1. Local Mode (bare metal)

One-command setup:

```bash
git clone https://github.com/amansn7/GexpenseTracker-Public.git
cd GexpenseTracker-Public
bash scripts/setup-local.sh
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**What setup-local.sh does:**
1. Checks Python 3.11+ and Node.js
2. Creates `.env` with `LOCAL_MODE=true`, auto-generated `SECRET_KEY` and `FERNET_KEY`
3. Creates Python virtual environment (`.venv/`)
4. Installs pip dependencies
5. Runs `alembic upgrade head` to create SQLite tables
6. Builds frontend via esbuild (or uses pre-built dist/)

Open [http://localhost:8000](http://localhost:8000) and click **"Start locally"**.

### Manual local setup (without setup script)

```bash
cp .env.example .env
# Edit .env:
#   LOCAL_MODE=true
#   DATABASE_URL=sqlite+aiosqlite:///./data/expense.db
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data
alembic upgrade head
node scripts/build-frontend.mjs   # or skip: dist/ is pre-built
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 2. Local Mode (Docker)

```bash
docker compose -f docker-compose.local.yml up --build
```

This starts a single container with:
- SQLite database stored in `./data/expense.db`
- In-memory task queue (no Redis)
- Local auth (no Google OAuth)
- Auto-generated secrets

The `.env` file is optional; `docker-compose.local.yml` sets `LOCAL_MODE=true` and `DATABASE_URL` automatically.

Open [http://localhost:8000](http://localhost:8000).

---

## 3. Cloud Mode (Docker Compose)

For multi-user deployments with Gmail sync support.

### Step 1: Set up Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs: `http://localhost:8000/api/auth/callback` (dev), `https://yourdomain.com/api/auth/callback` (prod)
7. Note the **Client ID** and **Client Secret**

### Step 2: Configure environment

```bash
cp .env.example .env
```

Edit `.env` with these **required** values:

```ini
# Database
DATABASE_URL=postgresql+asyncpg://expense:your-strong-password@db:5432/expense_tracker
POSTGRES_PASSWORD=your-strong-password

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/callback

# Security (generate unique values)
SECRET_KEY=<random-64-char-string>
FERNET_KEY=<run: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">

# JWT keys (for mobile auth)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."

# Redis (for task queue)
REDIS_URL=redis://redis:6379/0

# Production
COOKIE_SECURE=true
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Step 3: Generate JWT key pair (for mobile/Bearer auth)

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

Copy the PEM content into `.env` as single-line values (replace `\n` with actual newlines, or use `\n` escape sequences — the config parser handles both).

### Step 4: Launch

```bash
docker compose up --build -d
```

This starts three services:
- **db**: PostgreSQL 16 with health check
- **redis**: Redis 7 with health check
- **app**: MoneyFlow (FastAPI on port 8000)

### Step 5: Verify

```bash
# Check all services are healthy
docker compose ps

# View logs
docker compose logs -f app

# Health check
curl http://localhost:8000/health
```

---

## 4. Railway Deployment

MoneyFlow includes native Railway support.

### One-click deploy (template)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/...)

### Manual Railway deploy

1. **Push to GitHub** and connect repo to Railway
2. **Set build command**: (uses Dockerfile automatically)
3. **Set start command**: (handled by entrypoint.sh and Dockerfile)

### Environment variables (Railway)

Railway auto-provisions PostgreSQL and Redis via plugins. Set these:

| Variable | Value | Required |
|----------|-------|----------|
| `GOOGLE_CLIENT_ID` | Your OAuth client ID | Yes (unless local mode) |
| `GOOGLE_CLIENT_SECRET` | Your OAuth client secret | Yes |
| `GOOGLE_REDIRECT_URI` | `https://your-app.railway.app/api/auth/callback` | Yes |
| `SECRET_KEY` | Random 64+ char string | Yes |
| `FERNET_KEY` | Fernet-generated key | Yes |
| `JWT_PRIVATE_KEY` | RSA private key (PEM) | For mobile auth |
| `JWT_PUBLIC_KEY` | RSA public key (PEM) | For mobile auth |
| `COOKIE_SECURE` | `true` | Yes |
| `CORS_ORIGINS` | Your Railway app URL | Recommended |

Railway automatically sets:
- `DATABASE_URL` (via PostgreSQL plugin)
- `REDIS_URL` (via Redis plugin)
- `PORT` (Railway's assigned port)
- `RAILWAY_ENVIRONMENT` (detected by entrypoint.sh to skip DB wait)

### Important notes for Railway

- The `entrypoint.sh` skips the TCP database wait loop when `RAILWAY_ENVIRONMENT` is set
- Health checks point at `GET /health`
- The Dockerfile uses a non-root `appuser` for security
- Static files are served by FastAPI (no nginx needed for simple deployments)
- For production, consider adding a Redis plugin for the task queue

---

## 5. Production Checklist

Before going live, verify each item:

### Security

- [ ] `SECRET_KEY` is a long random value (64+ chars, not `change-me-in-production`)
- [ ] `FERNET_KEY` is generated via `Fernet.generate_key().decode()`
- [ ] `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` are set for mobile auth
- [ ] `COOKIE_SECURE=true` (requires HTTPS)
- [ ] `CORS_ORIGINS` is set to your production domain(s)
- [ ] `POSTGRES_PASSWORD` is a strong unique password
- [ ] Invite code is set if the app should be private: `INVITE_CODE=your-code`
- [ ] CSP headers are active (enabled by default via `SecurityHeadersMiddleware`)

### Database

- [ ] `DATABASE_URL` points to production PostgreSQL (not SQLite)
- [ ] Migration 0040 preflight has been run:

```bash
python -m app.scripts.dedup_before_migration --dry-run
# If clean:
python -m app.scripts.dedup_before_migration --execute
```

- [ ] Connection pool settings are tuned for your load (defaults: pool_size=20, max_overflow=30)

### Monitoring

- [ ] Sentry DSN configured: `SENTRY_DSN=https://...`
- [ ] Log level set: `LOG_LEVEL=INFO` (default) or `WARNING` in production
- [ ] Health check endpoint is monitored (`GET /health` and `GET /api/health/ready`)

### Performance

- [ ] Frontend is built for production: `node scripts/build-frontend.mjs`
- [ ] Cache headers: build manifest includes `always_loaded_size_kb` budget check
- [ ] Database indexes are in place (run `alembic upgrade head` and verify via migration history)

---

## 6. Environment Variable Reference

### Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_MODE` | `false` | Use SQLite + in-memory queue + local auth. Auto-generates secrets. |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker` | Full async database URL |
| `DB_POOL_SIZE` | `20` | Connection pool size |
| `DB_MAX_OVERFLOW` | `30` | Max overflow connections |
| `DB_POOL_TIMEOUT` | `30` | Connection timeout (seconds) |
| `DB_POOL_RECYCLE` | `1800` | Connection recycle interval (seconds) |
| `DB_POOL_PRE_PING` | `true` | Verify connections before use |

### Google OAuth

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | — | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/callback` | OAuth redirect URI |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `change-me-in-production` | Session signing key (min 32 chars) |
| `FERNET_KEY` | — | Encryption key for TOTP secrets and tokens |
| `JWT_PRIVATE_KEY` | — | RSA private key for JWT signing (PEM) |
| `JWT_PUBLIC_KEY` | — | RSA public key for JWT verification (PEM) |
| `JWT_PUBLIC_KEY_OLD` | — | Previous public key for rotation |
| `COOKIE_SECURE` | `true` | Set secure flag on cookies (requires HTTPS) |
| `CORS_ORIGINS` | `http://localhost:8000` | Comma-separated allowed origins |

### LLM / AI

| Variable | Default | Description |
|----------|---------|-------------|
| `FREELLMAPI_API_KEY` | — | Shared proxy key for FreeLLMAPI |
| `FREELLMAPI_BASE_URL` | — | FreeLLMAPI proxy URL |
| `FREELLMAPI_MODEL` | — | Empty = proxy auto-selects |
| `ENABLE_LLM_TRIAL` | `false` | Enable 7-day free trial for new users |
| `TRIAL_DURATION_DAYS` | `7` | Trial duration in days |
| `OWNER_EMAIL` | — | Gets permanent FreeLLMAPI access |
| `LLM_CONFIDENCE_THRESHOLD` | `0.85` | Below this → LLM is called |
| `AUTO_CONFIRM_THRESHOLD` | `0.75` | Above this → auto-confirmed |
| `DAILY_LLM_BUDGET` | `10.0` | Global daily LLM budget (USD) |
| `LLM_BATCH_SIZE` | `5` | Emails per LLM batch call |

### Sync

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_INTERVAL_HOURS` | `2` | Hours between automatic syncs |
| `FETCH_CONCURRENCY` | `5` | Concurrent Gmail API fetches |
| `SYNC_PAGE_SIZE` | `50` | Emails per sync page |

### Task Queue

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | — | Redis URL (required for cloud mode) |
| `WORKER_COUNT` | `10` | Number of background workers |
| `DLQ_MAX_RETRIES` | `3` | Dead letter queue max retries |
| `TASK_TIMEOUT` | `300` | Task timeout (seconds) |

### Other

| Variable | Default | Description |
|----------|---------|-------------|
| `INVITE_CODE` | — | Private-beta invite gate |
| `DEV_MODE` | `false` | Show detailed error responses |
| `LOG_LEVEL` | `INFO` | Logging level |
| `SENTRY_DSN` | — | Sentry error tracking DSN |
| `SEED_USER_EMAIL` | `service@localhost` | Internal service account email |
| `PORT` | `8000` | Server port (overridden by Railway) |

---

## 7. Database Migrations

```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply pending migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1

# View history
alembic history
```

> **Important**: Before running migration 0040, execute the dedup preflight script:
> ```bash
> python -m app.scripts.dedup_before_migration --dry-run
> ```
> If it reports no issues, run with `--execute` to perform the data migration.

---

## 8. Frontend Build

```bash
# One-shot production build
node scripts/build-frontend.mjs

# Development watch mode
node scripts/build-frontend.mjs --watch
```

The build script uses esbuild to bundle JSX from `static/src/` into `static/dist/`. The SPA shell (`templates/index.html`) loads the bundle from CDN-served React 18.

---

## 9. Backup & Restore

### SQLite (local mode)

```bash
# Backup
cp data/expense.db data/expense.db.backup

# Restore
cp data/expense.db.backup data/expense.db
```

### PostgreSQL (cloud mode)

```bash
# Backup
pg_dump -h localhost -U expense expense_tracker > backup.sql

# Restore
psql -h localhost -U expense expense_tracker < backup.sql
```

---

## 10. Troubleshooting

### App won't start: "SECRET_KEY is still the default value"
Set `SECRET_KEY` to a long random string in `.env`.

### Gmail sync fails: "Gmail not authenticated"
Run through Google OAuth at `http://localhost:8000/api/auth/google` or check `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are correct.

### Database connection errors
- Check `DATABASE_URL` format (must use `postgresql+asyncpg://`)
- Verify PostgreSQL is running and accepting connections
- Check `DB_HOST`/`DB_PORT` environment variables if using non-default values

### "Migration 0040" errors
Run the dedup preflight script before applying migration 0040:

```bash
python -m app.scripts.dedup_before_migration --execute
```

### Frontend not loading
- Ensure `static/dist/` exists (run `node scripts/build-frontend.mjs`)
- Check browser console for CSP errors
- Verify the nonce-based CSP allows inline scripts

### LLM classification fails
- Go to Settings → AI to configure an AI service
- OR set `FREELLMAPI_API_KEY` and `FREELLMAPI_BASE_URL` for trial proxy access
- Check `/api/llm/status` for provider availability
