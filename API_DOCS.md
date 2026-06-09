# MoneyFlow API Reference

Base URL: `http://localhost:8000/api`

All endpoints require authentication unless marked otherwise. Authentication is via
**session cookie** (browser) or **Bearer JWT** (mobile/API clients).

---

## Authentication

### `GET /api/auth/check-mode`
Returns `200` if `LOCAL_MODE=true`, `404` otherwise. Used by the login page.
```json
{"local_mode": true}
```

### `POST /api/auth/local-login`
Local mode login — creates a session for the default local user. Only available when `LOCAL_MODE=true`.
- **Response**: `302 Redirect` to `/` or JSON user bundle (if `Accept: application/json`)

### `GET /api/auth/google`
Start Google OAuth 2.0 flow.
- **Query**: `redirect` (optional) — custom redirect URI for mobile clients
- **Response**: `302 Redirect` to Google consent screen

### `GET /api/auth/callback`
Google OAuth callback.
- **Query**: `code`, `state`
- **Response**: `302 Redirect` to `/` (sets session cookie) or JSON JWT pair (mobile)

### `POST /api/auth/logout`
Invalidate current session.
- **Cookie path**: deletes session row + clears cookies
- **Bearer path**: expects `{"refresh_token": "..."}` in body; blacklists the refresh token

### `GET /api/auth/me`
Return current authenticated user profile.
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "owner|member",
  "name": "User Name",
  "avatar_url": "https://...",
  "onboarding_complete": true,
  "has_seed_data": false,
  "connected_accounts": [...],
  "ai_services": [...]
}
```

### `GET /api/auth/csrf-token`
Generate a CSRF token via double-submit cookie pattern. No auth required.
- **Response**: `{"csrf_token": "..."}` — also set as `csrf_token` cookie

### `POST /api/auth/token/refresh`
Exchange a valid refresh JWT for a new access+refresh pair. No auth required.
- **Body**: `{"refresh_token": "..."}`
- **Response**: `{"access_token": "...", "refresh_token": "...", "token_type": "bearer"}`

### `POST /api/auth/verify-2fa`
Verify a TOTP code and set the `totp_verified` cookie.
- **Body**: `{"code": "123456"}`
- **Requires**: valid session cookie

### Passkey (WebAuthn) Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/passkey/register/begin` | Generate registration challenge |
| POST | `/api/auth/passkey/register/complete` | Verify and store WebAuthn credential |
| POST | `/api/auth/passkey/assert/begin` | Generate assertion challenge (requires session) |
| POST | `/api/auth/passkey/assert/complete` | Verify assertion and set `passkey_verified` cookie |
| POST | `/api/auth/passkey/login/begin` | Generate assertion for passkey-first login (no session) |
| POST | `/api/auth/passkey/login/complete` | Verify assertion and create session |
| GET | `/api/auth/passkey/credentials` | List registered passkeys |
| DELETE | `/api/auth/passkey/credentials/{cred_id}` | Remove a passkey (requires 2FA) |

### `POST /api/auth/device-token`
Register a mobile push notification device token.
- **Body**: `{"token": "...", "platform": "ios|android"}`

### `DELETE /api/auth/device-token`
Remove a device token.
- **Body**: `{"token": "..."}`

### Invitations (Owner only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/invitations` | List invitations + members |
| POST | `/api/auth/invitations` | Create invitation: `{"email": "..."}` |
| DELETE | `/api/auth/invitations/{id}` | Revoke pending invitation |

---

## Transactions

