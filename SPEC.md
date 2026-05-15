# MoneyFlow — Technical Specification

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
│  React (CDN) · esbuild JSX → JS · Jinja2 HTML shell             │
│  static/src/*.jsx → esbuild → static/dist/*.js                  │
└──────────────┬───────────────────────────────────────────────────┘
               │ HTTP (JSON API)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI (async, uvicorn)                      │
│  app/main.py — app factory, middleware, router registration      │
│  app/api/*.py — 16 routers (auth, txns, sync, stats, etc.)      │
│  app/auth_deps.py — session cookie → get_current_user()          │
└──────────────┬───────────────────────────────────────────────────┘
               │
      ┌────────┼────────────┬──────────────────┐
      ▼        ▼            ▼                  ▼
┌─────────┐ ┌──────┐ ┌────────────┐ ┌──────────────────┐
│PostgreSQL│ │Gmail │ │Multi-LLM   │ │APScheduler        │
│(prod)    │ │API   │ │(Gemini,    │ │(sync, cleanup,    │
│SQLite    │ │      │ │Grok, Groq, │ │ dedup)            │
│(dev)     │ │      │ │Scaleway,   │ │                   │
│          │ │      │ │OpenRouter, │ │                   │
│          │ │      │ │Cloudflare) │ │                   │
└──────────┘ └──────┘ └────────────┘ └──────────────────┘
```

### Layer Overview

| Layer | Technology | Role |
|---|---|---|
| **Frontend** | Vanilla JSX → esbuild → CDN React 18 | SPA-like views mounted by Jinja2 shell |
| **Backend** | FastAPI (async) | REST API + page serving |
| **Database** | SQLAlchemy 2.0 async (PostgreSQL/SQLite) | ORM + migrations (Alembic) |
| **Gmail** | `google-api-python-client` | Email fetch via REST |
| **LLM** | HTTP POST to `/chat/completions` (OpenAI-compatible) | Classification fallback |
| **Scheduler** | APScheduler (AsyncIOScheduler) | Sync, cleanup, dedup jobs |
| **Build** | esbuild (Node.js) | JSX → JS compilation |

---

## 2. Data Model

### 2.1 Core Entities

```
User (1) ──→ UserProfile (1)
  │
  ├──→ UserSettings (1)
  ├──→ Session (*)           — auth sessions
  ├──→ ConnectedAccount (*)  — Gmail OAuth tokens
  ├──→ UserCategory (*)      — custom categories
  ├──→ UserAIService (*)     — per-user LLM config
  ├──→ SenderRule (*)        — domain→label mappings
  ├──→ UserMerchantOverride (*)
  ├──→ Email (*)
  │     └──→ ClassificationLog (*) — audit trail
  ├──→ Transaction (*)
  │     ├──→ DuplicatePair (*) (as primary or duplicate)
  │     └──→ Email (nullable FK)
  ├──→ Budget (*)            — per-category monthly limit
  ├──→ Debt (*)              — loan/EMI/card tracking
  ├──→ RecurringExpense (*)  — subscriptions, fixed costs
  └──→ FilterRule (*)        — pre-filter allow/block/keyword
```

### 2.2 Key Tables

**User** — `users`
| Column | Type | Notes |
|---|---|---|
| id | String(36) PK | UUID |
| email | String, unique | Google account email |
| role | Enum(owner/member) | First user is owner |
| status | Enum(invited/active/disabled) | Multi-user lifecycle |
| onboarding_complete | Boolean | |
| totp_enabled | Boolean | |
| totp_secret | String | Encrypted TOTP seed |
| scheduled_deletion_at | DateTime | Soft-deletion timer |

**Transaction** — `transactions`
| Column | Type | Notes |
|---|---|---|
| id | String(36) PK | UUID |
| email_id | String(36) FK→emails | Nullable (manual entries) |
| label | Enum(expense/income/ignore) | |
| amount | Numeric(12,2) | |
| currency | String(3) | Default INR |
| merchant | String | Normalized merchant name |
| category | String | Canonical category key |
| txn_date | Date | Extracted transaction date |
| confidence | Float | 0-1 scale |
| status | Enum(auto/confirmed/corrected/needs_review) | Lifecycle state |
| classifier_method | Enum(rule/llm) | Which system classified |
| read | Boolean | Default false |
| flagged | Boolean | Default false |

**Email** — `emails`
| Column | Type | Notes |
|---|---|---|
| id | String(36) PK | UUID |
| gmail_id | String, unique | Gmail message ID |
| subject | Text | |
| sender | String | From address |
| sender_domain | String | Extracted for rule lookup |
| received_at | DateTime | |
| body_snippet | Text | Truncated (500 chars) |
| body_text | Text | Full body (base64 decoded) |
| pre_filter_status | Enum(passed/review_pending/discarded) | Pre-filter decision |

**ClassificationLog** — `classification_log`
| Column | Type | Notes |
|---|---|---|
| id | String(36) PK | UUID |
| email_id | String(36) FK→emails | |
| provider | String | e.g. "google-gemini" |
| model | String | e.g. "gemini-2.0-flash-exp" |
| latency_ms | Integer | Response time |
| llm_label/amount/merchant/category/confidence/txn_date | Various | Extracted values |
| raw_response | Text | Full LLM JSON response |

### 2.3 Relation Highlights

- **DuplicatePair**: self-referencing FK to transactions (`primary_tx_id`, `duplicate_tx_id`), unique pair constraint
- **SenderRule**: unique on (`user_id`, `sender_domain`), source can be `builtin` or `user_trained`
- **DomainPairRule**: unique on (`domain_a`, `domain_b`), learning loop tracks confirmed/dismissed counts
- **MerchantAlias**: unique on `raw` (the raw merchant string), maps to `canonical` name
- **Budget**: unique on (`user_id`, `category`), single row per category per user
- **Session.token**: unique, stored as bytes, hex-encoded in cookie

---

## 3. API Surface

### 3.1 Router Index

| File | Prefix | Key Endpoints |
|---|---|---|
| `app/api/auth.py` | `/api/auth` | `google`, `callback`, `logout`, `me`, `status`, `allowlist` |
| `app/api/transactions.py` | `/api` | `GET /transactions`, `PATCH /transactions/{id}`, `POST /transactions/bulk`, `GET /search`, `GET /transactions/export`, `GET /transactions/duplicates`, `POST /transactions/{id}/reclassify` |
| `app/api/sync.py` | `/api/sync` | `GET /progress`, `GET /status`, `POST /trigger`, `PATCH /settings`, `POST /backfill-bodies` |
| `app/api/emails.py` | `/api` | `GET /emails`, `POST /emails/{id}/review`, `POST /emails/retrain`, `POST /emails/reclassify` |
| `app/api/stats.py` | `/api/stats` | `GET /summary`, `GET /category-breakdown`, `GET /monthly-trend`, `GET /top-merchants`, `GET /monthly-summary`, `GET /income-vs-expense`, `GET /health` |
| `app/api/review.py` | `/api/review` | `GET /review`, `POST /review/{id}/reprocess`, `POST /review/reprocess-all`, `POST /review/batch` |
| `app/api/rules.py` | `/api` | `GET /rules`, `POST /rules`, `DELETE /rules/{domain}` |
| `app/api/budgets.py` | `/api/budgets` | Full CRUD |
| `app/api/recurring.py` | `/api/recurring` | CRUD + `POST /find-from-transactions` |
| `app/api/debt.py` | `/api/debts` | Full CRUD |
| `app/api/duplicates.py` | `/api/duplicates` | `GET /duplicates`, `PATCH /duplicates/{pair_id}` |
| `app/api/settings.py` | `/api/account` | Profile, settings, connected accounts, AI services, categories, 2FA, deletion |
| `app/api/onboarding.py` | `/api/account` | `POST /onboarding` |
| `app/api/filter.py` | `/api/filter` | `GET /rules`, `POST /refine` |
| `app/api/admin.py` | `/api/admin` | Fetch preview, classify test, provider test, data reset, merchant seed |
| `app/api/_account_helpers.py` | (shared) | Serializers, encryption helpers, defaults |

### 3.2 Common Patterns

- **Auth**: All endpoints except `/api/auth/google`, `/api/auth/callback`, `/login`, `/health`, `/static/*` require session cookie
- **Pagination**: `GET /transactions` supports `offset` and `limit` query params
- **Errors**: 401 (not authenticated), 403 (not authorized/account scheduled for deletion), 404 (not found), 422 (validation)
- **SSE**: `POST /emails/reclassify` uses Server-Sent Events for streaming reclassification progress

---

## 4. Classification Pipeline

```
Email arrives
    │
    ▼
┌─────────────────────────────────────┐
│        PRE-FILTER (app/classifier/  │
│        pre_filter.py)               │
│  Tier 1: Domain allowlist/blocklist │
│  Tier 2: Regex keyword scoring     │
│  Tier 3: LLM binary (ambiguous)    │
│  → passed / review / discarded     │
└──────────┬──────────────────────────┘
           │ (passed)
           ▼
┌─────────────────────────────────────┐
│        RULE ENGINE                  │
│  (app/classifier/rules.py)          │
│                                     │
│  1. Sender domain lookup            │
│     (18 builtin + DB-learned)       │
│  2. Delivery-only signal detection  │
│  3. CC bill payment pattern         │
│  4. Income/expense keyword scoring  │
│  5. Ignore keyword scoring          │
│                                     │
│  → RuleResult(label, confidence,    │
│    merchant_hint, amount_hint)      │
└──────────┬──────────────────────────┘
           │ (confidence < threshold?)
           │     YES          NO
           ▼                  ▼
┌─────────────────────┐   ┌──────────────┐
│  LLM FALLBACK       │   │ Auto-confirm │
│  (app/classifier/   │   └──────────────┘
│   llm_client.py)    │
│                     │
│  Multi-provider     │
│  priority queue:    │
│  1. User-configured │
│  2. Gemini          │
│  3. Grok            │
│  4. Groq            │
│  5. Scaleway        │
│  6. OpenRouter      │
│  7. Cloudflare      │
│                     │
│  Batch: N emails    │
│  per call           │
│  Auto-fallback on   │
│  429 (rate limit)   │
│  Persistent demotion│
│  via priority_score │
└──────────┬──────────┘
           ▼
┌──────────────────────────────────────┐
│   MERCHANT NORMALIZATION             │
│   (app/classifier/merchant.py)       │
│   Regex clean → exact alias → fuzzy  │
│   (rapidfuzz WRatio). Learn pending  │
│   aliases to DB.                     │
└──────────┬───────────────────────────┘
           ▼
┌──────────────────────────────────────┐
│   WRITE Transaction +                │
│   ClassificationLog (audit)          │
└──────────┬───────────────────────────┘
           ▼
┌──────────────────────────────────────┐
│   DUPLICATE DETECTION                │
│   (app/dedup/service.py)            │
│   3 strategies → pair creation       │
│   Auto-resolve at ≥85% confidence    │
└──────────────────────────────────────┘
```

### Prompt Architecture

The LLM classification prompt (`_USER_TEMPLATE` in `llm_client.py`) is ~250 lines covering:
- Indian banking patterns: bank debit/credit, UPI, IMPS, NEFT, RTGS
- E-commerce: Amazon, Flipkart, Myntra, Ajio
- Food delivery: Swiggy, Zomato
- Travel: IRCTC, Uber, Ola, MakeMyTrip
- Investments: SIP, mutual funds, stocks, insurance premiums
- Credit card bills, EMI, refunds, cashback
- JSON-only output instruction with strict schema

7 repair strategies for malformed LLM responses:
1. Strip markdown code fences
2. Remove trailing commas
3. Replace single quotes with double quotes
4. Unquote unquoted keys
5. Extract first JSON object from text
6. Fix truncated JSON
7. Extract JSON from balanced braces

---

## 5. Sync Pipeline

```
Scheduler triggers run_sync(user_id)
    │
    ▼
┌──────────────────────────────┐
│  GmailClient.fetch_new_      │
│  messages()                  │
│                              │
│  Incremental: uses history   │
│  ID from SyncState           │
│                              │
│  Fallback: full 90-day fetch │
│  if no history ID            │
│                              │
│  Pagination: 500 per page    │
│  Filter: all/unread/read/    │
│  financial                   │
└──────────┬───────────────────┘
           │ (list of Email rows)
           ▼
┌──────────────────────────────┐
│  Pre-filter (skip non-       │
│  financial)                  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  batch_classify_emails()     │
│  (groups by sender domain    │
│   for rule engine efficiency)│
│                              │
│  Per email:                  │
│  rule engine → LLM fallback  │
│  → write Transaction         │
│  → write ClassificationLog   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Duplicate detection scan    │
│  on new transactions         │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Merchant alias learning     │
│  (pending fuzzy aliases      │
│   persisted to DB)           │
└──────────────────────────────┘
```

### Sync State

- `SyncState` singleton per user tracks: `last_synced_at`, `last_history_id`, `email_filter`
- `_sync_progress` global dict (in-memory) polled by frontend via `GET /sync/progress`
- Progress schema: `{ phase, running, total_emails, processed, errors }`

---

## 6. Frontend Architecture

### 6.1 Build Pipeline

```
static/src/*.jsx  →  esbuild (JSX → JS, IIFE)  →  static/dist/*.js
                          │
                  scripts/build-frontend.mjs
                          │
                  options: --watch (dev), minified (prod)
```

No bundler — each file compiles independently to an IIFE that attaches exports to `window`. The Jinja2 template (`templates/index.html`) loads them sequentially:

```html
<script src="/static/dist/data.js?v=10"></script>
<script src="/static/dist/icons.js?v=5"></script>
<script src="/static/dist/shell.js?v=11"></script>
<script src="/static/dist/inbox.js?v=13"></script>
<!-- ... remaining views ... -->
<script src="/static/dist/app.js?v=24"></script>
```

### 6.2 Component Tree

```
App (app.jsx)
├── Sidebar (shell.jsx)
│   ├── LiveBrand (animated logo, click → inbox)
│   ├── NavItem[] (Views: Inbox, Flow, Dashboard, Health, Reports, Recurring, Debt)
│   ├── NavItem[] (Filters: Expenses, Income, Subscriptions, Flagged, Payments)
│   ├── Categories section (grouped by category)
│   ├── ThemePicker (Paper / Cool / Midnight)
│   └── AccountMenu (profile, settings, sign out)
├── Topbar (shell.jsx)
│   ├── SearchBar (Cmd+K global search)
│   ├── [children] (category filter pill + re-scan pill)
│   ├── LiveDot (sync status indicator with animated dot)
│   └── DateRangeControl (presets + custom date inputs)
├── InboxView (inbox.jsx)
│   ├── FilterChip[] (All, Expenses, Income, Subs, Flagged, Low conf, Duplicates, Review)
│   ├── TransactionRow[] (grouped by date)
│   │   └── DetailPanel (expandable: email body, AI fields, inline edit, reclassify)
│   ├── CategoryChip (inline category picker per row)
│   ├── DuplicatePairCard[] (resolution: keep one, dismiss)
│   └── ReviewQueue (keep/discard for pre-filter decisions)
├── FlowView (flow.jsx) — SVG Sankey + KPI + bar chart
├── DashboardView (dashboard.jsx) — line chart + KPI + bar chart + budget bars
├── HealthView (health.jsx) — bar chart + metrics
├── ReportsView (reports.jsx) — monthly table
├── RecurringView (recurring.jsx) — CRUD + AI suggestions
├── DebtView (debt.jsx) — CRUD + progress bars
├── ProfileView (account.jsx) — personal details + stats
├── SettingsView (account.jsx) — preferences, categories, AI services, 2FA, deletion
│   ├── CategoriesSection
│   ├── AccessSection (multi-user allowlist)
│   ├── AdminSyncSection
│   ├── AdminLLMSection
│   └── AdminLLMTestSection
└── SearchView (inbox.jsx)
```

### 6.3 State Management

- **View routing**: `useState` in `App` — `setView(viewName)` switches the rendered component
- **Data fetching**: Each view fetches its own data via `API.get()` (thin fetch wrapper)
- **Global state**: `syncStatus`, `syncing`, `transactions`, `view` passed down as props or via the shell
- **Theme**: `useState` in App, persisted to `localStorage`, CSS variables on `<html data-theme="...">`
- **No external state library** — plain React `useState`/`useEffect` throughout

### 6.4 Key Design Tokens (from DESIGN.md)

| Token | Light Value | Dark Value | Usage |
|---|---|---|---|
| --paper | `#f6f3ec` | `#1a1814` | Page background |
| --ink | `#1a1814` | `#f6f3ec` | Primary text |
| --accent | `#c2410c` | `#c2410c` | Links, active states, focus |
| --pos | `#3d6b42` | `#3d6b42` | Income, success |
| --neg | `#8b2a1f` | `#8b2a1f` | Expenses, errors |
| --card | `#fbf9f3` | `#242220` | Card surface |
| --line | `#e3dcca` | `#2e2c27` | Borders, dividers |

Typography: Fraunces (display), Geist (body), Geist Mono (mono), Instrument Serif (brand italic)

---

## 7. Security & Authentication

### 7.1 Auth Flow

```
User → /login → Google OAuth consent → Callback → Create/load User
    → Create Session (32-byte random token, hex-encoded)
    → Set cookie: httponly, secure, samesite=lax, 30-day expiry
    → Redirect to /
```

### 7.2 Auth Enforcement

- **AuthMiddleware** (FastAPI middleware): Checks session cookie on every request except whitelisted paths
- **get_current_user()** dependency: DB lookup of Session → check expiry → check scheduled_deletion_at → return User
- **Session expiry**: 30 days from creation, checked on every request

### 7.3 Secrets Management

| Secret | Storage | Encryption |
|---|---|---|
| Gmail OAuth refresh token | `ConnectedAccount.refresh_token` | Fernet (if FERNET_KEY set) |
| User AI service API keys | `UserAIService.encrypted_api_key` | Fernet |
| TOTP secret | `User.totp_secret` | Fernet |
| App signing key | `.env` → `config.SECRET_KEY` | Environment only |

### 7.4 2FA (TOTP)

- Setup: two-step (`/setup` generates secret + QR, `/verify` validates code)
- Disable: requires current valid code
- QR generated via `qrcode` library

### 7.5 Multi-User Model

- First user via Google OAuth becomes `owner`
- Owner adds emails via allowlist (`POST /api/auth/allowlist`)
- Subsequent users join, become `member`
- All users share the same transaction data
- No password-based auth

---

## 8. Configuration & Deployment

### 8.1 Environment Variables

| Variable | Default | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | — | Yes | Auto-forces asyncpg for PostgreSQL |
| `SECRET_KEY` | `change-me` | Yes | Session signing |
| `FERNET_KEY` | — | No | Token encryption (recommended) |
| `GOOGLE_CLIENT_ID` | — | Yes | Gmail OAuth |
| `GOOGLE_CLIENT_SECRET` | — | Yes | Gmail OAuth |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/auth/callback` | Yes | Must match Google Cloud Console |
| `GOOGLE_AI_API_KEY` | — | No | Gemini (recommended) |
| `GROK_API_KEY` | — | No | xAI Grok |
| `GROQ_API_KEY` | — | No | Groq |
| `SCALEWAY_API_KEY` | — | No | Scaleway |
| `OPENROUTER_API_KEY` | — | No | OpenRouter |
| `CLOUDFLARE_API_TOKEN` | — | No | Cloudflare Workers AI |
| `CLOUDFLARE_ACCOUNT_ID` | — | No | Cloudflare Workers AI |
| `SYNC_INTERVAL_HOURS` | `2` | No | Gmail sync frequency |
| `LLM_CONFIDENCE_THRESHOLD` | `0.85` | No | Below this → LLM called |
| `AUTO_CONFIRM_THRESHOLD` | `0.75` | No | Above this → auto-confirmed |
| `INVITE_CODE` | — | No | Private beta gate |

### 8.2 Docker

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
  app:
    build: .
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db]
```

Entrypoint: wait for DB → `alembic upgrade head` → `uvicorn app.main:app`

### 8.3 Database Migrations

- Tool: Alembic
- Auto-generation: `alembic revision --autogenerate -m "description"`
- Manual: `alembic upgrade head`
- Dev DB: SQLite (`sqlite+aiosqlite:///./data/expense.db`)
- Prod DB: PostgreSQL via asyncpg

### 8.4 CI/CD

- **CI**: GitHub Actions — PostgreSQL service container, pytest (skips LLM client tests)
- **Deploy**: Railway via Dockerfile — health check on `/health`, restart on failure (max 3)
- **Infrastructure**: Docker + docker-compose for self-hosted option

---

## 9. Testing

| Layer | Framework | Coverage |
|---|---|---|
| Backend unit | pytest + pytest-asyncio | Auth, API endpoints, sync, classification, LLM client, merchant normalization, dedup, pre-filter, batch classifier, models, config, Gmail auth/client, 2FA, settings, admin, transactions export, pagination, stats, review, rules, account onboarding, account deletion |
| Frontend | None (manual) | Visual QA via browser DevTools |
| E2E | None | Manual flows |

Test files: `tests/test_*.py` (28 files). Async tests use `pytest-asyncio` with `asyncio_mode = auto` in `pytest.ini`.
