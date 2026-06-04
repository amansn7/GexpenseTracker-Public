# Architecture Review: MoneyFlow (GexpenseTracker)

**Review Date:** June 4, 2026
**Target:** 10,000 active users, 1,000 concurrent, 5× traffic spikes
**Review Team:** Principal Architect, Staff Engineer, SRE, Security Architect, Data Architect

---

## Executive Summary

MoneyFlow is a well-structured personal finance application with strong security foundations (CSP, HSTS, correlation IDs, structured logging, SSRF protection) and a thoughtful multi-provider LLM classification pipeline. However, the architecture makes several **single-machine assumptions** that prevent it from scaling beyond a few hundred concurrent users, and contains **critical data corruption paths** in the classification and dedup pipeline.

**Bottom line:** This is an excellent single-user or small-team app. It is NOT production-ready for 10,000 users.

---

## 1. HIGH-LEVEL ARCHITECTURE REVIEW

### Strengths
- Clean modular structure (FastAPI + SQLAlchemy async + JSX frontend)
- Well-separated concerns in the classification pipeline (rules → rule engine → multi-provider LLM)
- Multi-provider LLM architecture with automatic fallback and rate-limit backoff
- Comprehensive security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy)
- Structured JSON logging with correlation IDs
- Pre-computation rollup tables (PeriodRollup, DailySnapshot) show forward-thinking design
- Full test suite (77 files) with CI pipeline
- Well-designed DB migration process with preflight scripts

### Weaknesses
**The architecture has four fundamental problems:**

1. **Single-process, single-machine assumptions everywhere**
   - In-memory rate limiter (per-process, lost on restart, bypassable with multiple workers)
   - In-memory rollup cache (per-process, lost on restart, O(n) invalidation)
   - In-memory task queue (unbounded, no persistence, OOM risk)
   - In-memory LLM spend tracker (race conditions on concurrent classify)
   - In-memory merchant alias caches (process-global, no user isolation)
   - All state assumed to live in one Python process

2. **Synchronous recompute in the request path**
   - `recompute_month` fires 8+ aggregation queries synchronously on every transaction write
   - User PATCH requests block until rollups recompute
   - No background job pattern for expensive rollup computation
   - At 10K users, this kills request latency

3. **Scheduler cannot keep up**
   - 3 worker processes, 5 concurrent syncs
   - At 500+ users, the 2-hour sync cycle cannot drain before the next cycle starts
   - At 10K users, sync takes 56+ hours to drain
   - Dedup job also runs sequentially over ALL users — never completes at scale

4. **Data corruption paths in the pipeline**
   - Pre-extraction regex silently overrides LLM amount (no validation they agree)
   - Batch dedup creates pending pairs without fixing them (amounts double-counted)
   - No rollup recompute after duplicate resolution or batch actions
   - Concurrent syncs can both classify the same email (no SELECT FOR UPDATE)
   - `reprocess_all` opens N concurrent sessions with no ordering or locking
   - Rules-only fallback ignores currency conversion entirely

### Missing Components
- No background job system for expensive operations (rollups, exports)
- No distributed rate limiting (Redis-backed)
- No Prometheus metrics endpoint
- No alerting configuration
- No database read replicas for analytics queries
- No table partitioning for transactions/emails/classification_log
- No component health check for Redis or disk space
- No deploy workflow in CI/CD
- No dependency vulnerability scanning for frontend (npm audit)

### Future Risks
- LLM budget ($10/day) shared across all users prevents LLM classification at scale
- Global DomainPairRule table means cross-user data pollution
- JSX files compiled independently (30+ HTTP requests) creates poor mobile UX
- No data retention policy for AuditLog (fastest-growing table)
- No backup/disaster recovery strategy documented

---

## 2. SCALABILITY ASSESSMENT

### 100 Users
- **Works**, with minor issues:
  - In-memory queue is viable
  - Progress writer's 100-slot queue may overflow during sync storms
  - Scheduler keeps up (33 min cycle vs 2h window)
  - LLM budget adequate ($0.10/user/day ≈ 200-500 calls at Gemini pricing)