### `GET /api/transactions`
List transactions with cursor-based pagination.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `label` | string | Filter: `expense`, `income`, `ignore` |
| `status` | string | Filter: `auto`, `confirmed`, `needs_review`, `corrected` |
| `date_from` | date | YYYY-MM-DD |
| `date_to` | date | YYYY-MM-DD |
| `category` | string | Category name or `other` |
| `cursor` | string | Base64 cursor for pagination (preferred) |
| `limit` | int | 1-100, default 50 |

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "label": "expense",
      "amount": 250.00,
      "currency": "INR",
      "merchant": "Swiggy",
      "category": "Food",
      "txn_date": "2025-12-15",
      "confidence": 0.95,
      "status": "auto",
      "classifier_method": "rule",
      "user_notes": null,
      "read": false,
      "flagged": false,
      "payment_mode": null,
      "transaction_type": "purchase",
      "email": {
        "id": "uuid",
        "subject": "Order confirmed",
        "sender": "no-reply@swiggy.in",
        "received_at": "2025-12-15T10:30:00"
      }
    }
  ],
  "total": 342,
  "next_cursor": "base64string"
}
```

### `GET /api/transactions/{transaction_id}`
Get a single transaction with full email body.
- Includes: `email.body_snippet`, `email.body_text`, `email.sender_domain`

### `PATCH /api/transactions/{transaction_id}`
Update a transaction. Auto-learns sender-domain rules on label/category changes.

**Body:**
```json
{
  "label": "expense",
  "category": "Food",
  "merchant": "Swiggy",
  "amount": 250.00,
  "txn_date": "2025-12-15",
  "user_notes": "Dinner",
  "read": true,
  "flagged": false,
  "status": "confirmed"
}
```
All fields optional.

**Response:** `{"id": "...", "status": "corrected", "learned_rule": {...}}`

### `GET /api/transactions/low-confidence`
Returns transactions with confidence below `LOW_CONFIDENCE_THRESHOLD` (0.7).

### `GET /api/search`
Full-text search across merchants, categories, amounts, and email subjects.

**Query:** `q` (min 2 chars), `amount_min`, `amount_max`, `limit` (1-200)

**Response:** Includes `items` array plus aggregated `insights` object.

### `GET /api/transactions/export`
Streaming CSV export. Supports `date_from`, `date_to`, `label` filters.
- Max 10,000 rows without date filter. Response is `text/csv`.

### `POST /api/transactions/bulk`
Bulk action on transactions.

**Body:**
```json
{
  "ids": ["uuid1", "uuid2"],
  "action": "mark_read|mark_unread|flag|unflag|delete|detect_duplicates|set_category|set_label",
  "select_all": false,
  "category": "Food",
  "label": "expense"
}
```
`select_all=true` applies to all user's transactions (max 5000).

### `POST /api/transactions/{transaction_id}/reclassify/preview`
Preview reclassification without saving.
- **Query**: `method=llm` (default) or `method=rules`

### `POST /api/transactions/{transaction_id}/reclassify`
Commit reclassification to DB. Auto-learns sender-domain rules.

### `POST /api/transactions/{transaction_id}/fetch-body`
Re-fetch clean email body text from Gmail API.

### `GET /api/transactions/duplicates`
Find potential duplicate expenses (same amount, same date, different senders).

---

## Stats & Analytics

### `GET /api/stats`
Aggregated stats endpoint. Combine multiple sections in one request.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `sections` | string | Comma-separated: `summary,categoryBreakdown,topMerchants,health,monthlySummary,monthlyTrend,budgets,confidence` |
| `period` | string | `1m`, `3m`, `6m`, `1y` (default: `1m`) |
| `date_from` | date | Overrides period |
| `date_to` | date | Overrides period |
| `category` | string | Filter by category |
| `months` | int | For health section: `3`, `6`, or `12` |
| `compare` | bool | Include previous period comparison |

### Individual Stats Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats/summary` | Income, expenses, savings rate, review counts |
| GET | `/api/stats/category-breakdown` | Spending by category with percentages |
| GET | `/api/stats/top-merchants` | Top 8 merchants by spend |
| GET | `/api/stats/monthly-summary` | 12-month income/expense/net/savings-rate table |
| GET | `/api/stats/monthly-trend` | Monthly income/expense trend |
| GET | `/api/stats/income-vs-expense` | Monthly income vs expense comparison |
| GET | `/api/stats/health` | Savings rate, runway, current balance, monthly net |
| GET | `/api/stats/confidence` | Classification confidence stats |

All accept `period`, `date_from`, `date_to`, `category` where applicable.

---

## Sync & Gmail

### `POST /api/sync/trigger`
Queue a Gmail sync task. Returns immediately.
- **Response**: `{"message": "Sync queued", "task_id": "..."}` or `{"message": "Sync already in progress"}`

### `GET /api/sync/progress`
Get real-time sync progress (in-memory).

### `GET /api/sync/status`
Get last sync time, next scheduled sync, and email filter.

### `PATCH /api/sync/settings`
Update sync email filter.
- **Body**: `{"email_filter": "all|unread|read"}`

### `POST /api/sync/fetch-range`
Synchronous fetch of emails in a date range.
- **Body**: `{"after_date": "YYYY-MM-DD", "before_date": "YYYY-MM-DD", "llm_priority": false, "sender": "...", "subject": "..."}`
- Max range: 365 days. Timeout: 30 minutes. Owner only.

### `POST /api/sync/trigger-fetch-range`
Async (queued) version of fetch-range.

