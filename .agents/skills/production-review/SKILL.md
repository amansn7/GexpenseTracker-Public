---
name: production-review
description: "Production-readiness code review that checks for security vulnerabilities, error handling, logging, configuration, performance, and operational concerns. Use this skill when the user asks for a code review, PR review, quality check, production readiness check, or says 'review this', 'is this production ready', 'check my code'. Also trigger when reviewing pull requests that touch backend services, APIs, or infrastructure code. Works with Python, Node.js, Go, and Java codebases."
---

# Production Review

A senior-engineer-level code review focused exclusively on production readiness. This skill systematically evaluates code against a battle-tested checklist covering security, error handling, logging, configuration, performance, and operational concerns. It produces a severity-classified report with actionable fixes.

This is not a style review. It does not care about naming conventions or line length. It cares about the things that page you at 3 AM.

## Review Workflow

Follow these steps in order. Do not skip steps.

### Step 1: Identify the Stack

Before reviewing, determine:
- **Language and version** (Python 3.11, Node 20, Go 1.22, Java 21)
- **Framework** (FastAPI, Django, Flask, Express, Fastify, Gin, Spring Boot)
- **Database** (PostgreSQL, MySQL, MongoDB, Redis)
- **Infrastructure** (Docker, Kubernetes, serverless, bare VM)
- **Dependencies** — scan `requirements.txt`, `pyproject.toml`, `package.json`, `go.mod`, or `pom.xml`

This determines which checklist items apply. A CLI tool does not need CORS checks. A read-only internal service has different auth requirements than a public API.

### Step 2: Run Through the Production Checklist

Evaluate the code against every applicable section below. For each finding, note:
- What the issue is
- Where it is (file and line)
- Why it matters in production
- How to fix it (with a code example when possible)

Use the reference docs for stack-specific patterns:
- [OWASP Top 10 detection patterns](references/owasp-checklist.md)
- [Python production anti-patterns](references/python-patterns.md)
- [Node.js production anti-patterns](references/node-patterns.md)

### Step 3: Classify Findings by Severity

Every finding gets one severity level:

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Security vulnerability, data loss risk, or guaranteed crash in production | SQL injection, missing auth on admin endpoint, no database connection error handling |
| **HIGH** | Will cause issues under load, in edge cases, or during incidents | No connection pooling, missing timeouts on external calls, N+1 queries on list endpoints |
| **MEDIUM** | Best practice violation that increases operational risk over time | No structured logging, missing health checks, hardcoded config values |
| **LOW** | Code quality improvement that reduces future production risk | Missing type hints on API boundaries, no graceful shutdown handler, broad exception catches |

When in doubt, classify higher. A false alarm costs a code comment. A missed critical issue costs an incident.

### Step 4: Provide Actionable Fix Suggestions

Every finding above LOW must include a concrete fix. Not "add error handling" but the actual code. Show before and after. If the fix requires architectural changes, outline the steps.

### Step 5: Summary with Production-Readiness Score

Assign one of three ratings:

- **READY** — No critical or high issues. Medium issues are minor. Ship it.
- **NEEDS WORK** — No critical issues, but high-priority items must be addressed before production. Can ship to staging.
- **NOT READY** — Critical issues present. Do not deploy. Fix the critical items first.

---

## Production Checklist

### Security (OWASP-Aligned)

See [OWASP Top 10 detection patterns](references/owasp-checklist.md) for exhaustive detection strategies.

#### A01: Broken Access Control
- Every endpoint has explicit authorization — not just authentication
- Role checks happen server-side, never rely on client-side logic
- Object-level access control: user A cannot access user B's resources by changing an ID
- Admin endpoints are not just hidden — they are protected
- No directory traversal via user-supplied file paths

**Detection**: Look for endpoints missing `Depends(get_current_user)`, missing `@login_required`, or routes with no middleware. Search for path parameters used directly in file operations.

#### A02: Security Misconfiguration
- Security headers present: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- No default credentials anywhere
- Debug mode disabled in production (`DEBUG=False`, `app.debug = False`)
- Stack traces not exposed to clients
- HTTPS enforced (redirect HTTP to HTTPS)

**Detection**: Grep for `DEBUG = True`, `debug=True`, `app.debug`, `FLASK_DEBUG`. Check for missing security header middleware.

#### A03: Injection
- All SQL uses parameterized queries or ORM — never string interpolation
- OS commands use argument lists, never `shell=True` with user input
- Template rendering uses auto-escaping
- LDAP, XML, and other injection vectors covered

**Detection**: Grep for `f"SELECT`, `f"INSERT`, `f"UPDATE`, `f"DELETE`, `.format(` near SQL, `cursor.execute(f"`, `shell=True`, `os.system(`, `subprocess.call(.*shell=True`.