### 500 Users — FIRST BREAKPOINT
- **Scheduler falls behind:** 500 users × 60s sync / 3 workers = 2.8h vs 2h window
- **Sync lag grows permanently:** Users wait 3-6 hours for new transactions
- **Dedup job starts overlapping:** 1h schedule, each user takes ~2s = ~17 min total, but overlap risk grows
- **Progress writer drops updates:** 100-slot queue fills faster than 2s drain cycle

### 1,000 Users
- **Scheduler catastrophically behind:** 5.6h per cycle
- **In-memory queue OOM risk:** Unbounded `maxsize=0` asyncio.Queue
- **LLM budget exhausted:** $0.01/user/day = 20-50 LLM calls; most users get rules-only
- **Connection pool contention:** 15 max connections cannot serve 3 workers + scheduler + API requests
- **Stats queries degrade:** 8+ aggregation queries per recompute, 5 separate COUNT queries per stats load
- **Missing indexes bite:** `func.lower(category)` forces full sequential scan on every stats query

### 10,000 Users — CATASTROPHIC
- **Sync never completes:** 56h per cycle, queue grows to millions of pending tasks
- **Dedup job never runs:** 5.5h per full scan on a 1h schedule, infinite overlap
- **In-memory queue OOM:** Millions of Task objects × 10KB payload = tens of GB
- **LLM classification effectively dead:** $0.001/user/day = 2-5 calls/day
- **Stats API times out:** 8 recompute queries × 10K transactions per user-month × joined tables
- **Rate limiter useless:** Per-process state, 3+ workers = 3× effective limit
- **Rollup cache useless:** Cache miss cascade on every first-of-month access
- **DB connection pool exhausted:** Requests queue and timeout
- **Progress tracking broken:** 100-slot queue means zero reliable progress updates

### Bottleneck Summary

| Component | Bottleneck | Breaks at |
|-----------|-----------|-----------|
| Sync scheduler | 3 workers, 60s/sync | 500 users |
| In-memory queue | Unbounded growth | 1,000 users |
| LLM budget | $10/day shared | 1,000 users |
| DB connection pool | 15 max | 500+ concurrent |
| Stats recompute | 8 synchronous queries | 1,000 users |
| Missing indexes | Full table scans | 5K+ transactions/user |
| Progress writer | 100-slot queue | 100+ concurrent syncs |
| Dedup job | Full sequential scan | 1,000 users |
| Rate limiter | Per-process, no persistence | Any multi-worker |

---

## 3. DATABASE REVIEW

### Schema Design
- **Good:** UUID PKs, proper FK relationships, enum fields for labels/statuses
- **Good:** Unique constraints on gmail_id, (user_id, period_type, period_key)
- **Bad:** 23 tables, but no partitioning strategy for fast-growing tables (transactions, emails, classification_log, audit_log)
- **Bad:** `DailySnapshot` model is dead code — never written or read
- **Bad:** `subscription_total`/`subscription_count`/`txn_version` always set to 0

### Missing Indexes (Critical)
| Table | Missing Index | Impact |
|-------|--------------|--------|
| transactions | `LOWER(category)` | 15+ stats queries do full table scan |
| transactions | `(user_id, txn_date)` | Every date-range query scans |
| transactions | `(user_id, created_at)` | Every list query |
| classification_log | `email_id` | DELETE per email = full table scan |
| duplicate_pairs | `(primary_tx_id)`, `(duplicate_tx_id)` | OR queries in resolution |
| goal_contributions | `contributed_at` | Timeline queries |
| audit_logs | `created_at` | Cleanup/pruning |
| merchant_aliases | `canonical` | Lookup joins |

### N+1 Query Patterns
1. Bulk delete: Per-row Email fetch (already eager-loaded via `selectinload`) — `transactions.py:132-138`
2. `get_monthly_summary`: 12 sequential `get_rollup` calls — `stats_service.py:375-412`
3. `get_health`: Calls `get_monthly_summary` (12 calls) + 4 live queries — duplicates work

