# GexpenseTracker — Comprehensive Code Review Report

## Executive Summary

GexpenseTracker is a Gmail-powered expense tracking application built with FastAPI (Python 3.12), SQLAlchemy async, PostgreSQL, and a React frontend (in-browser Babel transpilation). The app syncs emails from Gmail, classifies financial transactions using LLMs + rule engines, deduplicates entries, and provides dashboards.

**Overall Assessment: Good foundation with solid security practices, but has notable issues in deployment security, performance scalability, test coverage, and architectural consistency.**

| Category | Rating | Key Finding |
|---|---|---|
| Architecture | 6.5/10 | Monolithic with mixed sync/async, raw SQL in startup |
| Code Quality | 7/10 | Well-structured but has duplication and tight coupling |
| Security | 6/10 | Good CSRF/session design but Docker secrets leak |
| Performance | 5.5/10 | N+1 queries, in-memory limits, no DB indexes |
| Testing | 6.5/10 | 34 test files but shallow integration coverage |
| Maintainability | 6/10 | Good module separation, but no CI/CD or linting |

---

## 1. Architecture Assessment

### Strengths
- **Clear module separation**: `app/api/`, `app/models/`, `app/classifier/`, `app/sync/`, `app/workers/`, `app/dedup/` follow logical boundaries
- **Async-first**: Uses `asyncpg`, `AsyncSession`, `asyncio` throughout
- **Task queue pattern**: `app/workers/queue.py` provides idempotent task management with per-user serialization for sync
- **Multi-provider LLM fallback**: `MultiLLMClient` with ranked providers and rate-limit awareness
- **Batch classification**: Reduces LLM API calls by grouping emails
- **Two-phase Gmail fetch**: Metadata-first then full bodies — smart optimization

### Issues

#### 1.1 Raw SQL in Startup Lifespan (HIGH)
`app/main.py:51-61` executes raw `ALTER TABLE` DDL statements on every startup:
```python
await db.execute(text("""
    ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id)
"""))
```
This is a migration concern that belongs in Alembic, not application startup. It also creates a race condition in multi-instance deployments.

#### 1.2 Mixed Sync/Async Patterns (MEDIUM)
The Gmail client (`app/gmail/client.py`) uses synchronous `google-api-python-client` wrapped in `asyncio.to_thread()`, but the rest of the app is async. The `_retry_with_backoff` function uses `time.sleep()` (blocking) inside what should be async code. This blocks the event loop during retries.

**Fix**: Use `await asyncio.sleep()` in an async retry wrapper.

#### 1.3 No Service Layer Abstraction (MEDIUM)
API handlers directly query models and manipulate ORM objects. There's no service layer between API and data access. `app/api/transactions.py` is 640 lines of mixed business logic, queries, and response formatting.

#### 1.4 Single-Process Task Queue (MEDIUM)
`app/workers/queue.py` is an in-memory `asyncio.Queue`. It cannot scale horizontally — if the app runs on multiple instances, tasks are not shared. For a single-instance deployment this is fine, but it's a hard scaling ceiling.

#### 1.5 Frontend Architecture (LOW)
The frontend uses React via CDN with in-browser Babel transpilation (`static/vendor/babel.min.js`). This means:
- No build step, no tree-shaking, no minification
- Babel runs at page load in the browser — slow initial render
- No TypeScript, no component testing framework
- 17 JSX files totaling ~114 lines (truncated count, likely more)

---

## 2. Code Quality Findings

### Strengths
- **Pydantic models for request validation**: `TransactionPatch`, `BulkAction`, `FetchRangeBody` all use Pydantic with validators
- **Good error handling**: Global exception handler suppresses stack traces in production
- **Consistent user-scoping**: All queries filter by `user_id` — no cross-user data leaks at query level
- **Domain-driven dedup**: 5-layer scoring pipeline in `app/dedup/service.py` is well-designed

### Issues

#### 2.1 Code Duplication in Dedup Service (MEDIUM)
`app/dedup/service.py` has `_score_pair()` (async, 112 lines) and `_score_pair_with_rules()` (sync, 100 lines) that are nearly identical — differing only in how they look up `DomainPairRule` (DB query vs dict lookup). This is a maintenance risk.

