<div align="center">
  <br/>
  <img src="https://img.shields.io/badge/Python-3.12-blue?style=flat-square&logo=python" alt="Python 3.12"/>
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql" alt="PostgreSQL 16"/>
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react" alt="React 18"/>
  <img src="https://img.shields.io/badge/License-Apache%202.0-blue?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome"/>
  <a href="https://github.com/amansn7/GexpenseTracker-Public/actions/workflows/ci.yml"><img src="https://github.com/amansn7/GexpenseTracker-Public/actions/workflows/ci.yml/badge.svg?style=flat-square" alt="CI"/></a>
  <a href="https://amansn7.github.io/GexpenseTracker-Public/"><img src="https://img.shields.io/badge/docs-GitHub%20Pages-blue?style=flat-square" alt="Docs"/></a>
  <br/><br/>
  <h1>MoneyFlow</h1>
  <p><strong>Inbox for your money</strong> — automatically track expenses from Gmail · rule engine + multi-provider LLM · warm minimal design</p>
</div>

---

MoneyFlow syncs your Gmail inbox, classifies financial emails (bank alerts, invoices, receipts, UPI confirmations) using a two-stage pipeline (domain rules → multi-provider LLM fallback), and gives you a live dashboard of your spending — without manually entering a single transaction.

## Architecture at a Glance

```
┌─────────────┐    ┌─────────────────────────────────────┐    ┌────────────┐
│   Browser   │◄──►│          FastAPI Backend             │    │  PostgreSQL│
│  (React 18) │    │  ┌───────┐  ┌────────┐  ┌────────┐ │    │  / SQLite  │
│             │    │  │ Auth  │  │ Classi-│  │  Sync  │ │    │            │
│  Jinja2 SPA │    │  │(OAuth │  │ fier   │  │(Gmail) │ │    │  Alembic   │
│  + esbuild  │    │  │ +2FA) │  │ Rules  │  │        │ │    │ migrations │
│             │    │  │       │  │ └─►LLM │  │        │ │    └────────────┘
│  3 themes   │    │  └───────┘  └────────┘  └────────┘ │    ┌────────────┐
└─────────────┘    │  ┌────────┐  ┌────────┐            │    │   Redis    │
                   │  │ Stats  │  │Dedup   │            │◄──►│   (queue   │
                   │  │Rollups │  │Engine  │            │    │  + cache)  │
                   │  └────────┘  └────────┘            │    └────────────┘
                   └─────────────────────────────────────┘    ┌────────────┐
                        │            │                        │   Gmail    │
                        ▼            ▼                        │   API      │
                   ┌──────────┐ ┌──────────┐                  └────────────┘
                   │  ARQ     │ │  LLM     │
                   │  Worker  │ │ Gemini   │
                   │          │ │ Grok     │
                   └──────────┘ │ Groq     │
                                │ OpenRoute│
                                └──────────┘
```

## Features

### Automatic Gmail Sync
- **Incremental sync** using Gmail history IDs — only fetches new messages
- **90-day fallback** when history ID expires
- Configurable filter: all mail, unread only, read only, or financial-only
- Manual re-scan via one-click button with live progress polling

### Intelligent Classification Pipeline
- **Rule engine** — sender-domain lookup (18 built-in vendors: Swiggy, Amazon, HDFC, Zomato, Uber, etc.) + keyword scoring
- **Multi-provider LLM fallback** — calls Gemini, Grok, Groq, Scaleway, OpenRouter, or Cloudflare when rules are uncertain
- **Provider priority queue** — user-configured → auto fallback with rate-limit backoff and persistent demotion
- **Batch classification** — multiple emails per LLM call for efficiency
- **7 response-repair strategies** for malformed LLM JSON

### Views (7 Screens)

| View | Description |
|------|-------------|
| **Inbox** | Gmail-style transaction list with date grouping, inline row expansion (email body + AI fields), category picker, bulk actions, duplicate pair resolution, review queue |
| **Money Flow** | Sankey-style income→expense flow diagram + weekly burn chart + KPI cards |
| **Dashboard** | Monthly snapshot — cumulative balance chart, daily burn, subscriptions, category breakdown, top merchants, budget progress bars |
| **Health** | Savings rate, runway months, current balance, monthly net bar chart (3/6/12m toggle) |
| **Reports** | 12-month summary table — income / expenses / net / savings rate per month |
| **Recurring** | CRUD for subscriptions & fixed expenses + AI suggestions from transaction history |
| **Debt** | CRUD for loans, EMIs, credit cards — progress tracking & payoff goals |