### Rollup Strategy
- **Pre-computed monthly rollups** is the right pattern
- **But:** `recompute_month` runs synchronously in the request path (8+ queries, blocks HTTP response)
- **But:** Cache is process-local dict — lost on restart, duplicated across workers
- **But:** No background job for recompute — every PATCH/classify triggers full recompute
- **But:** Cache invalidation is O(n) over ALL cache keys — `stats_service.py:37-39`
- **But:** Some operations (dedup resolution, batch action) never call `recompute_month`

### Connection Pool
- Pool size: 5, Max overflow: 10 (effective max: 15)
- No `pool_pre_ping=True` — stale connections may be returned
- No queue class customization — 30s timeout then hard failure
- **15 connections is drastically insufficient for 1,000 concurrent users**

### Locking Risks
- **Check-then-insert** in `recompute_month` — unique violation race on concurrent calls
- **Per-batch commit in bulk operations** — partial updates on failure
- **No `ON CONFLICT DO UPDATE`** — missing PostgreSQL upsert optimization
- **No `SELECT ... FOR UPDATE`** anywhere — no pessimistic locking on any critical path

---

## 4. API ARCHITECTURE REVIEW

### Design Consistency: **Moderate**
- Mix of REST (transactions CRUD) and RPC (bulk, reclassify, fetch-body) patterns
- Composite stats endpoint (`?sections=summary,categoryBreakdown`) with camelCase section names
- Flat namespace instead of nested REST — will cause URL collisions as resource tree deepens

### Pagination: **Offset-based, O(N) at scale**
- `OFFSET` pagination on `/api/transactions` — degrades at 5K+ rows
- `COUNT(*)` before every list query (line 282) — expensive join + scan
- Missing cursor-based pagination alternative

### Rate Limiting: **Critical gaps**
- In-memory, per-process, lost on restart — bypassable with multiple workers
- Rate limit identifier from unverified JWT — attacker can forge any `sub` claim
- `_extract_jwt_user_id` decodes without signature verification (line 182, `verify_signature=False`)
- No cleanup of stale buckets — memory leak over time

### Error Handling: **Good but not perfect**
- Global exception handler leaks `str(exc)` + `type(exc).__name__` in DEV_MODE
- Consistent `{"detail": "..."}` format for most errors
- 502 Bad Gateway for Gmail failures — correct use

---

## 5. SECURITY REVIEW

### Critical Findings
| ID | Finding | Risk |
|----|---------|------|
| S-01 | HS256 symmetric JWT — any token validator can forge tokens | **CRITICAL** |
| S-02 | Rate limit bypass via unverified JWT `sub` extraction | **CRITICAL** |
| S-03 | WEB Authn passkey 2FA verification is broken for Bearer JWT users (HMAC message mismatch) | **CRITICAL** |
| S-04 | DNS rebinding vulnerability in SSRF validation | **HIGH** |
| S-05 | FERNET_KEY weak derivation via single SHA-256 iteration | **HIGH** |
| S-06 | No minimum key length validation for any secret | **HIGH** |
| S-07 | DEV_MODE exception detail leak if misconfigured in production | **HIGH** |
| S-08 | Audit log writes silently fail — events lost without alert | **HIGH** |
| S-09 | In-memory rate limiter — state lost on restart, per-process only | **HIGH** |
| S-10 | TOTP secret decryption falls back to plaintext on any InvalidToken | **HIGH** |