### `POST /api/sync/backfill-bodies`
Backfill missing email body text from Gmail API.
- **Body**: `{"email_ids": ["..."]}` (empty = backfill all)
- Owner only. Progress tracked via `/api/sync/progress`.

### `POST /api/sync/trigger-backfill-bodies`
Background backfill (returns immediately).

### `POST /api/sync/trigger-clean-bodies`
Background job to re-fetch dirty email body text. Owner only.

### `GET /api/tasks`
List recent background tasks for the current user.

### `GET /api/tasks/{task_id}`
Get task status.

### `GET /api/llm/limits`
Get current LLM rate limit status for user's configured AI service.

### `GET /api/llm/status`
Get all available LLM providers (FreeLLMAPI proxy, trial, custom BYOK services). Owner only.

### `GET /api/alerts`
Get system alerts. Owner only.

### `POST /api/alerts/clear`
Clear system alerts. Owner only.

---

## Review Queue

### `GET /api/review`
List all needs-review transactions.
- **Query**: `count=true` returns just the count

### `POST /api/review/{transaction_id}/reprocess`
Re-run the full classification pipeline (rule engine + LLM) on a single transaction.

### `GET /api/review/reprocess-all/progress`
Get bulk reprocess progress.

### `POST /api/review/reprocess-all`
Kick off background bulk reprocessing of all needs-review transactions.

### `POST /api/review/batch`
Apply label to ALL needs-review transactions from a given sender domain. Also upserts a SenderRule.
- **Body**: `{"action": "ignore_domain|expense_domain|income_domain", "domain": "example.com", "category": "Food"}`

---

## Budgets

### `GET /api/budgets`
List budgets with current-month spending (including linked budget splits).

### `POST /api/budgets`
Create a budget.
- **Body**: `{"category": "Food", "monthly_limit": 5000}`

### `PATCH /api/budgets/{id}`
Update budget limit: `{"monthly_limit": 6000}`

### `DELETE /api/budgets/{id}`
Delete a budget.

### `GET /api/budgets/links`
List budget links (category-to-category splits).

### `POST /api/budgets/links`
Create a budget link.
- **Body**: `{"source_category": "Groceries", "target_category": "Food", "split_amount": 500}`

### `DELETE /api/budgets/links/{id}`
Delete a budget link.

### `POST /api/budget-llm/suggest`
Get AI-suggested budgets from transaction history. Requires an AI service.

---

## Rules

### Sender Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rules` | List user-defined sender rules |
| POST | `/api/rules` | Create/update: `{"sender_domain": "...", "label": "expense|income|ignore", "category": "..."}` |
| PATCH | `/api/rules/{domain}` | Update rule: toggle enabled, change label/category |
| DELETE | `/api/rules/{domain}` | Delete a rule |

### Pattern Rules (regex-based)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rules/patterns` | List all pattern rules |
| POST | `/api/rules/patterns` | Create: `{"regex_pattern": "...", "label": "expense|income", "merchant": "...", "category": "...", "confidence": 0.88}` |
| PATCH | `/api/rules/patterns/{id}` | Update pattern rule |
| DELETE | `/api/rules/patterns/{id}` | Delete pattern rule |

### Rule Tester

### `POST /api/rules/test`
Test which rules fire against a given sender/subject/body.
- **Body**: `{"sender_domain": "...", "subject": "...", "body": "..."}`
- **Response**: All matching rules + classification result

---

## Goals

### `GET /api/goals`
List savings goals with progress.

### `GET /api/goals/{goal_id}`
Get a single goal with progress.

### `POST /api/goals`
Create a goal.
- **Body**: `{"name": "Europe Trip", "target_amount": 200000, "target_date": "2026-12-31", "category": "Travel", "notes": "..."}`

### `PATCH /api/goals/{goal_id}`
Update a goal. All fields optional.

### `POST /api/goals/{goal_id}/contributions`
Add a contribution.
- **Body**: `{"amount": 5000, "note": "January savings"}`

### `DELETE /api/goals/{goal_id}`
Delete a goal and its contributions.

---

## Debt

### `GET /api/debts`
List debts sorted by remaining balance.

### `POST /api/debts`
Create a debt.
- **Body**: `{"name": "Home Loan", "total_amount": 5000000, "paid_amount": 50000, "interest_rate": 8.5, "target_date": "2035-01-01"}`

### `PATCH /api/debts/{id}`
Update a debt.

### `DELETE /api/debts/{id}`
Delete a debt.

---

## Recurring Expenses

### `GET /api/recurring`
List recurring expenses with monthly total.

