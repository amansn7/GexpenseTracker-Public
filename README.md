# MoneyFlow

> **Inbox for your money** — automatically track expenses from Gmail using a rule engine + multi-provider LLM, with a warm, minimal design.

MoneyFlow syncs your Gmail inbox, classifies financial emails (bank alerts, invoices, receipts, UPI confirmations) using a two-stage pipeline (domain rules → LLM fallback), and gives you a live dashboard of your spending — without manually entering a single transaction.

---

## Features

### Automatic Gmail Sync
- Incremental sync using Gmail history IDs — only fetches new messages
- 90-day fallback when history ID expires
- Configurable filter: all mail, unread only, read only, or financial-only
- Manual re-scan via one-click button
- Live progress polling from the frontend

### Intelligent Classification Pipeline
- **Rule engine** — sender domain lookup (18 built-in vendors: Swiggy, Amazon, HDFC, Zomato, Uber, etc.) + keyword scoring across expense / income / ignore / CC-payment buckets
- **Multi-provider LLM fallback** — when rules are uncertain, calls an LLM to classify and extract amount, merchant, category, and transaction date
- **Provider priority queue** — user-configured → Gemini → Grok → Groq → Scaleway → OpenRouter → Cloudflare, with automatic rate-limit backoff and persistent demotion
- **Batch classification** — multiple emails per LLM call for efficiency
- **Pre-extraction hints** — regex-extracted amount/date/merchant injected into every prompt
- **7 response-repair strategies** for malformed LLM JSON

### Views (7 Screens)

| View | What it does |
|---|---|
| **Inbox** | Gmail-style transaction list with date grouping, inline row expansion showing email body + AI fields, inline category picker, bulk actions (mark read/flag/delete/reclassify), duplicate pair resolution cards, review queue |
| **Money Flow** | Sankey-style income→expense flow diagram, weekly burn chart, KPI cards |
| **Dashboard** | Monthly snapshot with cumulative balance chart, daily burn, subscriptions, needs-attention counts, category breakdown, top merchants, budget progress bars |
| **Health** | Savings rate, runway months, current balance, monthly net bar chart (3/6/12 month toggle) |
| **Reports** | 12-month monthly summary table with income/expenses/net/savings rate per month |
| **Recurring** | CRUD for subscriptions and fixed expenses, AI-powered suggestion from transaction history |
| **Debt** | CRUD for loans, EMIs, and credit card balances with progress tracking and payoff goals |

### Learning & Adaptation
- **Auto-learn from corrections** — fixing a transaction creates a sender-domain rule
- **Bulk retrain** — select emails and persist their labels as domain rules in one click
- **Fuzzy merchant aliasing** — similar merchant names auto-linked via rapidfuzz
- **Duplicate pair learning** — confirmed/dismissed decisions train auto-resolve at ≥85% confidence

### Duplicate Detection
- Same-domain: same sender, same amount, ±3 days
- Cross-domain: different senders, same amount, ±1 day
- Investment flow: "order sent" + "confirmation" pair detection

### Budgets
- Per-category monthly budgets with animated progress bars
- Overspend indicators in dashboard and inbox sidebar

### Review Queue
- Low-confidence transactions surface for review
- Keyboard shortcuts: E (expense), I (income), S (skip), Enter (confirm)
- Corrections automatically train domain rules

### Account & Settings
- Google OAuth 2.0 with optional TOTP 2FA
- Multi-user support via email allowlist (owner + members)
- Custom sender rules (add/delete domain→label mappings)
- Per-user AI service configuration (bring your own LLM key)
- Custom categories with colors
- Account deletion (scheduled 24-48h delay or immediate)
- Admin tools (fetch preview, classify test, LLM provider test)

### Global Features
- **Search** — Cmd+K global search across merchants, categories, amounts, and email subjects
- **Category filter** — topbar dropdown filters every view by category, also available in sidebar
- **Date range** — preset buttons (7d/30d/90d/1y) + custom date pickers
- **Theme** — 3 themes: Paper (warm cream), Cool (gray-blue), Midnight (dark charcoal)
- **Sync indicator** — animated green dot pill showing "Gmail · just now" / "Gmail · 5m" / etc.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (async) + SQLAlchemy 2.0 async + Alembic |
| Database | PostgreSQL (prod) / SQLite (dev) |
| Frontend | Vanilla JSX (esbuild → React 18 CDN) + Jinja2 shell |
| Gmail | Google OAuth 2.0 + Gmail REST API |
| LLM | Gemini, Grok (xAI), Groq, Scaleway, OpenRouter, Cloudflare Workers AI |
| Scheduler | APScheduler (async) |
| Container | Docker + docker-compose |
| Deploy | Railway (via Dockerfile) |