### Medium Findings
| ID | Finding | Risk |
|----|---------|------|
| S-11 | Mobile CSP uses `unsafe-inline` + `unsafe-eval` (defeats XSS protection) | MEDIUM |
| S-12 | `unsafe-inline` in style-src for all pages (CSS injection) | MEDIUM |
| S-13 | Binary role model (owner/member only) — no granular permissions | MEDIUM |
| S-14 | CSRF token is 30-day static, never rotated | MEDIUM |
| S-15 | Session not bound to IP or User-Agent — no hijacking detection | MEDIUM |
| S-16 | WEB Authn challenge not stored server-side (relies on HMAC) | MEDIUM |
| S-17 | Audit logging opt-in, not automatic — most endpoints not covered | MEDIUM |
| S-18 | WEB Authn RP ID derived from GOOGLE_REDIRECT_URI — fragile | MEDIUM |
| S-19 | Session token stored as raw binary in DB (not hashed) | LOW |
| S-20 | CORS allows `methods: *` and `headers: *` | LOW |
| S-21 | OAuth state not bound to requesting user/IP | MEDIUM |
| S-22 | No PKCE in OAuth flow | LOW |
| S-23 | Unvalidated `full_name` from Google OAuth (stored XSS risk) | MEDIUM |
| S-24 | No brute-force lockout on TOTP verification | MEDIUM |
| S-25 | Unbound `ids` array in BulkAction and `q` parameter in search — OOM vector | MEDIUM |

---

## 6. RELIABILITY & FAULT TOLERANCE

### Single Points of Failure
| Component | SPOF | Impact |
|-----------|------|--------|
| Single Python process | Single-machine deployment | All users affected on crash |
| In-memory task queue | No persistence | All pending tasks lost on restart |
| In-memory rollup cache | No replication | Cold start causes recompute storm |
| In-memory rate limiter | No persistence | Limits reset on restart |
| Single DB connection pool | Single database | Database failure = total outage |
| Single sync scheduler | Single process | Sync stops if scheduler crashes |

### Cascading Failure Risks
1. **Cache miss cascade:** Cold start → every user's first request triggers `recompute_month` → 8+ aggregation queries each → DB pool exhaustion → all API requests timeout
2. **Sync backlog cascade:** Scheduler falls behind → queue grows → memory pressure → OOM → restart → cold cache → repeat
3. **LLM failure cascade:** One provider fails → all traffic shifted to remaining providers → their rate limits hit → more fallbacks → rules-only for everyone

### Recovery Strategy
- **None documented.** No disaster recovery playbook. No database backup/restore procedure. No rollback script.
- `recover_stale_progresses` marks stuck syncs as failed on restart — good for crash recovery
- No automated retry for failed sync tasks — transient Gmail API failure permanently loses progress

---

## 7. DATA PIPELINE & BUSINESS LOGIC

### Critical Data Corruption Risks

| ID | Issue | Location | Impact |
|----|-------|----------|--------|
| D-01 | Pre-extraction regex unconditionally overrides LLM amount | `classifier.py:554-557` | Wrong amounts persisted |
| D-02 | Batch dedup creates pending pairs without fixing them | `dedup.service.py:1036-1047` | Double-counted amounts in rollups |
| D-03 | No rollup recompute after duplicate resolution deletes transaction | `dedup.service.py:1203-1205` | Stale/inflated dashboard numbers |
| D-04 | No rollup recompute after batch action (domain-level approve) | `review.py:350` | Dashboard shows pre-approval numbers |
| D-05 | Concurrent syncs can classify same email (no SELECT FOR UPDATE) | `fetch.py:182` vs `classify.py:27` | Duplicate transactions |
| D-06 | `reprocess_all` opens N concurrent sessions with no locking | `review.py:209-277` | Lost updates, no ordering |
| D-07 | In-memory budget tracker race on concurrent classify | `client.py:55` | Budget exceeded silently |
| D-08 | Rules-only fallback ignores currency conversion | `classifier.py:679-727` | Wrong amounts for foreign transactions |
| D-09 | `DomainPairRule` is global — cross-user dedup pollution | `dedup.service.py:560` | One user's corrections affect all |
| D-10 | Dedup only checks `expense` — income duplicates silently double-counted | `dedup.service.py:333-335` | Inflated income numbers |

---

## 8. INFRASTRUCTURE & DEVOPS

