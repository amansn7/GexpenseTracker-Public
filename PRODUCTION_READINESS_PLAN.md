# Production Readiness Plan — MoneyFlow

**Generated:** 2026-05-20
**Source:** Senior Engineering Review + Production-Scale Analysis
**Target:** 100+ users, 50K+ transactions/user, zero data loss, sub-second p95

---

## Production-Impact Categorization

### Category A: Data Loss Risk (silent, unrecoverable)
| # | Issue | Trigger | Blast Radius |
|---|---|---|---|
| A1 | In-memory task queue lost on restart | Railway container restart mid-sync | All pending/running tasks vanish |
| A2 | Fire-and-forget progress writes silently drop | DB connection blip during sync | User sees stuck progress forever |
| A3 | `_idempotency` dict never pruned | Long-running process | OOM → crash → A1 |
| A4 | Nested event loop in `_load_from_db` | First access after restart | Crash on startup recovery |

### Category B: Security Breach
| # | Issue | Trigger | Blast Radius |
|---|---|---|---|
| B1 | AI API keys encrypted with SECRET_KEY | SECRET_KEY leak (logs, env dump) | All user LLM keys decryptable |
| B2 | 2FA cosmetic — never enforced | User enables 2FA, thinks protected | TOTP bypassed on every login |
| B3 | CSP `unsafe-inline` + in-browser Babel | Any reflected XSS | Full account takeover |
| B4 | Global socket timeout side effect | Any HTTP client in process | Breaks health checks, webhooks |

### Category C: Outage / Degradation at Scale
| # | Issue | Trigger | Blast Radius |
|---|---|---|---|
| C1 | Single queue, 3 workers, 100 users | Multiple concurrent syncs | 97 users wait hours |
| C2 | N+1 DB queries in per-tx dedup | New email during sync | 10K+ queries per sync → DB CPU 100% |
| C3 | Dedup O(N²) intra-batch comparison | 500 new messages in one sync | 250K Python comparisons → timeout |
| C4 | Stats queries full table scan (no indexes) | Dashboard load at 50K tx | 2-5s load time, DB connection pool exhaustion |
| C5 | Export loads all rows into memory | User exports 50K transactions | OOM → container crash |
| C6 | Bulk action `select_all` loads everything | User selects all 50K tx | OOM → container crash |
| C7 | Scheduler only syncs owner | Multi-user deployment | 99% of users never auto-sync |
| C8 | LLM provider demotion never resets | Enough 429s over time | Permanent fallback to worse providers |

### Category D: Unbounded Cost
| # | Issue | Trigger | Blast Radius |
|---|---|---|---|
| D1 | No LLM cost controls | Heavy sync day | $50-500/day in API charges |
| D2 | Batch classification on unlimited emails | User with 10K unread financial emails | Single sync = 2,000 LLM calls |
| D3 | No per-user budget or circuit breaker | Any user | One user's sync spikes everyone's cost |

---

## Phase Plan: Production Readiness

### Phase 3: Production Readiness (This Plan)

**Goal:** Make MoneyFlow safe to run at 100+ users with 50K+ transactions/user. Zero data loss, sub-second p95 dashboard, bounded LLM spend, enforced 2FA.

**Scope:** 4 waves, 16 tasks, ~40 hours estimated.

**Non-goals (deferred):** TypeScript migration, Redis/Celery queue, Sentry integration, frontend test framework, service layer refactoring.

---

## Wave 1: Stop the Bleeding (P0 — 6 hours)

*These fix silent data loss and security holes. Must deploy first.*

### 1A. Fix AI key encryption hierarchy

**Files:** `app/crypto.py`, `app/api/settings.py`

**Problem:** AI API keys encrypted with `SECRET_KEY`-derived Fernet key. If SECRET_KEY leaks, all user LLM keys are decryptable.