---

## Quick Start

MoneyFlow runs in two modes:

| Mode | External deps | Best for |
|---|---|---|
| **Local** (default) | None — SQLite + in-memory | Trying it out, personal use |
| **Cloud** | PostgreSQL, Redis, Google OAuth + Gmail API | Multi-user, Gmail sync |

---

### 🏠 Local Mode (one command)

No Google account, no PostgreSQL, no Redis needed. Your data stays on your machine.

```bash
# Clone & setup
git clone https://github.com/yourusername/gexpense-tracker.git
cd gexpense-tracker
bash scripts/setup-local.sh

# Start
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) and click **"Start locally"**.

> Add transactions manually or import a CSV. In local mode, the app uses SQLite (`./data/expense.db`) and an in-memory task queue — zero external services.

### 🐳 Run with Docker (local mode)

```bash
docker compose -f docker-compose.local.yml up --build
```

Open [http://localhost:8000](http://localhost:8000).  
Uses SQLite + in-memory queue — zero external services.

### 🐳 Run with Docker (cloud mode — requires PostgreSQL + Redis)

```bash
docker-compose up --build
```

> **PostgreSQL on existing data**: If you are reusing an existing PostgreSQL database, run the dedup preflight before migrations to avoid unique constraint failures (see [PostgreSQL Migration Procedure](#postgresql-migration-procedure)).

### ☁️ Full cloud mode (Gmail + Redis)

```bash
cp .env.example .env
# Edit .env: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SECRET_KEY, FERNET_KEY, REDIS_URL
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Use PostgreSQL (not SQLite)
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/expense_tracker"
alembic upgrade head
uvicorn app.main:app --reload
```

### 🔨 Build Frontend (if editing JSX)

```bash
node scripts/build-frontend.mjs          # one-shot build
node scripts/build-frontend.mjs --watch  # dev mode with file watching
```

### 🔗 Connect Gmail (cloud mode only)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Gmail API**
3. Create OAuth 2.0 credentials (web application)
4. Set redirect URI to `http://localhost:8000/api/auth/callback`
5. Visit [http://localhost:8000](http://localhost:8000) and sign in with Google

---

## Production Deployment

### PostgreSQL Migration Procedure

Before running migrations on a production PostgreSQL database, resolve any existing duplicates to avoid unique constraint failures:

```bash
# 1. Preview duplicates that would be removed
python -m app.scripts.dedup_before_migration --dry-run

# 2. Execute if the dry-run looks clean
python -m app.scripts.dedup_before_migration --execute

# 3. Apply pending migrations
alembic upgrade head
```

> **Note**: The dedup preflight is required before migration 0040, which adds unique constraints on `Transaction.email_id` and `FilterRule(rule_type, value, source, user_id)`.

### Required Environment Variables (Production)

| Variable | Description |
|---|---|
| `SECRET_KEY` | Session signing key (generate with `openssl rand -hex 32`) |
| `JWT_SECRET` | JWT signing key (generate with `openssl rand -hex 32`) |
| `FERNET_KEY` | Encryption key for TOTP secrets (generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

### Production Checklist

- [ ] **HTTPS** — configure TLS termination (Railway provides this automatically; set `COOKIE_SECURE=true`)
- [ ] `COOKIE_SECURE=true` — cookies sent over HTTPS only
- [ ] `CORS_ORIGINS` — restrict to your frontend domain
- [ ] **Rate limiting** — enable via `RATE_LIMIT_ENABLED=true` (default: 100 requests/min per IP)
- [ ] `DATABASE_URL` — must use PostgreSQL (asyncpg driver), not SQLite
- [ ] `GOOGLE_REDIRECT_URI` — set to production callback URL
- [ ] Generate unique secrets for `SECRET_KEY`, `JWT_SECRET`, and `FERNET_KEY` — never reuse dev values in production

---

## Project Structure

```
gexpense-tracker/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app factory + middleware
│   ├── config.py            # Pydantic settings (env vars)
│   ├── database.py          # Async SQLAlchemy engine + session
│   ├── auth_deps.py         # get_current_user() dependency
│   ├── crypto.py            # Fernet encryption helpers
│   ├── alerts.py            # In-memory alert deque
│   ├── scheduler.py         # APScheduler (sync, cleanup, dedup)
│   ├── sync.py              # Full sync orchestration
│   ├── api/
│   │   ├── auth.py          # Google OAuth + session management
│   │   ├── transactions.py  # Transaction CRUD + search + export
│   │   ├── sync.py          # Sync status, trigger, settings
│   │   ├── emails.py        # Inbox, retrain, reclassify
│   │   ├── stats.py         # Dashboard analytics
│   │   ├── review.py        # Review queue
│   │   ├── rules.py         # Sender rule CRUD
│   │   ├── budgets.py       # Budget CRUD
│   │   ├── recurring.py     # Recurring expense CRUD + AI suggestion
│   │   ├── debt.py          # Debt CRUD
│   │   ├── duplicates.py    # Duplicate pair resolution
│   │   ├── settings.py      # Profile, categories, AI services, 2FA, deletion
│   │   ├── onboarding.py    # First-run onboarding
│   │   ├── filter.py        # Pre-filter rules + AI refinement
│   │   ├── admin.py         # Owner admin tools
│   │   └── _account_helpers.py
│   ├── classifier/
│   │   ├── classifier.py     # Orchestrator (rule → LLM pipeline)
│   │   ├── llm_client.py     # Multi-provider LLM with fallback
│   │   ├── rules.py          # Domain rules + keyword scoring
│   │   ├── pre_filter.py     # 3-tier pre-filter engine
│   │   ├── transaction_extractor.py  # Regex pre-extraction
│   │   ├── merchant.py       # Merchant normalization (fuzzy match)
│   │   ├── merchant_store.py  # Merchant→category store
│   │   ├── groq_rate_limiter.py
│   │   └── rule_engine_adapter.py
│   ├── gmail/
│   │   ├── auth.py           # OAuth flow helpers
│   │   └── client.py         # Gmail API wrapper
│   ├── dedup/
│   │   └── service.py        # 3-strategy duplicate detection
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py           # User, UserProfile, UserSettings, Session
│   │   ├── transaction.py    # Transaction, DuplicatePair, DomainPairRule
│   │   ├── email.py          # Email, ClassificationLog
│   │   ├── account.py        # ConnectedAccount, UserCategory, UserAIService
│   │   ├── financial.py      # Budget, Debt, RecurringExpense, SenderRule
│   │   └── misc.py           # FilterRule, SyncState, OAuthState, MerchantAlias
│   └── services/
│       └── category_service.py
├── static/
│   ├── src/                  # JSX source files
│   │   ├── app.jsx           # Root orchestrator + view routing
│   │   ├── shell.jsx         # Sidebar, Topbar, SearchBar, LiveBrand
│   │   ├── inbox.jsx         # Inbox view + search results
│   │   ├── dashboard.jsx     # Dashboard view
│   │   ├── flow.jsx          # Money Flow view
│   │   ├── health.jsx        # Financial Health view
│   │   ├── reports.jsx       # Reports view
│   │   ├── recurring.jsx     # Recurring view
│   │   ├── debt.jsx          # Debt view
│   │   ├── account.jsx       # Profile + Settings + Admin views
│   │   ├── onboarding.jsx    # Onboarding wizard
│   │   ├── data.jsx          # Constants (categories)
│   │   └── icons.jsx         # SVG icon library
│   ├── dist/                 # Compiled JS (esbuild output)
│   ├── styles.css            # CSS variables + theme classes
│   └── vendor/               # React CDN fallback
├── templates/
│   └── index.html            # Jinja2 shell + inline CSS + script loader
├── app/classifier/           # Python classification pipeline
├── alembic/                  # Database migrations
├── tests/                    # Pytest test suite (28 files)
├── scripts/
│   └── build-frontend.mjs    # esbuild build script
├── Dockerfile
├── docker-compose.yml
├── railway.toml
├── PRD.md                    # Product Requirements Document
├── SPEC.md                   # Technical Specification
├── PRODUCT.md                # Product positioning + brand
└── DESIGN.md                 # Visual design system
```

---

## Development

### Running Tests

```bash
pytest -v --tb=short     # unit tests (skips LLM tests requiring API keys)
```

### Database Migrations

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```

> **Pre-migration dedup**: Before running migration 0040 on PostgreSQL, run `python -m app.scripts.dedup_before_migration --dry-run` first. If clean, execute with `--execute` to resolve duplicates before unique constraints are applied.

> **SQLite limitations**: SQLite works for local development but has known migration constraints:
> - The upgrade path through all migrations is verified and supported
> - Downgrade from migration 0033 may fail (only upgrade is supported)
> - SQLite does not support concurrent writers (single-user dev only)
> - Use PostgreSQL for any multi-user or production deployment

### Manual Sync Trigger

```bash
curl -X POST http://localhost:8000/api/sync/trigger
```

---

## License

MIT