### Critical Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| No deploy workflow | **CRITICAL** | CI only tests; no deployment pipeline, no staging env |
| No rollback capability | **HIGH** | No scripted rollback, no GitOps |
| No metrics infrastructure | **HIGH** | No Prometheus, no `/metrics`, no dashboards |
| No alerting | **HIGH** | Sentry errors only; no uptime, latency, or error budget alerts |
| Single-process deployment | **HIGH** | No load balancing, no zero-downtime deploys |
| Python version drift | **MEDIUM** | CI: 3.11, Docker: 3.12, pyproject: 3.11 |
| No Redis in CI | **MEDIUM** | Redis-dependent code untested in pipeline |
| No npm audit | **MEDIUM** | Frontend vulnerabilities unchecked |
| Coverage threshold 60% | **MEDIUM** | Low bar for production |
| mypy checks only subset | **HIGH** | Most app code not type-checked |

### What Works
- Multi-stage Docker build
- Non-root user in container
- Health check (Docker HEALTHCHECK + Railway liveness + detailed endpoint + readiness probe)
- Structured JSON logging with correlation IDs
- Content-hashed cache busting (SHA-256)
- Migration preflight scripts
- pip-audit in CI
- `.dockerignore` hygiene
- `.env.example` with production checklist

---

## 9. OBSERVABILITY MATURITY

| Dimension | Score | Assessment |
|-----------|-------|------------|
| Logging | **9/10** | Structlog, JSON, correlation IDs, redaction. Missing: worker trace context propagation |
| Metrics | **2/10** | No Prometheus, no request/DB/error metrics. Only `/health/detailed` |
| Tracing | **4/10** | Sentry at 10% sampling. Correlation IDs exist. No OpenTelemetry |
| Alerting | **2/10** | Sentry error alerts only. No proactive alerting |
| Dashboards | **0/10** | No Grafana or equivalent |

**Can engineers debug production issues quickly?** Partially. Correlation IDs + structured logging enable single-request debugging. But without metrics/dashboards, identifying systemic issues (slow queries, memory leaks, error rate increases) requires manual log grepping.

---

## 10. COST ANALYSIS

### Current Cost Drivers
1. **LLM API calls** — $10/day hard budget, but scaling cost = $10/day × N users / 1000 effective
2. **Database** — Single Postgres instance on Railway
3. **App hosting** — Single Railway container

### Scaling Cost Curve
| Users | Monthly LLM | Monthly DB | Monthly Hosting | Total |
|-------|------------|------------|-----------------|-------|
| 100 | $300 (if fully used) | ~$15 | ~$5 | ~$320 |
| 1,000 | $10 (capped) | ~$50 | ~$30 | ~$90 |
| 10,000 | $10 (capped, rules-only) | ~$200 | ~$200 | ~$410 |

**LLM budget becomes the primary cost constraint.** At 1,000+ users, the $10/day cap forces nearly all users to rules-only classification. The architecture's biggest value proposition (ML-powered expense tracking) degrades to keyword matching above ~500 active users.

### Wasteful Decisions
1. **`recompute_month` runs 8+ queries synchronously on every write** — wasteful recomputation that should be async
2. **30+ individual JS files loaded as separate HTTP requests** — could be bundled into 2-3 chunks
3. **`DailySnapshot` is dead code** — model + migration overhead with zero usage
4. **No CDN** — all static assets served from Python process, wasting CPU cycles
5. **`batch_detect_duplicates` always loads ALL DomainPairRule rows** — global table scanned fresh every call

---

## 11. TECHNICAL DEBT

### Critical Debt (Must Fix Before Scale)
1. Per-process in-memory state (rate limiter, queue, cache, spend tracker)
2. Synchronous `recompute_month` in request path
3. Missing critical indexes (`LOWER(category)`, `(user_id, txn_date)`)
4. No DB-level unique constraint on `DuplicatePair(primary_tx_id, duplicate_tx_id)`
5. Scheduler cannot keep up (3 workers, 5 concurrent syncs)
6. Unbounded in-memory task queue (`maxsize=0`)

### High Priority Debt (Will Slow Development)
7. Pre-extraction amount override can discard correct LLM amount
8. Missing `recompute_month` calls after dedup resolution and batch actions
9. Offset-based pagination (O(N) at scale)
10. JWT HS256 (symmetric) — should be RS256 (asymmetric)
11. No background job system for expensive operations
12. WEB Authn 2FA broken for Bearer JWT users
13. `reprocess_all` opens N concurrent sessions with no locking
14. Rate limiter identifier from unverified JWT