### Learning & Adaptation
- **Auto-learn from corrections** — fixing a transaction creates a sender-domain rule
- **Bulk retrain** — persist labels as domain rules in one click
- **Fuzzy merchant aliasing** — similar names auto-linked via `rapidfuzz`
- **Duplicate pair learning** — confirmed/dismissed decisions auto-resolve at ≥85% confidence

### Duplicate Detection
- **Same-domain**: same sender, same amount, ±3 days
- **Cross-domain**: different senders, same amount, ±1 day
- **Investment flow**: "order sent" + "confirmation" pair detection

### Review Queue
- Low-confidence transactions surface for review
- Keyboard shortcuts: `E` (expense), `I` (income), `S` (skip), `Enter` (confirm)
- Corrections automatically train domain rules

### Search, Filters & Themes
- **Global search** — `Cmd+K` across merchants, categories, amounts, email subjects
- **Category & date range** filters in every view
- **3 themes**: Paper (warm cream), Cool (gray-blue), Midnight (dark charcoal)
- **Sync indicator** — animated green dot: "Gmail · just now" / "Gmail · 5m ago"

### Account & Security
- Google OAuth 2.0 with optional TOTP 2FA
- Passkey (WebAuthn) support for passwordless login
- Multi-user via email allowlist (owner + members)
- Custom sender rules + user-configured AI service (bring your own LLM key)
- Account deletion (scheduled or immediate)
- CSP, HSTS, X-Frame-Options, CSRF double-submit cookie pattern, rate limiting

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI (async) + SQLAlchemy 2.0 async + Alembic |
| **Database** | PostgreSQL 16 (prod) / SQLite (dev) |
| **Frontend** | Vanilla JSX (esbuild → React 18 CDN) + Jinja2 shell |
| **Gmail** | Google OAuth 2.0 + Gmail REST API |
| **LLM** | Gemini, Grok (xAI), Groq, Scaleway, OpenRouter, Cloudflare Workers AI, FreeLLMAPI |
| **Auth** | Google OAuth, TOTP 2FA, WebAuthn/Passkeys, JWT (RS256), session cookies |
| **Scheduler** | APScheduler (async) |
| **Task Queue** | ARQ (Redis-backed) with in-memory fallback |
| **Container** | Docker + docker-compose |
| **Deploy** | Railway (via Dockerfile) |
| **Mobile** | Capacitor (iOS) |
| **Testing** | pytest, pytest-asyncio, pytest-mock, Playwright, axe-core |

---

## Quick Start

Two modes:

| Mode | Dependencies | Best for |
|------|-------------|----------|
| **Local** | None — SQLite + in-memory queue | Trying it out, personal use |
| **Cloud** | PostgreSQL, Redis, Google OAuth + Gmail API | Multi-user, Gmail sync |

### 🏠 Local Mode (one command)