#### A10: Mishandling Exceptions
- Errors fail closed (deny access on error, not permit)
- Error responses never contain stack traces, SQL queries, or internal paths
- Custom error handlers for all expected error codes (400, 401, 403, 404, 500)

**Detection**: Look for bare `except:` or `except Exception:` that returns a 200 or passes silently. Check if custom exception handlers exist.

#### CORS
- Never `allow_origins=["*"]` on endpoints that accept credentials
- Specific origin whitelist for production
- `allow_credentials=True` never combined with wildcard origins

**Detection**: Grep for `CORSMiddleware`, `cors(`, `Access-Control-Allow-Origin`, and check the configuration.

#### Rate Limiting
- Per-user rate limits on all mutating endpoints
- Per-IP rate limits on authentication endpoints (login, register, password reset)
- Stricter limits on auth endpoints (e.g., 5 attempts per minute)
- Rate limit headers returned to clients (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

**Detection**: Search for rate limiting middleware (`slowapi`, `express-rate-limit`, `ratelimit`). If none found, flag it.

#### Secrets Management
- No hardcoded API keys, passwords, tokens, or connection strings
- Secrets loaded from environment variables or a secret manager (Vault, AWS Secrets Manager, GCP Secret Manager)
- `.env` files in `.gitignore`
- No secrets in Docker build args or image layers

**Detection**: Grep for patterns like `password = "`, `api_key = "`, `secret = "`, `token = "`, `DATABASE_URL = "postgres://`. Check if `.env` is in `.gitignore`.

---

### Error Handling

- **Structured error responses** — Consistent JSON format with `error`, `message`, `request_id` fields
- **Correlation IDs** — Every error response includes a `request_id` or `trace_id` that maps to logs
- **No raw tracebacks** — Production responses never contain Python/Node/Go stack traces
- **Correct HTTP status codes** — `400` for bad input, `401` for unauthenticated, `403` for unauthorized, `404` for not found, `409` for conflicts, `422` for validation errors, `500` for server errors. Never return `200` with an error body.
- **Graceful degradation** — When a non-critical dependency fails (cache, analytics, email), the request still succeeds with degraded functionality
- **Circuit breakers** — External service calls use circuit breakers to avoid cascading failures. After N failures, stop calling the service and return a fallback for a cooldown period.

**Detection**: Look for `except Exception: pass`, `except: pass`, generic catch-all handlers. Check if there is a global error handler. Look for `return {"error": ...}` with status code 200. Search for external HTTP calls without try/except.

---

### Logging & Observability

- **Structured logging** — JSON format in production, human-readable in development. Use `structlog`, `python-json-logger`, `pino`, or `zap`.
- **Request correlation IDs** — Every log line includes `trace_id` and/or `request_id`. These propagate across service boundaries.
- **No sensitive data in logs** — Never log passwords, tokens, credit card numbers, or PII. Scrub or mask before logging.
- **Correct log levels**:
  - `ERROR`: Something broke and needs human attention (an alert should fire)
  - `WARNING`: Something unexpected happened but was handled
  - `INFO`: Business-significant events (user created, order placed, payment processed)
  - `DEBUG`: Developer diagnostics (only enabled in non-production)
- **Health check endpoints**:
  - `/health/live` — Is the process running? Returns 200 immediately. Used by load balancers.
  - `/health/ready` — Can the service handle requests? Checks database, cache, required services. Used by orchestrators.
- **Metrics** — Request count, latency percentiles (p50, p95, p99), error rate, dependency health

**Detection**: Check for `print()` statements used as logging. Search for `logging.basicConfig` (usually means unstructured logging). Look for health check route registrations. Check if log output contains passwords or tokens in format strings.

---

### Configuration

- **12-factor compliance** — All configuration comes from environment variables, not files committed to the repo
- **Fail-fast on startup** — Missing required config raises an error at application startup, not on the first request that needs it. Validate all config in a settings module or config class.
- **No hardcoded values** — No hardcoded URLs (`http://localhost:5432`), ports, hostnames, or environment-specific values in application code
- **Environment separation** — Clear separation between dev/staging/prod config. No `if environment == "production"` scattered through business logic.
- **Secret rotation** — Config supports secret rotation without restart (or at minimum, restart-based rotation with no code changes)

**Detection**: Grep for `localhost`, hardcoded port numbers, `http://` or `https://` URLs in application code (not config files). Check if there is a settings/config module that validates on import. Look for `os.getenv` without a required flag or default-value fallback.

---

### Performance

- **N+1 queries** — List endpoints that fetch related objects in a loop instead of a JOIN or batch query
- **Missing indexes** — Foreign key columns and frequently-filtered columns have database indexes
- **Connection pooling** — Database connections use a pool (SQLAlchemy with pool, pgBouncer, HikariCP), not connect-per-request
- **HTTP client pooling** — Outbound HTTP uses persistent sessions (`httpx.AsyncClient`, `aiohttp.ClientSession`), not a new connection per request
- **Async discipline** — No blocking synchronous calls in async request handlers (no `time.sleep`, no synchronous `requests` library, no blocking file I/O)
- **Timeouts everywhere** — Every external call (HTTP, database, cache, gRPC) has an explicit timeout. Default timeouts are not acceptable for production.
- **Pagination** — List endpoints that can return unbounded results have pagination (cursor-based preferred over offset-based for large datasets)
- **Caching** — Read-heavy endpoints with stable data use caching (Redis, in-memory, CDN)

**Detection**: For N+1, look for ORM queries inside loops. For async issues, look for `import requests` in async codebases (should use `httpx` or `aiohttp`). For missing timeouts, check `httpx.get(`, `requests.get(`, `fetch(` calls for timeout parameters. For missing pagination, look for list endpoints that return `SELECT *` without `LIMIT`.

---

### Operational Readiness

- **Graceful shutdown** — The service handles `SIGTERM` by finishing in-flight requests before exiting (15-30 second grace period). No abrupt connection drops.
- **Database migrations** — Migrations are backward-compatible with the previous code version (for rolling deploys). No `NOT NULL` without defaults, no column renames without aliasing, no table drops without a deprecation period. For detailed patterns, see `production-postgres`.
- **Container health checks** — Dockerfile includes `HEALTHCHECK` or Kubernetes deployment has `livenessProbe` and `readinessProbe`. For container hardening, see `production-docker`.
- **Backward compatibility** — API changes are additive. Removing or renaming fields breaks existing clients. Use API versioning for breaking changes.
- **Resource cleanup** — File handles, database connections, and temp files are cleaned up using context managers (`with`, `try/finally`, `defer`). No resource leaks under error conditions.
- **Dependency health** — The service reports the health of its dependencies (database, cache, external APIs) via the readiness endpoint or metrics.
- **Startup/shutdown ordering** — Database connection pools open on startup and close on shutdown. Background tasks are canceled on shutdown.

**Detection**: Search for signal handlers (`signal.signal`, `process.on('SIGTERM')`, `os.signal.Notify`). Check for `with` statements on file and connection operations. Look for lifespan/startup/shutdown hooks in the framework. Check if the Dockerfile has a `HEALTHCHECK` instruction.

---

## Severity Classification Reference

Use this when deciding between two severity levels:

| Question | If yes... |
|----------|-----------|
| Can an attacker exploit this remotely without authentication? | CRITICAL |
| Can this cause data loss or corruption? | CRITICAL |
| Will this crash the service under normal production load? | CRITICAL |
| Will this cause errors under high load or specific edge cases? | HIGH |
| Does this create an operational blind spot (no logs, no metrics)? | HIGH |
| Does this violate a well-known best practice with clear consequences? | MEDIUM |
| Could this become a problem as the codebase or traffic grows? | MEDIUM |
| Is this a code quality issue with indirect production impact? | LOW |

---

## Output Format

Present the review in this format:

```
## Production Review: [component name]

**Stack**: [detected stack, e.g., "Python 3.11 / FastAPI 0.109 / PostgreSQL 16 / Docker"]
**Files Reviewed**: [count and key files]
**Production Readiness**: [READY / NEEDS WORK / NOT READY]

### Critical Issues
> These must be fixed before any production deployment.

1. **[Category] [Short title]** — `file.py:42`
   [What the issue is and why it matters]

   ```python
   # Before (vulnerable)
   ...
   # After (fixed)
   ...
   ```

### High Priority
> Fix these before production traffic.

1. ...

### Medium Priority
> Address these in the next sprint.

1. ...

### Low Priority / Recommendations
> Improve these when convenient.

1. ...

### What's Done Well
> Acknowledge good practices already in place.

- ...

---
**Summary**: [1-2 sentence summary of the overall state and the most important action items]
```

---

## Cross-References

- For FastAPI-specific production patterns (lifespan, middleware, async), see **production-fastapi**
- For database migration safety, indexing, and connection pooling, see **production-postgres**
- For container hardening (multi-stage, non-root, distroless, secrets), see **production-docker**
- For pre-deployment validation and rollback plans, see **production-deploy**
- For observability setup (OpenTelemetry, structured logging, alerting), see **production-monitoring**
- For architecture planning with production constraints, see **production-planner**