### `POST /api/recurring`
Create a recurring expense.
- **Body**: `{"name": "Netflix", "amount": 649, "category": "Subscriptions", "frequency": "monthly|weekly|yearly", "day_of_month": 15, "active": true}`

### `PATCH /api/recurring/{id}`
Update a recurring expense.

### `DELETE /api/recurring/{id}`
Delete a recurring expense.

### `POST /api/recurring/find-from-transactions`
AI-powered: scan transaction history to suggest recurring expenses.

---

## Insights

### `GET /api/insights`
Rule-based spending insights (spending spikes, saving wins). 30-day comparison.

### `GET /api/insights/patterns`
Detect spending patterns (weekend spending, subscription totals).

### `POST /api/insights/explain`
Get an LLM-generated explanation of an insight.
- **Body**: `{"insight_id": "...", "title": "...", "body": "..."}`

### `POST /api/insights/compare`
Multi-month spending comparison. Uses LLM when available, rule-based fallback.
- **Body**: `{"months": 3}`

---

## Settings & Account

### `GET /api/account/me`
Get full user bundle (profile, settings, categories, AI services, connected accounts).

### `PATCH /api/account/settings`
Update user settings. Fields: `daily_digest`, `low_confidence_alerts`, `auto_categorize`, `confidence_threshold`, `monthly_ai_budget`, `active_ai_service_id`, `starting_balance`, `starting_balance_date`, etc.

### `PATCH /api/account/profile`
Update user profile: `full_name`, `display_name`, `phone`, `location`, `default_currency`, `timezone`.

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/account/categories` | List user categories |
| POST | `/api/account/categories` | Create category |
| POST | `/api/account/categories/generate` | Auto-generate categories from transactions |
| PATCH | `/api/account/categories/{id}` | Update category |
| DELETE | `/api/account/categories/{id}` | Delete category |
| GET | `/api/categories/canonical-map` | Canonical category alias map (public, cached) |

### AI Services (BYOK)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/account/ai-services` | Add an AI service: `{"provider": "gemini", "display_name": "...", "model_id": "...", "api_key": "...", "base_url": "..."}` |
| PATCH | `/api/account/ai-services/{id}` | Update AI service |
| DELETE | `/api/account/ai-services/{id}` | Delete AI service |
| POST | `/api/account/ai-services/validate` | Validate AI service connectivity |
| POST | `/api/account/ai-services/{id}/rotate-key` | Rotate API key |
| GET | `/api/account/ai-services/expiring` | List expiring keys |

### 2FA

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/account/2fa/setup` | Generate TOTP secret + QR code |
| POST | `/api/account/2fa/verify` | Verify TOTP code and enable 2FA |
| DELETE | `/api/account/2fa` | Disable 2FA (requires 2FA or recent auth) |

### Connected Accounts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/account/connected-accounts` | Add connected account |
| PATCH | `/api/account/connected-accounts/{id}` | Update connected account |
| DELETE | `/api/account/connected-accounts/{id}` | Remove connected account |

### Account Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/account/schedule-deletion` | Schedule account deletion (24-48h) |
| POST | `/api/account/cancel-deletion` | Cancel pending deletion |
| DELETE | `/api/account` | Immediate account deletion (requires 2FA) |

### LLM Usage & Budget

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/account/settings/llm-usage` | Daily/monthly LLM call and cost stats |
| GET | `/api/account/settings/user-llm-budget` | Per-user LLM budget with spend/tier/remaining |
| GET | `/api/account/settings/llm-trial` | Trial status for current user |

---

## Onboarding

### `POST /api/account/onboarding`
Create a new user with profile and default categories.
- **Body**: `{"email": "...", "full_name": "...", "default_currency": "INR", "timezone": "Asia/Kolkata", "invite_code": "..."}`

### `POST /api/account/onboarding/skip-gmail`
Skip Gmail connection during onboarding (local mode).

### `PATCH /api/account/onboarding/complete`
Mark onboarding as complete. Safe to call multiple times.

---

## Merchants & Aliases

### `POST /api/merchants/resolve`
Resolve a raw merchant string to canonical entity info.
- **Body**: `{"merchant": "swiggy instamart"}`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/merchants/aliases` | List merchant aliases |
| POST | `/api/merchants/aliases` | Create alias |
| GET | `/api/merchants/entities` | List merchant entities |
| GET | `/api/merchant-aliases` | List legacy merchant aliases |
| POST | `/api/merchant-aliases` | Create legacy alias |
| PATCH | `/api/merchant-aliases/{id}` | Update legacy alias |
| DELETE | `/api/merchant-aliases/{id}` | Delete legacy alias |