```bash
git clone https://github.com/amansn7/GexpenseTracker-Public.git
cd GexpenseTracker-Public
bash scripts/setup-local.sh
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) and click **"Start locally"**.

> Add transactions manually. Zero external services. CSV export is also available.

### 🐳 Docker (local mode)

```bash
docker compose -f docker-compose.local.yml up --build
```

Open [http://localhost:8000](http://localhost:8000).

### ☁️ Cloud Mode (Gmail sync)

```bash
cp .env.example .env
# Edit .env: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SECRET_KEY, FERNET_KEY, REDIS_URL
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/expense_tracker"
alembic upgrade head
uvicorn app.main:app --reload
```

### 🔨 Build Frontend (if editing JSX)

```bash
node scripts/build-frontend.mjs          # one-shot build
node scripts/build-frontend.mjs --watch  # dev watch mode
```

### 🔗 Setup Gmail (cloud mode)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Gmail API**, create OAuth 2.0 credentials (Web application)
3. Set redirect URI to `http://localhost:8000/api/auth/callback`
4. Sign in with Google at [http://localhost:8000](http://localhost:8000)

---

## Project Structure

```
├── app/                    # FastAPI backend
│   ├── main.py             # App factory + middleware stack
│   ├── config.py           # Pydantic settings (env vars)
│   ├── database.py         # Async SQLAlchemy engine + session
│   ├── auth_deps.py        # get_current_user() dependency
│   ├── api/                # 26 route modules
│   ├── classifier/         # Classification pipeline (rule engine → LLM)
│   │   ├── rules.py        # 18 built-in vendor rules
│   │   ├── llm/            # Multi-provider LLM client
│   │   ├── merchant.py     # Fuzzy merchant matching
│   │   └── pre_filter.py   # Email pre-filtering
│   ├── gmail/              # Gmail OAuth + API client
│   ├── sync/               # Sync orchestration (fetch → classify → persist)
│   ├── dedup/              # 3-strategy duplicate detection
│   ├── models/             # 14 SQLAlchemy models
│   ├── services/           # Business logic services
│   └── workers/            # Background workers (ARQ)
├── static/                 # Frontend assets
│   ├── src/                # JSX source (React 18, esbuild-bundled, 48 files)
│   └── styles.css          # CSS variables + theme classes + all styles
├── templates/              # Jinja2 HTML shell
├── tests/                  # 80+ pytest files + Playwright E2E
├── alembic/                # 70+ database migrations
├── scripts/                # Build, setup, migration helpers
├── Dockerfile              # Multi-stage build (python:3.12-slim)
├── docker-compose.yml      # Cloud mode (PostgreSQL + Redis)
└── docker-compose.local.yml # Local mode (SQLite, zero dependencies)
```

---

## API Documentation

Full API reference at [API_DOCS.md](./API_DOCS.md). Key endpoint groups:

| Group | Base Path | Description |
|-------|-----------|-------------|
| Auth | `/api/auth/*` | Google OAuth, local login, sessions, 2FA, passkeys |
| Transactions | `/api/transactions` | CRUD, search, export, bulk actions, reclassify |
| Stats | `/api/stats/*` | Summary, category breakdown, health, trends |
| Sync | `/api/sync/*` | Gmail sync trigger, progress, backfill |
| Review | `/api/review` | Review queue, batch reprocess |
| Budgets | `/api/budgets` | Budget CRUD, budget links |
| Rules | `/api/rules` | Sender rules, pattern rules, rule tester |
| Goals | `/api/goals` | Savings goals + contributions |
| Debt | `/api/debts` | Loan/EMI/CC debt tracking |
| Recurring | `/api/recurring` | Subscriptions + AI suggestions |
| Insights | `/api/insights` | Spending insights, patterns, compare |
| Settings | `/api/account/*` | Profile, categories, AI services, 2FA, deletion |
| Admin | `/api/admin/*` | Owner-only: fetch preview, classify test, audit logs |

---

## Development

### Running Tests

```bash
pytest -v --tb=short                               # unit tests (skips LLM tests)
pytest -v --tb=short --cov=app --cov-report=term-missing  # with coverage
npm run test                                        # Playwright E2E
```

### Database Migrations

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

> **PostgreSQL migration note**: Before running migration 0040, run `python -m app.scripts.dedup_before_migration --dry-run` first. If clean, execute with `--execute`.

### Manual Sync

```bash
curl -X POST http://localhost:8000/api/sync/trigger
```

### Code Quality

```bash
ruff check app/ tests/         # Lint
ruff format --check app/ tests/ # Format check
mypy app/config.py app/database.py  # Type check (select modules)
```

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for:
- Railway deployment (1-click)
- Docker Compose (cloud + local modes)
- Production checklist (secrets, HTTPS, CORS)
- Environment variable reference

---

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities. The application implements:
- CSP with nonce-based script-src
- CSRF double-submit cookie pattern
- Rate limiting on auth endpoints
- Encrypted credentials at rest (Fernet)
- Audit logging for state-changing operations
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/amansn7">Aman Saini</a></sub>
</div>
