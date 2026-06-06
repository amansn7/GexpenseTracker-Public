# Production FastAPI Checklist

Use this checklist before shipping a FastAPI service to production.
Every unchecked item is a potential outage or security incident.

---

## Structured Logging
- [ ] Using structlog with JSON output in production, console in development
- [ ] stdlib logging bridged through structlog (third-party libs formatted identically)
- [ ] Noisy libraries silenced (uvicorn.access, httpx, sqlalchemy.engine)
- [ ] Every log line includes `request_id` via contextvars
- [ ] No `print()` statements anywhere in the codebase
- [ ] Log level configurable via environment variable

## Health Checks
- [ ] `/health/live` returns 200 unconditionally (never checks dependencies)
- [ ] `/health/ready` checks every dependency with a 2-second timeout each
- [ ] `/health/startup` gate prevents traffic before bootstrap completes
- [ ] Health endpoints excluded from access logs
- [ ] Health endpoints excluded from authentication middleware
- [ ] Responses include structured JSON with per-dependency status

## Error Handling
- [ ] All errors follow RFC 7807 Problem Details format
- [ ] Every error response includes `request_id`
- [ ] Unhandled exceptions return generic 500 (no tracebacks, SQL, or internal paths)
- [ ] Unhandled exceptions logged with full traceback server-side
- [ ] Sentry (or equivalent) captures unhandled exceptions with request_id
- [ ] AppError hierarchy covers 400, 401, 403, 404, 409, 422, 429, 500, 503

## Middleware
- [ ] Using pure ASGI middleware — NOT BaseHTTPMiddleware
- [ ] Middleware order: CORS -> Security Headers -> Request ID -> Logging
- [ ] RequestIDMiddleware injects X-Request-ID header on every response
- [ ] SecurityHeadersMiddleware adds HSTS, X-Content-Type-Options, X-Frame-Options
- [ ] LoggingMiddleware logs method, path, status, and duration for every request
- [ ] Health check paths excluded from access logging

## Pydantic v2
- [ ] Using Pydantic v2 API everywhere (model_dump, model_validate, ConfigDict)
- [ ] `strict=True` on models accepting external input
- [ ] `from_attributes=True` on response models serializing ORM objects
- [ ] Settings via pydantic-settings with SettingsConfigDict
- [ ] Required settings fail fast at import time, not on first request
- [ ] No v1 deprecated APIs (.dict(), .json(), @validator, class Config)

## Async Patterns
- [ ] No `requests` library — using `httpx.AsyncClient` everywhere
- [ ] No `open()` — using `aiofiles.open()` for file I/O
- [ ] No `time.sleep()` — using `asyncio.sleep()`
- [ ] HTTP client reused via `app.state` (not created per request)
- [ ] Every external call has an explicit timeout
- [ ] Independent I/O calls use `asyncio.gather()` for parallelism
- [ ] Sync code runs in thread pool via `asyncio.to_thread()`

## Deployment
- [ ] Running behind Gunicorn with Uvicorn workers
- [ ] Worker count set: `(2 * CPU_CORES) + 1` as baseline
- [ ] `max-requests` + `max-requests-jitter` configured (prevents memory leaks)
- [ ] `graceful-timeout` matches Kubernetes `terminationGracePeriodSeconds`
- [ ] ProxyHeadersMiddleware configured if behind a reverse proxy
- [ ] Dockerfile uses multi-stage build, non-root user, no cache
- [ ] Docs endpoint disabled in production (`docs_url=None`)

## Rate Limiting
- [ ] Rate limiting applied to all public endpoints
- [ ] Auth endpoints have 5-10x stricter limits
- [ ] 429 responses include `Retry-After` header
- [ ] Rate limit hits are logged
- [ ] Per-IP and per-user limiting configured

## Security
- [ ] CORS configured with explicit origins (no wildcard with credentials)
- [ ] HTTPS enforced in production (HTTPSRedirectMiddleware)
- [ ] Security headers on every response via middleware
- [ ] Pydantic `strict=True` for input validation on external input
- [ ] All database queries parameterized (no f-string SQL)
- [ ] Request body size limited (Uvicorn or nginx)
- [ ] Internal model fields never exposed in response models

## Application Lifecycle
- [ ] Using `lifespan` context manager (not deprecated `on_event`)
- [ ] Startup creates: DB engine, HTTP client pool, logging, cache connections
- [ ] Shutdown cleans up in reverse order: tasks, HTTP clients, DB engine, log flush
- [ ] If startup fails, app never accepts traffic