### Medium Priority Debt
15. `DailySnapshot` dead code
16. Floating-point conversion on `Numeric(12,2)` aggregates
17. N+1 queries in stats_service (12 sequential get_rollup calls)
18. Global DomainPairRule table (cross-user pollution)
19. No data retention policy for audit_logs
20. Unbound input parameters (ids, q) — potential OOM vectors

### Low Priority Debt
21. Session token not hashed in DB
22. OAuth state not bound to IP
23. No PKCE in OAuth
24. CORS allows `methods: *` and `headers: *`
25. `subscription_total`/`txn_version` always set to 0 in rollup

---

## 12. PRODUCTION READINESS SCORECARD

| Area | Score | Key Issues |
|------|-------|------------|
| **Architecture** | 4/10 | Single-process assumptions, no background job system, synchronous recompute |
| **Scalability** | 2/10 | Breaks at 500 users, catastrophic at 1,000+, scheduler fundamentally inadequate |
| **Security** | 6/10 | Strong CSP/headers, but HS256 JWT, broken 2FA for JWT, rate limiter bypass |
| **Reliability** | 3/10 | No fault tolerance, no DR plan, cascading cache-miss failures, partial-commit bugs |
| **Performance** | 3/10 | Missing indexes, N+1 queries, synchronous rollup recompute, OFFSET pagination |
| **Database Design** | 5/10 | Good schema, rollup tables, but no partitioning, missing critical indexes |
| **API Design** | 6/10 | Reasonably consistent, good error handling, but OFFSET pagination at scale |
| **Observability** | 4/10 | Excellent logging, but no metrics, no dashboards, no alerting |
| **DevOps** | 4/10 | Good Docker/CI, but no deploy pipeline, no rollback, no staging env |
| **Maintainability** | 7/10 | Clean structure, good test coverage, well-documented env vars |

**Overall: 4.4/10** — Not production-ready for 10,000 users.

---

## 13. SCALING ROADMAP

### Phase 1 — Ready for 1,000 Users (Critical Path)

| # | Problem | Approach | Complexity | Effort | Impact |
|---|---------|----------|------------|--------|--------|
| 1 | Sync scheduler falls behind | Increase workers to 10+, use Redis-backed queue, add per-user sync debounce | Medium | 2-3 days | High |
| 2 | In-memory rate limiter | Replace with Redis-backed distributed rate limiter (sliding window or token bucket) | Medium | 2 days | High |
| 3 | Missing critical indexes | Add: `LOWER(category)`, `(user_id, txn_date)`, `classification_log.email_id`, `(duplicate_pairs primary_tx_id)` | Low | 0.5 day | High |
| 4 | Connection pool too small | Increase pool_size=20, max_overflow=30, add pool_pre_ping=True | Low | 0.5 day | High |
| 5 | Rollup cache in-process | Replace with Redis-backed cache (aiocache or redis-py) | Medium | 1 day | High |
| 6 | `recompute_month` blocks request | Offload to async task queue; serve stale rollup + background refresh | Medium | 2-3 days | High |
| 7 | Progress writer drops updates | Increase queue size, batch more aggressively, or use Redis Streams | Low | 0.5 day | Medium |
| 8 | JWT HS256 → RS256 | Generate RSA keypair, update jwt_utils.py, rotate tokens | Medium | 1 day | High |

**Phase 1 Effort Estimate:** ~10-12 days

### Phase 2 — Ready for 10,000 Users