#### 2.2 Massive API Files (MEDIUM)
- `app/api/transactions.py`: 640 lines
- `app/api/settings.py`: 692 lines
- `app/api/stats.py`: 567 lines
- `app/dedup/service.py`: 883 lines

These should be decomposed into smaller modules.

#### 2.3 Tight Coupling in Classifier (MEDIUM)
`app/classifier/classifier.py` directly imports from `app.services.currency`, `app.services.category_service`, `app.classifier.merchant`, `app.classifier.merchant_entity`, etc. The `classify_email` function has 14 parameters, making it hard to test and compose.

#### 2.4 Inconsistent Error Handling (LOW)
Some endpoints raise `HTTPException`, others return `{"error": ...}` dicts. The sync API returns `{"error": "sync_already_running"}` while the transaction API raises `HTTPException(status_code=422)`.

#### 2.5 Magic Strings (LOW)
Role checks use `UserRole.owner` in some places and string `"owner"` in others:
```python
# app/api/admin.py:17
if current_user.role != "owner":

# app/api/auth.py:318
if user.role not in (UserRole.owner, "owner"):
```

---

## 3. Security Findings

### Strengths
- **CSRF protection**: Double-submit cookie pattern with `secrets.compare_digest`
- **Session rotation**: Tokens rotate every 7 days
- **HttpOnly + Secure cookies**: Session cookies are properly configured
- **Security headers**: `X-Frame-Options`, `CSP`, `X-Content-Type-Options` all set
- **Fernet encryption**: OAuth tokens and AI API keys encrypted at rest
- **Input validation**: Pydantic models with length limits and sanitization
- **Amount validation**: LLM amounts capped at ₹1 crore, flagged above ₹10 lakh
- **Audit logging**: `app/audit.py` with `log_audit` for sensitive operations

### Critical Issues

#### 3.1 Docker Compose Hardcoded Credentials (CRITICAL)
`docker-compose.yml:4-7`:
```yaml
environment:
  POSTGRES_USER: expense
  POSTGRES_PASSWORD: expense
  POSTGRES_DB: expense_tracker
```
Default credentials are committed to the repo. Anyone with access to the repo can connect to the database.

#### 3.2 Default SECRET_KEY in Config (HIGH)
`app/config.py:45`:
```python
SECRET_KEY: str = "change-me-in-production"
```
While the lifespan check prevents startup with the default key, the config default is still the plaintext string. If someone bypasses the check (e.g., by setting `TESTING=1` in production), all Fernet-derived keys become predictable.

#### 3.3 AI API Key Encryption Uses SECRET_KEY (HIGH)
`app/crypto.py:39`:
```python
key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
```
AI service API keys are encrypted with a key derived from `SECRET_KEY`. If `SECRET_KEY` is compromised, all user API keys are decryptable.

#### 3.4 CSP Allows `unsafe-inline` Scripts (MEDIUM)
`app/main.py:91`:
```
"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com"
```
`unsafe-inline` in CSP negates much of the XSS protection. Combined with in-browser Babel transpilation, any XSS vulnerability would be fully exploitable.

#### 3.5 Rate Limiter is In-Memory and Per-IP (MEDIUM)
`app/rate_limiter.py` uses a simple dict-based token bucket. In production behind a load balancer, each instance has its own rate limit state. Also, rate limits only apply to 5 endpoints — most API endpoints are unprotected.

#### 3.6 No Rate Limiting on Sensitive Endpoints (MEDIUM)
The following endpoints have no rate limiting:
- `POST /api/auth/claim-seed-data` (dev-only but still)
- `POST /api/sync/backfill-bodies` (can trigger massive Gmail API usage)
- `POST /api/admin/reset-my-data` (destructive operation)
- `PATCH /api/account/schedule-deletion` (account deletion)