**Fix:**
1. Change `_ai_key_fernet()` to use `FERNET_KEY` instead of `SECRET_KEY`
2. Add a migration that re-encrypts all existing `UserAIService.encrypted_api_key` rows
3. If FERNET_KEY is not set, raise an error (don't fall back to plaintext)

**Verification:**
- Unit test: encrypt with FERNET_KEY, decrypt with same key, verify round-trip
- Unit test: verify decryption fails with wrong FERNET_KEY
- Migration test: run on DB with existing encrypted keys, verify all decrypt correctly after re-encryption

### 1B. Enforce 2FA during authentication

**Files:** `app/auth_deps.py`, `app/api/auth.py`

**Problem:** Users can enable TOTP but it's never checked during login.

**Fix:**
1. Add `totp_verified` flag to session cookie (separate from session token)
2. In `get_current_user()`, if `user.totp_enabled` and session lacks `totp_verified`, return 401 with `{"detail": "2fa_required", "totp_pending": true}`
3. Add `POST /api/auth/verify-2fa` endpoint that accepts TOTP code, verifies it, and sets `totp_verified` in session
4. Frontend: detect `totp_pending` response, show TOTP input modal

**Verification:**
- Unit test: user with totp_enabled, no totp_verified → 401 with totp_pending
- Unit test: valid TOTP code → 200 with totp_verified cookie
- Unit test: invalid TOTP code → 401
- Unit test: user without totp_enabled → normal auth flow (no 2FA prompt)

### 1C. Add database indexes for query-hot columns

**Files:** `alembic/versions/0034_add_production_indexes.py`

**Problem:** No indexes on `Transaction.email_id`, `Transaction.txn_date`, `Transaction.label`, `Transaction.status`, `Email.sender_domain`. Full table scans at 50K+ transactions.

**Fix:**
```python
op.create_index("ix_transactions_email_id", "transactions", ["email_id"])
op.create_index("ix_transactions_txn_date", "transactions", ["txn_date"])
op.create_index("ix_transactions_label_status", "transactions", ["label", "status"])
op.create_index("ix_transactions_created_at", "transactions", ["created_at"])
op.create_index("ix_emails_sender_domain", "emails", ["sender_domain"])
op.create_index("ix_emails_user_received", "emails", ["user_id", "received_at"])
```

**Verification:**
- Run `EXPLAIN ANALYZE` on stats_summary query before/after — expect 10-100x improvement
- Run migration on production-sized dataset (seed with 50K rows), verify < 5s

### 1D. Stream CSV export with hard cap

**Files:** `app/api/transactions.py`

**Problem:** `export_transactions` loads ALL rows into memory, builds CSV string, returns. OOM at 50K+ rows.

**Fix:**
1. Add `max_rows=10000` hard cap — return 422 if query exceeds it, require date range filter
2. Use `StreamingResponse` with a generator that yields CSV rows in batches of 500
3. Each batch: query 500 rows with cursor-based pagination (ORDER BY id, WHERE id > last_id)
4. Commit/close session after each batch to release DB connection

**Verification:**
- Integration test: export 10K rows, verify memory stays < 50MB
- Unit test: export without date range on 50K tx user → 422 with helpful message
- Manual test: verify CSV output is identical to before (same columns, same order)

---

## Wave 2: Scale the Core (P1 — 12 hours)

*These fix the bottlenecks that cause outages at 100+ users.*

### 2A. Fix N+1 dedup queries — batch-load rules

**Files:** `app/dedup/service.py`

**Problem:** `detect_and_record_duplicates()` does a DB query for `DomainPairRule` per candidate pair. At 50K transactions, 10K+ queries per sync.

**Fix:**
1. In `detect_and_record_duplicates`, load ALL `DomainPairRule` rows for the user ONCE into a dict
2. Create `_score_pair_with_rules()` variant that accepts `rules: Dict` instead of `db: AsyncSession`
3. Replace the per-pair `await db.execute(select(DomainPairRule)...)` with dict lookup
4. Keep the original `_score_pair(db)` signature for backward compatibility

**Verification:**
- Unit test: 100 new × 500 existing, verify ≤ 5 DB queries total (not 50,000)
- Benchmark: measure time before/after with 5K transactions — expect 10x improvement

### 2B. Fix intra-batch O(N²) dedup comparison

**Files:** `app/dedup/service.py`

**Problem:** `batch_detect_duplicates` does O(M²) comparisons within a batch of M new messages. At M=500, that's 250K comparisons.

**Fix:**
1. Group new transactions by `(amount, txn_date)` into a dict first — O(M)
2. Only compare transactions within the same `(amount, txn_date)` group — reduces comparisons from M² to Σ(group_size²)
3. For groups with size > 10, use a hash-based approach (hash sender_domain + amount + date) to find duplicates in O(M)

**Verification:**
- Unit test: 500 new messages with 50 duplicates, verify correct pairs found
- Benchmark: measure time with 500 messages — expect < 100ms (was seconds)

### 2C. Batch progress writes instead of fire-and-forget

**Files:** `app/sync/progress.py`

**Problem:** `_persist_progress` fires `asyncio.create_task(_write())` on every state change. Under heavy sync, hundreds of fire-and-forget DB writes per user. Exceptions silently swallowed.

**Fix:**
1. Replace fire-and-forget with a bounded queue: `asyncio.Queue(maxsize=100)`
2. Single background writer task that drains the queue every 2 seconds (or when full)
3. On queue full: drop oldest entry (log warning) instead of blocking
4. On writer exception: log error, don't swallow silently
5. Fix `_load_from_db()`: replace `asyncio.get_event_loop().run_until_complete()` with proper async call

**Verification:**
- Unit test: 500 progress updates in 10 seconds, verify ≤ 10 DB writes
- Unit test: writer exception → logged, not swallowed
- Unit test: `_load_from_db` called from async context → no nested event loop crash

### 2D. Fix `_idempotency` dict memory leak

**Files:** `app/workers/queue.py`

**Problem:** `_idempotency` dict (line 71) is never pruned. Grows forever → OOM.

**Fix:**
1. Add `_idempotency_max_size = 10000` constant
2. On every insert, check if dict exceeds max size
3. If exceeded, prune entries older than 1 hour (use a secondary `_idempotency_timestamps` dict)
4. Add `cleanup_idempotency()` method called by scheduler every 30 minutes

**Verification:**
- Unit test: insert 15K idempotency keys, verify dict stays ≤ 10K
- Unit test: old entries pruned, recent entries preserved

### 2E. Remove global `socket.setdefaulttimeout`

**Files:** `app/gmail/client.py`

**Problem:** `socket.setdefaulttimeout(30)` at line 71 affects ALL sockets in the process — health checks, webhooks, LLM HTTP calls, etc.

**Fix:**
1. Remove `socket.setdefaulttimeout(30)` from `_build_service()`
2. Set timeout on the httplib2/Google API client directly via `http = httplib2.Http(timeout=30)`
3. Verify all other HTTP clients (httpx in LLM client, etc.) already have explicit timeouts

**Verification:**
- Unit test: verify no `socket.setdefaulttimeout` calls in codebase
- Integration test: sync runs normally, health check responds within 1s

### 2F. Add LLM cost controls

**Files:** `app/classifier/llm/client.py`, `app/config.py`, `app/classifier/llm/providers.py`

**Problem:** No per-user budget, no daily cap, no circuit breaker on total LLM spend.

**Fix:**
1. Add `DAILY_LLM_BUDGET` env var (default: $10) — global circuit breaker
2. Add `per_user_daily_limit` to `UserSettings` (default: $5) — per-user cap
3. Track LLM spend in Redis or DB: `LLMSpendTracker` model with `user_id`, `date`, `tokens_in`, `tokens_out`, `estimated_cost`
4. Before each LLM call, check if user's daily spend exceeds limit → skip LLM, fall back to rules
5. Reset counters at midnight UTC
6. Add `GET /api/settings/llm-usage` endpoint showing current spend vs budget

**Verification:**
- Unit test: user exceeds daily budget → LLM skipped, rules fallback used
- Unit test: spend tracker resets at midnight
- Unit test: estimated cost calculation matches actual API billing

---

## Wave 3: Harden the Edges (P2 — 10 hours)

*These fix degradation modes and improve observability.*

### 3A. Fix scheduler to sync all users, not just owner

**Files:** `app/scheduler.py`

**Problem:** Scheduled sync only runs for `UserRole.owner`. Other users never auto-sync.

**Fix:**
1. Change `_sync_user()` to iterate over ALL active users (not just owner)
2. Add per-user sync interval from `UserSettings` (default: `SYNC_INTERVAL_HOURS`)
3. Stagger sync times: hash(user_id) % interval to avoid thundering herd
4. Add max concurrent syncs limit (default: 5) — queue excess

**Verification:**
- Unit test: 3 active users, verify all 3 get scheduled syncs
- Unit test: sync times are staggered (not all at same minute)

### 3B. Fix LLM provider demotion — add reset

**Files:** `app/classifier/llm/providers.py`

**Problem:** `rate_limit_count` never resets. After enough 429s, a provider is permanently demoted.

**Fix:**
1. Add `rate_limit_reset_after = 3600` (1 hour) to Provider class
2. On each successful call, decrement `rate_limit_count` by 1
3. If `rate_limit_count > 0` and `last_rate_limit_at + reset_after < now`, reset to 0
4. Add `reset_rate_limits()` method for manual admin reset

**Verification:**
- Unit test: provider rate-limited 5 times, wait 1 hour, verify count resets to 0
- Unit test: successful call decrements count

### 3C. Add structured logging

**Files:** `app/main.py`, `app/classifier/classifier.py`, `app/sync/`, `app/api/`

**Problem:** Plain `logging.info`/`logging.error` — no structured fields, no correlation IDs, no log levels by module.

**Fix:**
1. Add `structlog` to `requirements.txt`
2. Configure structlog in `main.py` lifespan: JSON output, add `request_id` to every log via middleware
3. Replace `logging.info("...")` with `logger.info("...", key=value)` in critical paths:
   - Sync start/end with email count, duration
   - LLM call with provider, model, tokens, cost, latency
   - Classification result with label, confidence, method
   - Error contexts with user_id, email_id
4. Add `LOG_LEVEL` env var (default: INFO)

**Verification:**
- Manual test: sync runs, verify JSON logs in stdout with request_id
- Manual test: LLM call, verify log contains provider, model, latency_ms, estimated_cost

### 3D. Add Docker HEALTHCHECK

**Files:** `Dockerfile`

**Problem:** No healthcheck instruction. Railway has `healthcheckPath` but Docker itself doesn't.

**Fix:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
```

**Verification:**
- `docker build . && docker run --health-cmd ...` → verify health status transitions: starting → healthy

### 3E. Add rate limiting to unprotected endpoints

**Files:** `app/main.py`, `app/rate_limiter.py`

**Problem:** Only 8 of ~60+ endpoints are rate-limited. Missing: bulk actions, transaction patch, review retrain, AI service config.

**Fix:**
Add to `RATE_LIMITS`:
```python
"/api/transactions/bulk": (10, 60),
"/api/transactions/{id}": (30, 60),
"/api/review/bulk-retrain": (5, 300),
"/api/settings/ai-services": (10, 60),
"/api/settings": (20, 60),
"/api/auth/verify-2fa": (5, 60),
```

Also: add per-user rate limiting (not just per-IP) for authenticated endpoints.

**Verification:**
- Unit test: 11 bulk actions in 60s → 429 on 11th
- Unit test: rate limit resets after window

### 3F. Fix bulk action `select_all` memory blowup

**Files:** `app/api/transactions.py`

**Problem:** `select_all: true` loads every transaction for a user into memory. No limit.

**Fix:**
1. Add `max_select_all=5000` hard cap
2. If count exceeds cap, return 422: "Too many transactions for bulk action. Use date range filter."
3. Process in batches of 500: query 500, apply action, commit, repeat

**Verification:**
- Unit test: select_all on 10K tx user → 422 with helpful message
- Integration test: select_all on 3K tx user → processes in 6 batches, memory stays < 50MB

---

## Wave 4: Observability & CI (P2 — 12 hours)

*These make the system debuggable and prevent regressions.*

### 4A. Add CI/CD pipeline improvements

**Files:** `.github/workflows/ci.yml`

**Problem:** Current CI runs tests but no linting, no type checking, no frontend build, no security scan.

**Fix:**
1. Add `ruff check` and `ruff format --check` step
2. Add `mypy app/` step (with per-module ignore list for gradual adoption)
3. Add `npm run build` step to verify frontend compiles
4. Add `alembic check` step to verify migrations are clean
5. Add `safety check` (or `pip-audit`) for known vulnerabilities in dependencies
6. Add coverage threshold: fail if coverage drops below 70%

**Verification:**
- PR with lint error → CI fails with specific error
- PR with type error → CI fails with mypy output
- PR with broken frontend build → CI fails

### 4B. Add ruff + mypy configuration

**Files:** `pyproject.toml` (new), `mypy.ini` (new)

**Problem:** No linting or type checking configuration.

**Fix:**
1. Add `pyproject.toml` with ruff config:
   - Line length: 120
   - Target: Python 3.11
   - Rules: E, F, W, I (isort), UP (pyupgrade)
   - Ignore: E501 (line too long — handled by formatter)
2. Add `mypy.ini`:
   - Strict mode: false (gradual adoption)
   - Check untyped defs: true
   - Ignore missing imports: true
   - Per-module overrides for test files

**Verification:**
- `ruff check app/` passes with 0 errors
- `mypy app/` passes with 0 errors (or documented ignore list)

### 4C. Add request correlation ID middleware

**Files:** `app/main.py`

**Problem:** No way to trace a request across multiple log lines.

**Fix:**
1. Add middleware that generates `X-Request-ID` (UUID) for every request
2. If client sends `X-Request-ID`, use it; otherwise generate new one
3. Add `request_id` to structlog context for the duration of the request
4. Include `X-Request-ID` in response headers

**Verification:**
- Manual test: curl endpoint, verify `X-Request-ID` in response
- Log inspection: all logs from one request share same `request_id`

### 4D. Add startup health report endpoint

**Files:** `app/main.py`, `app/api/health.py` (new)

**Problem:** `/health` returns `{"status": "ok"}` but doesn't report component readiness.

**Fix:**
1. Add `GET /health/detailed` endpoint:
   ```json
   {
     "status": "ok",
     "components": {
       "database": {"status": "ok", "latency_ms": 2},
       "redis": {"status": "not_configured"},
       "gmail_auth": {"status": "ok", "accounts_connected": 3},
       "llm_providers": {"status": "ok", "available": ["gemini", "grok"]},
       "scheduler": {"status": "ok", "jobs_scheduled": 5},
       "worker_queue": {"status": "ok", "workers": 3, "pending": 0}
     },
     "version": "git-sha",
     "uptime_seconds": 3600
   }
   ```
2. Add `GET /health/ready` for Kubernetes/Railway readiness probe (checks DB + Gmail auth)

**Verification:**
- Manual test: `/health/detailed` returns all components
- Manual test: kill DB, verify `/health/ready` returns 503

---

## Execution Order

```
Wave 1 (P0 — 6h):  1A → 1B → 1C → 1D
Wave 2 (P1 — 12h): 2A → 2B → 2C → 2D → 2E → 2F
Wave 3 (P2 — 10h): 3A → 3B → 3C → 3D → 3E → 3F
Wave 4 (P2 — 12h): 4A → 4B → 4C → 4D
```

**Total estimated effort:** ~40 hours

---

## Risk Assessment

| Task | Risk | Mitigation |
|---|---|---|
| 1A (AI key re-encryption) | HIGH — could break all user API keys | Test migration on copy of production DB first. Add rollback migration. |
| 1B (2FA enforcement) | MEDIUM — could lock out users who enabled 2FA | Add grace period: 2FA required only for users who enabled it > 24h ago |
| 1C (DB indexes) | LOW — additive only, no data change | Run `EXPLAIN ANALYZE` before deploying to verify improvement |
| 1D (streaming export) | LOW — same output, different delivery | Verify CSV byte-for-byte identical on sample dataset |
| 2A/2B (dedup optimization) | MEDIUM — logic change in critical path | Run before/after comparison on same dataset, verify identical pairs |
| 2C (batch progress) | MEDIUM — changes sync progress behavior | Verify frontend still shows accurate progress during sync |
| 2F (LLM cost controls) | MEDIUM — could block legitimate LLM calls | Start with high defaults ($10/day global, $5/user), monitor for 1 week |
| 3A (scheduler all users) | LOW — additive feature | Verify owner sync still works, member syncs start correctly |

---

## Rollback Plan

Each wave is independently deployable:
- Wave 1: Each task is a separate PR. Revert any PR to rollback.
- Wave 2: Dedup changes (2A/2B) should be deployed together. Progress batching (2C) is independent.
- Wave 3: All tasks are additive or behavior-improving. Safe to deploy individually.
- Wave 4: CI/CD and observability changes have zero runtime impact.

**Database migrations:** All migrations are additive (new indexes, new columns). No destructive changes. Rollback = run `alembic downgrade -1`.

---

## What's Deferred (Not in This Plan)

| Item | Reason | Suggested Timeline |
|---|---|---|
| Redis/Celery task queue | Requires infra change, not urgent for 100 users | Phase 4 |
| TypeScript + Vite frontend | Large effort, no production risk | Phase 5 |
| Service layer refactoring | Internal architecture, no user impact | Phase 4 |
| Frontend test framework | No frontend tests today, low risk | Phase 4 |
| Sentry/error tracking | Nice-to-have, not blocking | Phase 4 |
| PostgreSQL integration tests | SQLite tests cover most logic | Phase 4 |
| CSP nonce-based (remove unsafe-inline) | Requires frontend build pipeline | Phase 5 |

---

## Success Criteria

After this phase is complete:

1. **Zero data loss:** Task queue survives restart, progress persists, idempotency doesn't leak memory
2. **Security:** 2FA enforced, AI keys encrypted with independent key, CSP hardened
3. **Scale:** 100 concurrent users → no queue backup, dashboard loads < 1s at 50K tx
4. **Cost:** LLM spend capped at $10/day global, per-user budget enforced
5. **Observability:** Structured JSON logs, request correlation IDs, detailed health endpoint
6. **CI:** Lint + type check + test + frontend build on every PR
