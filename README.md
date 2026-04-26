# GExpense Tracker

> Automatically track your expenses from Gmail using a rule engine + multi-provider LLM — with a glassmorphism dark UI.

GExpense Tracker syncs your Gmail inbox, classifies financial emails (bank alerts, invoices, receipts) using a domain-rule engine and an LLM fallback, and gives you a live dashboard of your spending — without manually entering a single transaction.

---

## Features

### Automatic Sync
- Polls Gmail every 2 hours (configurable) via the Gmail API
- Incremental sync using Gmail history IDs — only fetches new messages
- Configurable filter: all mail, unread only, or read only

### Intelligent Classification
- **Rule engine** — sender domain lookup (18 built-in vendors: Swiggy, Amazon, HDFC, Zomato, …) + keyword scoring across expense / income / ignore buckets
- **Multi-provider LLM fallback** — when rules are uncertain, calls an LLM to classify and extract amount, merchant, category, and transaction date
- **Provider priority queue** — Google Gemini → Grok (xAI) → Scaleway → OpenRouter, with automatic rate-limit backoff and persistent demotion
- `force_extraction` mode: rule confirms the label, LLM extracts the financial details

### Gmail Inbox Viewer
- Full DB view of every fetched email with filter, search, and multi-select
- Inline row expansion showing full email body, transaction fields, and Gmail link
- **Run Rules** — re-classify selected emails through the rule engine with per-keyword diagnostic output
- **Run LLM** — re-classify with full prompt and raw JSON response visible in a terminal panel
- **Retrain Rules** — persist selected emails' current labels as domain rules in one click
- Inline fix widget: correct label / merchant / category / amount and save a domain rule simultaneously

### Dashboard & Analytics
- Period picker (this month / 3m / 6m / this year)
- Spending trend chart, category donut, top merchants bar chart, income vs expense comparison
- Count-up stat cards: total spend, income, net, transaction count

### Budgets & Recurring
- Per-category monthly budgets with animated progress bars
- Automatic recurring transaction detection

### Review Queue
- Emails classified with low confidence surface here
- One-key confirmation: `E` (expense), `I` (income), `S` (skip), `Enter` (confirm)
- Corrections automatically train a new domain rule

### Settings
- Custom sender rules (add / delete domain → label mappings)
- Email filter toggle (all / unread / read)
- LLM provider status panel

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 async + Alembic |
| Database | PostgreSQL (prod) / SQLite (dev) |
| Frontend | Vanilla JS + Jinja2 + custom glassmorphism CSS |
| Gmail | OAuth 2.0 + Gmail REST API |
| LLM | Google Gemini, Grok (xAI), Scaleway, OpenRouter |
| Scheduler | APScheduler |
| Container | Docker + docker-compose |

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/gexpense-tracker.git
cd gexpense-tracker
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker

# Google OAuth (Gmail access)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback

# LLM providers — add at least one
GOOGLE_AI_API_KEY=        # Gemini (recommended, free tier available)
GROK_API_KEY=             # xAI Grok
SCALEWAY_API_KEY=         # Scaleway AI
OPENROUTER_API_KEY=       # OpenRouter (fallback)

# Tuning
LLM_CONFIDENCE_THRESHOLD=0.85   # below this → LLM is called
AUTO_CONFIRM_THRESHOLD=0.75     # above this → auto-confirmed, skips review queue
SYNC_INTERVAL_HOURS=2

# Optional private-beta onboarding gate
INVITE_CODE=your-private-code
```

### 3. Run with Docker

```bash
docker-compose up --build
```

Open [http://localhost:8000](http://localhost:8000).

### 4. Run locally (SQLite, no Docker)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Use SQLite instead of Postgres
export DATABASE_URL="sqlite+aiosqlite:///./data/expense.db"

alembic upgrade head
uvicorn app.main:app --reload
```

### 5. Connect Gmail

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Gmail API**
3. Create OAuth 2.0 credentials (web application)
4. Set redirect URI to `http://localhost:8000/api/auth/callback`
5. Visit [http://localhost:8000/api/auth/gmail](http://localhost:8000/api/auth/gmail) and authorise

---

## LLM Providers

All providers use the OpenAI-compatible `/chat/completions` endpoint. Add any combination — the system tries them in priority order and backs off automatically on rate limits.

| Provider | API key env var | Free tier |
|---|---|---|
| Google Gemini | `GOOGLE_AI_API_KEY` | Yes (Gemini 2.0 Flash) |
| Grok (xAI) | `GROK_API_KEY` | Limited |
| Scaleway | `SCALEWAY_API_KEY` | Yes (Llama 3.3 70B) |
| OpenRouter | `OPENROUTER_API_KEY` | Yes (many models) |

---

## Architecture

```
Gmail API
    │
    ▼
GmailClient.fetch_new_messages()
    │  (incremental, history-based)
    ▼
sync.run_sync()
    ├── Insert Email rows
    └── classify_email() ──► apply_rules()         ← domain lookup + keyword scoring
                         └─► llm_client.classify() ← multi-provider with fallback
                                                    └─► llm_client.extract()  ← if label known
    │
    ▼
Transaction rows (label, amount, merchant, category, confidence, status)
    │
    ▼
FastAPI routes ──► Jinja2 templates ──► vanilla JS (no framework)
```

---

## Project Structure

```
app/
├── api/              # FastAPI routers
│   ├── auth.py       # Gmail OAuth
│   ├── budgets.py
│   ├── emails.py     # Inbox view + reclassify + retrain
│   ├── recurring.py
│   ├── review.py
│   ├── rules.py
│   ├── stats.py
│   ├── sync.py
│   └── transactions.py
├── classifier/
│   ├── classifier.py # Orchestrates rule + LLM pipeline
│   ├── llm_client.py # Multi-provider LLM with fallback
│   └── rules.py      # Domain rules + keyword scoring
├── gmail/
│   ├── auth.py       # OAuth flow
│   └── client.py     # Gmail API wrapper
├── alerts.py
├── config.py         # Pydantic settings
├── database.py
├── models.py         # SQLAlchemy ORM models
├── scheduler.py      # APScheduler setup
└── sync.py           # Full sync orchestration
templates/            # Jinja2 HTML templates
static/               # styles.css + app.js
alembic/              # DB migrations
tests/
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | postgres | SQLAlchemy async URL |
| `GOOGLE_CLIENT_ID` | — | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | — | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/callback` | OAuth callback |
| `GOOGLE_AI_API_KEY` | — | Gemini API key |
| `GROK_API_KEY` | — | xAI Grok API key |
| `SCALEWAY_API_KEY` | — | Scaleway API key |
| `OPENROUTER_API_KEY` | — | OpenRouter API key |
| `LLM_MODEL` | `google/gemini-2.0-flash-exp:free` | OpenRouter model string |
| `LLM_CONFIDENCE_THRESHOLD` | `0.85` | Below this → LLM called |
| `AUTO_CONFIRM_THRESHOLD` | `0.75` | Above this → auto-confirmed |
| `SYNC_INTERVAL_HOURS` | `2` | Sync frequency |
| `SECRET_KEY` | `change-me` | App secret (change in prod) |

---

## Development

```bash
# Run tests
pytest

# Create a DB migration
alembic revision --autogenerate -m "description"
alembic upgrade head

# Trigger a manual sync
curl -X POST http://localhost:8000/api/sync
```

---

## License

MIT