| # | Problem | Approach | Complexity | Effort | Impact |
|---|---------|----------|------------|--------|--------|
| 1 | Scheduler fundamentally inadequate | Replace with Celery/ARQ-based distributed scheduling with worker auto-scaling | High | 5-7 days | Critical |
| 2 | Dedup job never completes | Make adaptive: only scan users with new transactions since last run | Medium | 2 days | High |
| 3 | LLM budget shared across all users | Per-user daily cap + configurable budget tiers | Medium | 2 days | High |
| 4 | DB table partitioning | Partition transactions/emails/classification_log by month | High | 3-5 days | High |
| 5 | Pre-extraction amount override | Add validation: only override if LLM amount is None or confidence < threshold | Low | 0.5 day | Critical |
| 6 | Missing `recompute_month` calls | Add after: dedup resolution, batch action, duplicate deletion | Low | 0.5 day | Critical |
| 7 | OFFSET pagination → cursor-based | Add cursor parameter to `/api/transactions` | Medium | 1 day | Medium |
| 8 | Add DB-level UNIQUE on DuplicatePair | Migration + handle conflict errors gracefully | Low | 0.5 day | High |
| 9 | Global DomainPairRule → scoped | Add user_id column (nullable for legacy built-in rules) | Medium | 2 days | High |
| 10 | Add auto-audit middleware | Log all state-changing operations automatically | Medium | 1 day | Medium |

**Phase 2 Effort Estimate:** ~18-23 days

### Phase 3 — Ready for 50,000+ Users

| # | Problem | Approach | Complexity | Effort | Impact |
|---|---------|----------|------------|--------|--------|
| 1 | Read replica for analytics | Route stats/report queries to read replica | High | 3-5 days | High |
| 2 | Horizontal auto-scaling | Container orchestration (K8s/Nomad) with HPA based on queue depth + CPU | High | 2-3 weeks | Critical |
| 3 | Multi-region disaster recovery | Active-passive with automated failover | Very High | 3-4 weeks | High |
| 4 | Full observability stack | Prometheus + Grafana + Loki + Tempo | High | 2 weeks | High |
| 5 | CDN for static assets | CloudFront/Cloudflare CDN with immutable cache headers | Low | 1 day | Medium |
| 6 | Database read-write splitting | Configure SQLAlchemy with read/write separate engine URLs | Medium | 3-5 days | High |
| 7 | LLM budget auto-scaling | Dynamic per-user budget based on tier/usage patterns | Medium | 3 days | Medium |
| 8 | Background job system mature | Dead letter queues, retry with exponential backoff, task prioritization | High | 5-7 days | High |
| 9 | Staging/preview environments | Ephemeral environments per PR/preview deploy | Medium | 3-5 days | Medium |
| 10 | Full dependency vulnerability scanning | Trivy + npm audit + pip-audit + Dependabot | Low | 1 day | Medium |

**Phase 3 Effort Estimate:** ~8-12 weeks

---

## 14. BRUTAL FINAL VERDICT

### Would I deploy this to production for 10,000 users today?
**Absolutely not.**

### What breaks first?
1. **Sync scheduler** — at 500 users, the 3-worker queue cannot drain within the 2-hour window. Sync lag grows unbounded.
2. **Stats API latency** — missing indexes cause full table scans; `recompute_month` blocks the request thread for seconds.
3. **Rate limiter** — per-process, bypassable with multiple workers, no state across restarts.
4. **Progress tracking** — 100-slot queue drops updates silently; users see frozen progress bars.
5. **In-memory task queue** — unbounded growth → OOM under backlog pressure.

### What keeps me awake at night?
1. **Data corruption:** Pre-extraction regex silently overriding LLM amounts with wrong values.
2. **Double-counting:** Batch dedup creating pending pairs without fixing them → inflated rollups.
3. **Cross-user pollution:** Global DomainPairRule table means one user's corrections silently affect all users' dedup.
4. **No data loss detection:** No mechanism to detect when progress updates are dropped, rollup recomputes are skipped, or audit log writes fail.
5. **Security theater:** JWT HS256 symmetric signing + in-memory rate limiter bypassable with unverified JWT claims.