#### 3.7 SQL Injection Risk in Raw Queries (LOW-MEDIUM)
`app/api/settings.py:597-614` uses f-strings for table names in raw SQL:
```python
await db.execute(text(f"DELETE FROM {table} WHERE user_id = :uid"), {"uid": uid})
```
The table names come from a hardcoded list, so this is safe in practice. But the pattern is risky if extended.

#### 3.8 No 2FA Enforcement on Login (LOW)
2FA can be set up (`/account/2fa/setup`) but is never checked during authentication. `app/auth_deps.py` does not verify TOTP codes.

---

## 4. Performance Findings

### Critical Issues

#### 4.1 N+1 Query Pattern in Stats (HIGH)
`app/api/stats.py:92-117` loads all expense rows into memory then sums in Python:
```python
expense_rows = (await db.execute(select(Transaction.amount)...)).scalars().all()
total_expenses = sum(float(a or 0) for a in expense_rows)
```
This should use `func.sum()` in SQL. Same pattern repeats for income, CC payments, and investments. For users with thousands of transactions, this transfers unnecessary data.

#### 4.2 No Database Indexes Defined (HIGH)
The models define `index=True` on a few columns (`User.email`, `ConnectedAccount.user_id`), but critical query columns lack indexes:
- `Transaction.email_id` (joined in almost every query)
- `Transaction.user_id` (via Email join — but Email.user_id is indexed)
- `Transaction.label`, `Transaction.status`, `Transaction.txn_date` (filtered in stats queries)
- `Email.sender_domain` (used in dedup and review queries)

#### 4.3 Full Table Scan in Export (MEDIUM)
`app/api/transactions.py:264`: `export_transactions` loads ALL transactions for a user into memory with no pagination. A user with 10,000+ transactions will cause memory pressure.

#### 4.4 In-Memory Sync Progress (MEDIUM)
`app/sync/progress.py` stores sync progress in a global dict `_sync_progress`. This is lost on restart and doesn't work in multi-instance deployments.

#### 4.5 Bulk Reprocess Loads All IDs (MEDIUM)
`app/api/review.py:159-166`: `reprocess_all` loads all `needs_review` transaction IDs into memory, then processes them with a semaphore. No progress persistence if the server restarts mid-operation.

#### 4.6 Frontend Loads All Transactions (MEDIUM)
`static/src/app.jsx:68-69` loads transactions with `limit: 50` but the counts object (line 227-233) filters the entire loaded array in JavaScript on every render:
```javascript
const counts = {
  unread: transactions.filter(t => !t.read).length,
  ...
};
```
This recomputes on every render.

### Minor Issues

#### 4.7 Body Text Truncated at 4000 Characters (LOW)
`app/gmail/client.py:183`: `_clean_body` truncates at 4000 chars. Long emails may lose critical transaction data.

#### 4.8 No Connection Pool Configuration (LOW)
`app/database.py:4` creates an engine with default pool settings. For production, `pool_size`, `max_overflow`, and `pool_timeout` should be configured.

---

## 5. Testing Assessment

### Strengths
- **34 test files** covering auth, classifier, sync, dedup, API endpoints, models, and UI
- **Good use of mocking**: `unittest.mock.AsyncMock`, `patch` for LLM clients and Gmail API
- **In-memory SQLite for tests**: Fast isolation via `sqlite+aiosqlite:///:memory:`
- **Tests for edge cases**: Bad LLM labels, empty merchants, currency conversion, timeout handling
- **Async test support**: `pytest-asyncio` properly configured

### Issues

