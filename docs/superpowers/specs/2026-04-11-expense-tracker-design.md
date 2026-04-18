# Expense Tracker — Design Spec
**Date:** 2026-04-11  
**Status:** Approved  
**Scope:** Phase 1 — Email ingestion + classification service + web dashboard

---

## Overview

A self-hosted web application that reads Gmail, classifies emails as expense/income/ignore, extracts transaction data, and presents a dashboard for review and correction. Built for personal use in India (INR, Indian merchants, UPI/bank email formats).

---

## Architecture

**Single monolith.** One FastAPI process containing:
- APScheduler running Gmail sync every 2 hours in-process
- REST API serving the dashboard and correction endpoints
- Hybrid classifier (rule engine → LLM fallback)
- Extractor pulling structured fields from classified emails

**Deployment:** `docker compose up` — two containers: app + Postgres.

```
APScheduler (2hr)
    └── Gmail Client (OAuth2, incremental sync via history ID)
            └── Hybrid Classifier
                    ├── Rule Engine (confidence ≥ 0.85 → skip LLM)
                    └── Claude Haiku (confidence < 0.85)
                            └── Extractor
                                    └── Postgres
                                            └── FastAPI Dashboard
```

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | Python 3.12 | Best Gmail API + LLM ecosystem |
| Web framework | FastAPI | Async, fast, auto docs |
| Background scheduler | APScheduler | In-process, simple, no Redis needed |
| Database | Postgres | Robust, good JSON support for raw email metadata |
| ORM | SQLAlchemy 2.0 + Alembic | Migrations, async support |
| Gmail access | Google Gmail API v1 | Incremental sync via history ID |
| LLM | Configurable via `LLM_PROVIDER` env var | OpenRouter (free models) or Anthropic — swappable |
| Dashboard frontend | Vanilla JS + Jinja2 templates | Zero build step, served by FastAPI |
| Containerisation | Docker Compose | Single-command startup |

---

## Database Schema

### `emails`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| gmail_id | VARCHAR UNIQUE | Gmail message ID |
| subject | TEXT | |
| sender | VARCHAR | Full sender string |
| sender_domain | VARCHAR | Extracted domain (e.g. `amazon.in`) |
| received_at | TIMESTAMPTZ | |
| body_snippet | TEXT | First 500 chars of body |
| gmail_link | VARCHAR | `https://mail.google.com/mail/u/0/#inbox/{gmail_id}` |
| synced_at | TIMESTAMPTZ | |

### `transactions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| email_id | UUID FK → emails | |
| label | ENUM(expense, income, ignore) | |
| amount | NUMERIC(12,2) | In INR |
| currency | VARCHAR(3) | Default `INR` |
| merchant | VARCHAR | Extracted merchant name |
| category | VARCHAR | Auto-detected (see categories below) |
| txn_date | DATE | Date of transaction (not email received date) |
| confidence | FLOAT | 0.0–1.0 |
| status | ENUM(auto, confirmed, corrected, needs_review) | |
| classifier_method | ENUM(rule, llm) | Which path classified it |
| user_notes | TEXT | Optional user annotation |
| created_at | TIMESTAMPTZ | |

### `sync_state`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | Single row |
| last_synced_at | TIMESTAMPTZ | |
| last_history_id | VARCHAR | Gmail API incremental cursor |

### `sender_rules`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| sender_domain | VARCHAR UNIQUE | e.g. `zomato.com` |
| label | ENUM(expense, income, ignore) | |
| category | VARCHAR | e.g. `Food` |
| source | ENUM(builtin, user_trained) | |
| created_at | TIMESTAMPTZ | |

---

## Hybrid Classifier

### Step 1 — Rule Engine
1. Normalize sender domain from email headers
2. Lookup `sender_rules` table (user-trained rules take priority over builtin)
3. Keyword scan on subject + body_snippet:
   - Expense signals: `receipt`, `invoice`, `order confirmed`, `payment successful`, `debited`, `charged`, `bill`, `debit`
   - Income signals: `credited`, `received`, `salary`, `transferred to you`, `refund`
   - Ignore signals: `newsletter`, `unsubscribe`, `promotional`, `OTP`, `verify`
4. Combine domain match + keyword score → confidence 0.0–1.0
5. If confidence ≥ 0.85 → classify, skip Step 2

### Step 2 — LLM (configurable provider)
Called only when rule confidence < 0.85.

#### LLM Provider Abstraction

All LLM calls go through a single `LLMClient` interface. Provider is selected at startup from env vars:

```
LLM_PROVIDER=openrouter          # or: anthropic
LLM_MODEL=google/gemini-2.0-flash-exp:free   # any OpenRouter model string
OPENROUTER_API_KEY=sk-or-...

# Or for Anthropic direct:
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
ANTHROPIC_API_KEY=sk-ant-...
```

`LLMClient` uses the OpenAI-compatible API format — both OpenRouter and Anthropic (via their OpenAI-compat endpoint) accept the same request shape. No provider-specific SDK needed; `httpx` suffices.