---

## Duplicates

### `POST /api/duplicates/scan`
Run duplicate detection on all expense transactions.

### `GET /api/duplicates`
List duplicate pairs. Query: `status=pending|confirmed|dismissed`

### `PATCH /api/duplicates/{pair_id}`
Resolve a duplicate pair.
- **Body**: `{"action": "confirmed|dismissed", "primary_tx_id": "uuid"}`

### `POST /api/duplicates/{pair_id}/reopen`
Reopen a resolved duplicate pair.

---

## Pre-Filter Rules

### `GET /api/filter/rules`
List email pre-filter rules. Supports `skip`/`limit` pagination.

### `POST /api/filter/rules`
Create a filter rule: `{"rule_type": "allowlist_domain|blocklist_domain|keyword_pattern", "value": "..."}`

### `DELETE /api/filter/rules/{id}`
Delete a filter rule.

### `POST /api/filter/refine`
LLM-powered: suggest filter rules from recent email decisions.

---

## Reconciliation

### `GET /api/reconciliation/health`
Run financial reconciliation checks — compare expected balance against tracked data.

### `GET /api/reconciliation/monthly`
Monthly reconciliation. Query: `month=YYYY-MM`

### `POST /api/reconciliation/cc-statement`
Compare tracked CC purchases against a monthly statement total.
- **Body**: `{"month": "2025-12", "statement_total": 25000.00, "currency": "INR"}`

### `GET /api/reconciliation/cc-accounts`
List detected credit card accounts from transaction merchant patterns.

---

## Exports

### `POST /api/export`
Create an async export job.
- **Body**: `{"date_from": "2025-01-01", "date_to": "2025-12-31", "label": "expense"}`
- Returns `{"id": "...", "status": "pending"}`

### `GET /api/export/jobs`
List export jobs.

### `GET /api/export/jobs/{job_id}`
Get export job status.

### `GET /api/export/jobs/{job_id}/download`
Download completed export CSV.

### `DELETE /api/export/jobs/{job_id}`
Cancel/delete an export job.

---

## Cleanup

### `POST /api/cleanup/emails`
Delete old discarded/review-pending emails (>90 days).
- **Body**: `{"dry_run": true}` (default) — set `false` to execute

---

## Admin (Owner only)

### `POST /api/admin/fetch-preview`
Fetch N emails from Gmail for inspection (no DB writes).
- **Body**: `{"limit": 10, "query": "newer_than:7d"}`

### `POST /api/admin/classify-test`
Run classification pipeline on raw inputs (no DB writes).
- **Body**: `{"sender": "...", "subject": "...", "body": "...", "use_llm": true}`

### `POST /api/admin/test-provider`
Test a specific LLM provider.

### `POST /api/admin/seed-merchants`
Seed merchant→category mappings.

### `POST /api/admin/reset-my-data`
Reset owner's data back to onboarding state.

### `GET /api/admin/domain-rules`
View built-in + learned domain rules.

### `POST /api/admin/generate-domain-rules`
Regenerate domain rules from transaction history.

### `GET /api/admin/sender-rules`
View all SenderRule entries.

### `GET /api/admin/audit-logs`
View audit log entries with filtering.

### Trial Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/trial/extend` | Extend user trial: `{"user_id": "...", "days": 7}` |
| POST | `/api/admin/trial/revoke` | End user trial: `{"user_id": "..."}` |

---

## Health

### `GET /health`
Simple health check. Public.
```json
{"status": "ok"}
```

### `GET /api/health/detailed`
Detailed health with component status (DB, Gmail, LLM, scheduler, worker queue). Owner only.

### `GET /api/health/ready`
Readiness probe. Returns `503` if database is down. Public.
```json
{"status": "ok"}
```

---

## SPA Routes (HTML)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Main SPA shell (Jinja2) |
| GET | `/login` | Login page |
| GET | `/mobile` | Capacitor mobile app shell |
| GET | `/oauth/success` | OAuth success page (mobile) |
| GET | `/sw.js` | Service worker |

---

## Common Error Responses

```json
{"detail": "Not authenticated"}          // 401 — missing/invalid session
{"detail": "Rate limit exceeded"}        // 429 — too many requests
{"detail": "Owner only"}                 // 403 — non-owner user
{"detail": "Internal server error"}      // 500 — unhandled exception
```

Rate limits are applied per-identifier (session cookie or IP). Auth-related endpoints have stricter limits.