#### 5.1 No Integration Tests with Real DB (MEDIUM)
All tests use SQLite in-memory, but the production database is PostgreSQL. SQLite doesn't support:
- `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- PostgreSQL-specific types and functions
- Concurrent transaction isolation levels

#### 5.2 Shallow API Test Coverage (MEDIUM)
`test_api.py` tests mostly empty-state responses. There are no tests for:
- Creating/updating/deleting transactions
- Bulk operations
- CSV export
- Search with various queries
- Pagination edge cases

#### 5.3 No LLM Integration Tests (MEDIUM)
All classifier tests mock `llm_client.classify_verbose`. There are no tests that verify:
- Actual LLM response parsing
- Batch response format handling
- Provider fallback behavior with real HTTP calls

#### 5.4 No Frontend Tests (HIGH)
The React frontend has zero tests — no component tests, no integration tests, no E2E tests. Given the in-browser Babel setup, there's no Jest/Vitest configuration.

#### 5.5 No Security Tests (MEDIUM)
No tests for:
- CSRF token validation
- Session expiration
- Role-based access control
- SQL injection prevention
- Rate limiting behavior

#### 5.6 Test Fixture Duplication (LOW)
Many tests repeat the `override_get_db` pattern inline instead of using the `db_session` fixture consistently.

---

## 6. Recommendations (Prioritized)

### P0 — Critical (Fix Immediately)

| # | Issue | File | Action |
|---|---|---|---|
| 1 | Docker Compose hardcoded DB credentials | `docker-compose.yml` | Use env vars or Docker secrets |
| 2 | No DB indexes on query-hot columns | All models | Add `index=True` to `Transaction.email_id`, `Transaction.txn_date`, `Transaction.label`, `Email.sender_domain` |
| 3 | Stats endpoints load all rows into memory | `app/api/stats.py` | Use `func.sum()`, `func.count()` in SQL instead of Python aggregation |

### P1 — High (Fix This Sprint)

| # | Issue | File | Action |
|---|---|---|---|
| 4 | Move raw ALTER TABLE to Alembic migrations | `app/main.py:51-61` | Create proper Alembic migration, remove from startup |
| 5 | Add rate limiting to sensitive endpoints | `app/main.py`, `app/rate_limiter.py` | Add limits for backfill, reset, deletion endpoints |
| 6 | Fix blocking `time.sleep()` in async Gmail client | `app/gmail/client.py:39,46` | Convert `_retry_with_backoff` to async with `await asyncio.sleep()` |
| 7 | Enforce 2FA check during authentication | `app/auth_deps.py` | Verify TOTP if `user.totp_enabled` |
| 8 | Paginate transaction export | `app/api/transactions.py:264` | Add date range filter or stream CSV |

### P2 — Medium (Next Sprint)

| # | Issue | File | Action |
|---|---|---|---|
| 9 | Deduplicate `_score_pair` and `_score_pair_with_rules` | `app/dedup/service.py` | Extract shared scoring logic, inject rule lookup as parameter |
| 10 | Decompose large API files | `app/api/*.py` | Split into sub-modules (e.g., `transactions/crud.py`, `transactions/export.py`) |
| 11 | Add PostgreSQL integration tests | `tests/` | Add test suite that runs against actual PostgreSQL |
| 12 | Add frontend test framework | `static/` | Add Vitest + React Testing Library |
| 13 | Persist sync progress to DB | `app/sync/progress.py` | Replace in-memory dict with `SyncProgress` model |
| 14 | Reduce `classify_email` parameter count | `app/classifier/classifier.py` | Use a context/dataclass object instead of 14 parameters |
| 15 | Add CI/CD pipeline | `.github/workflows/` | Lint, type-check, test, build on PR |

### P3 — Low (Backlog)

| # | Issue | File | Action |
|---|---|---|---|
| 16 | Remove `unsafe-inline` from CSP | `app/main.py:91` | Use nonce-based CSP or hash-based |
| 17 | Configure DB connection pool | `app/database.py` | Add `pool_size`, `max_overflow` from env vars |
| 18 | Standardize role checks | Throughout | Use `UserRole.owner` enum everywhere, not string `"owner"` |
| 19 | Add structured logging | Throughout | Replace `logging.info` with `structlog` or JSON logger |
| 20 | Frontend build step | `static/` | Replace in-browser Babel with Vite/esbuild build |

---

## Summary Statistics

| Metric | Value |
|---|---|
| Backend Python files | 81 |
| Backend lines of code | ~13,870 |
| Frontend JSX/JS files | 17 |
| Test files | 34 |
| Alembic migrations | 31 |
| API endpoints | ~60+ |
| Database tables | ~20 |
| LLM providers supported | 6 (Groq, Google, Grok, Scaleway, OpenRouter, Cloudflare) |