**Recommended free OpenRouter models for this task:**
- `google/gemini-2.0-flash-exp:free` — fast, good JSON output
- `meta-llama/llama-3.3-70b-instruct:free` — strong reasoning
- `mistralai/mistral-7b-instruct:free` — lightweight fallback

**Prompt structure:**
```
You are classifying a financial email for an Indian user.
Classify as: expense, income, or ignore.
Also extract: amount (INR), merchant name, category, transaction date.

Email:
From: {sender}
Subject: {subject}
Body: {body_snippet}

Indian context: UPI transfers, bank debit/credit alerts, GST invoices,
merchants like Zomato, Swiggy, Swiggy instamart, Flipkart, Amazon.in, Jio, Airtel,
PhonePe, Google Pay, Paytm, CRED, IRCTC, Ola, Rapido.

Respond as JSON only: {"label": "...", "amount": ..., "merchant": "...", 
"category": "...", "txn_date": "YYYY-MM-DD", "confidence": 0.0-1.0}
```

### Step 3 — Storage
- confidence ≥ 0.75 → `status: auto`
- confidence < 0.75 → `status: needs_review`

### User Correction Loop
When user corrects a transaction label in dashboard:
1. Update `transactions.label`, `transactions.status = corrected`
2. Upsert into `sender_rules` with `source = user_trained`
3. Future emails from same domain skip LLM entirely

---

## Indian Context

### Default Currency
INR (₹). Amount parsing handles:
- `₹1,234.56`
- `Rs. 1234`
- `INR 1,23,456.78` (Indian lakh formatting)
- `1234.00 INR`

### Seed Sender Rules (builtin)

| Domain | Label | Category |
|---|---|---|
| amazon.in | expense | Shopping |
| flipkart.com | expense | Shopping |
| myntra.com | expense | Shopping |
| zomato.com | expense | Food |
| swiggy.in | expense | Food |
| blinkit.com | expense | Groceries |
| bigbasket.com | expense | Groceries |
| phonepe.com | expense | UPI Payment |
| paytm.com | expense | UPI Payment |
| razorpay.com | expense | Payment |
| cred.club | expense | Bill Payment |
| makemytrip.com | expense | Travel |
| irctc.co.in | expense | Travel |
| olacabs.com | expense | Transport |
| uber.com | expense | Transport |
| rapido.bike | expense | Transport |
| airtel.in | expense | Utilities |
| jio.com | expense | Utilities |
| hdfcbank.com | income/expense | Bank Alert (LLM disambiguates) |
| icicibank.com | income/expense | Bank Alert (LLM disambiguates) |

### Transaction Categories
Food, Groceries, Shopping, Travel, Transport, Utilities, Entertainment, Healthcare, Education, UPI Payment, Bank Transfer, Income, Other

---

## API Surface

```
GET  /api/transactions          list (filters: label, status, date_from, date_to, category)
GET  /api/transactions/{id}     single transaction + source email details
PATCH /api/transactions/{id}    correct label / category / amount / notes
GET  /api/review                needs_review queue
GET  /api/sync/status           last_synced_at, next_sync_at, emails_processed_last_sync
POST /api/sync/trigger          manual sync (runs async, returns job_id)
GET  /api/auth/gmail            start OAuth2 flow (redirects to Google)
GET  /api/auth/callback         OAuth2 callback (stores token, redirects to dashboard)
GET  /api/stats                 monthly summary: total_expense, total_income, by_category[]
```

---

## Dashboard (Phase 1)

Four pages served as Jinja2 templates:

1. **Home / Inbox** — stat cards (month expense, income, needs_review count, last sync), recent transactions table with inline classify link for review items
2. **Transactions** — filterable, sortable full transaction list; each row links to Gmail source email
3. **Needs Review** — focused view of `needs_review` items; classify form with label + category + amount fields
4. **Settings** — Gmail OAuth connect/disconnect, manual sync trigger, sync interval display

---

## Gmail Sync Flow

1. Load `last_history_id` from `sync_state`
2. If first run: full inbox fetch (last 90 days), store `history_id`
3. If subsequent: `gmail.users.history.list(startHistoryId=last_history_id)` — only new messages
4. For each new message: fetch headers + snippet
5. Skip already-seen `gmail_id`s (idempotent)
6. Pass to classifier → extractor → insert into `emails` + `transactions`
7. Update `sync_state.last_history_id` and `last_synced_at`

---

## Error Handling

- Gmail API rate limit (429): exponential backoff, max 3 retries
- OAuth token expiry: auto-refresh via Google client library
- LLM API failure: fall back to `status: needs_review`, log error
- Extractor parse failure (no amount found): store transaction with `amount: null`, `status: needs_review`
- Postgres connection failure: APScheduler job logs error, retries on next scheduled run

---

## Out of Scope (Phase 1)

- Budget tracking and future purchase decisions (Phase 2)
- Multi-user support
- Mobile app
- CSV/export
- Push notifications
- Receipt image parsing

---

## Phase 2 Preview (not designed yet)

- Budget rules: set monthly limits per category, alert when approaching
- Purchase advisor: given a planned purchase, show impact on monthly budget
- Spending trends: charts over time