### Top 10 Risks
1. **Scheduler capacity** — 3 workers / 5 concurrent syncs cannot serve 500+ users
2. **Synchronous `recompute_month`** — blocks every write request with 8+ expensive queries
3. **Missing DB indexes** — full table scans on every stats query
4. **Per-process in-memory state** — rate limiter, cache, queue, spend tracker all lost on restart
5. **Pre-extraction amount override** — silently replaces correct LLM amount with wrong regex match
6. **Missing rollup recompute** — dedup resolution, batch action leave dashboard stale
7. **JWT HS256** — any token validator can forge tokens (symmetric signing)
8. **Rate limiter bypass** — unverified JWT `sub` extraction allows forged identifiers
9. **Global dedup rules table** — cross-user dedup pollution
10. **No disaster recovery** — no backup, no rollback, no failover plan

### Top 10 Improvements
1. Redis-backed distributed state (rate limiter, cache, queue)
2. Async `recompute_month` in background task queue
3. Add all critical missing indexes
4. Fix pre-extraction amount override with validation
5. Add rollup recompute after dedup resolution and batch actions
6. Migrate JWT from HS256 to RS256
7. Verify JWT signature before extracting rate limit identifier
8. Increase sync workers and add adaptive scheduling
9. Add DB-level UNIQUE constraint on DuplicatePair
10. Add auto-audit middleware + metrics endpoint

### What a Principal Architect would reject during design review
- "Why is the entire app's critical state in a single Python process?"
- "Why does `recompute_month` run synchronously in the request path?"
- "Why is there no index on `LOWER(category)` when 15+ queries filter on it?"
- "Why are you using symmetric JWT signing when you could use RS256?"
- "Why does the rate limiter extract user ID from an unverified JWT?"
- "Why is the progress writer a 100-slot in-memory queue that silently drops updates?"
- "Why is `DomainPairRule` a global table shared across all users?"
- "Why is the only sync strategy 'sync everyone every 2 hours' with 3 workers?"
- "Why is the WEB Authn 2FA passkey cookie signed over a different value than what's verified?"
- "Why are there 30+ separate JS files loaded as individual HTTP requests?"
- "Why does `DailySnapshot` exist if nothing writes to or reads from it?"
- "Why does `subscription_total` always get set to 0?"

### Final Scores

| Dimension | Score |
|-----------|-------|
| **Scalability** | **15/100** |
| **Architecture** | **40/100** |
| **Security** | **60/100** |
| **Reliability** | **25/100** |
| **Production Readiness** | **20/100** |
| **Overall Engineering Maturity** | **30/100** |

### Final Verdict

> **If I were the Principal Architect responsible for supporting 10,000 users, I would NOT approve this architecture.**

The application has a well-designed codebase with strong security fundamentals — the CSP headers, structured logging, correlation IDs, migration safety, and multi-provider LLM architecture all show thoughtful engineering. The core product concept is solid, and for a single-user or small-team deployment (< 100 users), this is an excellent application.

However, the architecture makes **fundamental single-machine assumptions** that prevent it from scaling:
- Every critical piece of state (rate limiter, rollup cache, task queue, LLM spend tracker, merchant caches) lives in a single Python process
- The only scaling strategy is vertical (bigger single machine)
- The sync scheduler cannot keep up past 500 users with the current worker count
- The dedup job, which scans ALL users sequentially, has an O(n) complexity that becomes impossible at 10K users

More critically, there are **active data corruption paths** in production:
- The pre-extraction regex silently overrides the LLM's amount computation without validation
- Batch dedup creates pending pairs without fixing them, causing double-counted amounts
- Multiple operations (dedup resolution, batch action) skip rollup recompute, leaving the dashboard stale
- Concurrent syncs can classify the same email due to no `SELECT FOR UPDATE`

The security architecture has real gaps: HS256 JWT signing, rate limiter bypass via unverified JWT claims, broken 2FA for Bearer JWT users, and cross-user dedup pollution through global tables.

**This architecture is a solid Phase 1 MVP.** With approximately 4-6 weeks of focused engineering work (Phase 1 + Phase 2 items), it could be hardened to support 1,000 users reliably. Supporting 10,000 users would require a significant re-architecture of the scheduler, queue, and state management layers — roughly 8-12 additional weeks.

**My recommendation:** Prioritize Phase 1 items now to stabilize at 500-1,000 users. Fix the data corruption bugs this week. Begin planning for distributed state management (Redis) as the next architectural investment.
