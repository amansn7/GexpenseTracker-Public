---
name: production-fastapi
description: "Production-grade FastAPI patterns — structured logging, health checks, graceful shutdown, middleware, Pydantic v2, async patterns, error handling, and security hardening. Use this skill when the user is building or modifying a FastAPI application, working with Pydantic models, configuring Starlette middleware, setting up Uvicorn/Gunicorn, or asks about FastAPI best practices. Triggers when importing fastapi, starlette, pydantic, or uvicorn. Also trigger when user says /production fastapi. DO NOT trigger for Django or Flask unless explicitly asked."
---

# Production FastAPI

This skill encodes battle-tested patterns for shipping FastAPI applications that survive real production traffic. Every recommendation here comes from outage post-mortems, not blog posts. The patterns are opinionated — this is a senior engineer review, not a tutorial.

See `templates/` for copy-paste-ready implementations of every pattern below.

---

## 1. Application Lifecycle

**Use `lifespan`, not `on_event`.** The `on_event` decorator is deprecated and does not support shared state between startup and shutdown.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
import httpx
from sqlalchemy.ext.asyncio import create_async_engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    app.state.db_engine = create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_pre_ping=True,
        pool_recycle=3600,
    )
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(10.0, connect=5.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )
    configure_logging(settings.environment)
    logger.info("application_started", version=settings.app_version)

    yield

    # --- Shutdown ---
    await app.state.http_client.aclose()
    await app.state.db_engine.dispose()
    logger.info("application_stopped")

app = FastAPI(title="My Service", lifespan=lifespan)
```

**Why lifespan matters:**
- Resources created in startup are guaranteed to be cleaned up in shutdown
- The `yield` pattern makes it impossible to forget cleanup
- `app.state` shares resources across the request lifecycle without globals
- If startup fails, the app never starts accepting traffic

**Startup checklist:**
1. Database engine/connection pool
2. HTTP client pool (reuse connections)
3. Logging configuration
4. Cache connections (Redis)
5. Background task schedulers

**Shutdown checklist (reverse order):**
1. Cancel background tasks
2. Close HTTP client pools
3. Dispose database engine (waits for active connections)
4. Flush log buffers

---

## 2. Structured Logging

**Use structlog with JSON output in production, pretty console in development.** Never use `print()` or `logging.basicConfig()`.

```python
import structlog
import logging
from contextvars import ContextVar

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

def configure_logging(environment: str) -> None:
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.format_exc_info,
    ]

    if environment == "production":
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)

    # Silence noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
```

**CRITICAL: Never use `BaseHTTPMiddleware` for logging or request ID injection.** It breaks `contextvars` because it runs the endpoint in a different task than the middleware. Use pure ASGI middleware instead:

```python
import uuid
import structlog
from starlette.types import ASGIApp, Receive, Scope, Send

class RequestIDMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        async def send_with_request_id(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_request_id)
```

See `templates/logging_config.py` for the complete structlog setup and `templates/middleware.py` for all ASGI middleware implementations.

---

## 3. Health Checks

Every production service needs two health endpoints. No exceptions.

```python
from fastapi import APIRouter, Response
from datetime import datetime, UTC
import asyncio

health_router = APIRouter(tags=["health"])

@health_router.get("/health/live")
async def liveness() -> dict:
    """Is the process alive? Always 200. Used by load balancers."""
    return {"status": "alive", "timestamp": datetime.now(UTC).isoformat()}

@health_router.get("/health/ready")
async def readiness(request: Request) -> Response:
    """Can we handle requests? Checks all dependencies."""
    checks = {}
    all_healthy = True

    # Database check with timeout
    try:
        async with asyncio.timeout(2.0):
            async with request.app.state.db_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        checks["database"] = {"status": "healthy", "latency_ms": ...}
    except Exception as e:
        checks["database"] = {"status": "unhealthy", "error": str(e)}
        all_healthy = False

    # Redis check with timeout
    try:
        async with asyncio.timeout(2.0):
            await request.app.state.redis.ping()
        checks["redis"] = {"status": "healthy"}
    except Exception as e:
        checks["redis"] = {"status": "unhealthy", "error": str(e)}
        all_healthy = False

    status_code = 200 if all_healthy else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_healthy else "not_ready",
            "checks": checks,
            "timestamp": datetime.now(UTC).isoformat(),
        },
    )
```

**Health check rules:**
- `/health/live` — NEVER check dependencies. If the process is running, return 200. Used by load balancers to detect crashed processes.
- `/health/ready` — Check every dependency with a **2-second timeout each**. Used by Kubernetes readiness probes and orchestrators.
- Exclude health endpoints from access logs (noise).
- Exclude health endpoints from authentication middleware.
- Return structured JSON, not just a status code — operators need to see which dependency is down.

See `templates/health_checks.py` for the complete implementation with timing, startup checks, and Kubernetes probe configuration.

---

## 4. Error Handling

**Use RFC 7807 Problem Details format.** Consistent error responses are non-negotiable in production.

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import structlog

logger = structlog.get_logger()

class AppError(Exception):
    def __init__(
        self,
        detail: str,
        status_code: int = 500,
        error_type: str = "internal_error",
    ):
        self.detail = detail
        self.status_code = status_code
        self.error_type = error_type

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = request.state.request_id if hasattr(request.state, "request_id") else None
    logger.warning("handled_error", error_type=exc.error_type, detail=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "type": f"https://api.example.com/errors/{exc.error_type}",
            "title": exc.error_type.replace("_", " ").title(),
            "status": exc.status_code,
            "detail": exc.detail,
            "instance": str(request.url),
            "request_id": request_id,
        },
    )

async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = request.state.request_id if hasattr(request.state, "request_id") else None
    logger.exception("unhandled_error", request_id=request_id)

    # Sentry capture (if configured)
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    except ImportError:
        pass

    # NEVER expose tracebacks in production
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://api.example.com/errors/internal_error",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An unexpected error occurred. Please contact support.",
            "request_id": request_id,
        },
    )

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)
```

**Error handling rules:**
- Every error response includes `request_id` — this is the lifeline for debugging in production
- Known errors (validation, auth, not found) return specific status codes and human-readable messages
- Unknown errors return 500 with a generic message — **never expose tracebacks, SQL queries, or internal paths**
- Log every error with full context (the log has the traceback; the response does not)
- Send unexpected errors to Sentry/error tracking with the request_id

See `templates/error_handlers.py` for the complete exception hierarchy and handler registration.

---

## 5. Middleware Stack

**Order matters.** Middleware executes in an onion model — first added is outermost. Design accordingly:

```python
# Add in this order (outermost to innermost):
app.add_middleware(CORSMiddleware, ...)          # 1. CORS (must run first)
app.add_middleware(SecurityHeadersMiddleware)     # 2. Security headers
app.add_middleware(RequestIDMiddleware)           # 3. Request ID generation
app.add_middleware(LoggingMiddleware)             # 4. Request/response logging
# Auth and rate limiting typically via Depends(), not middleware
```

### CORS: Never Wildcard With Credentials

```python
from fastapi.middleware.cors import CORSMiddleware

# GOOD — specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com", "https://staging.example.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# DANGEROUS — wildcard + credentials is a security vulnerability
# Browsers ignore Access-Control-Allow-Credentials when origin is *,
# but this signals you haven't thought about CORS policy.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # NEVER with allow_credentials=True
    allow_credentials=True,      # This combination is a red flag
)
```

### Pure ASGI Middleware Template

Always use this pattern instead of `BaseHTTPMiddleware`:

```python
from starlette.types import ASGIApp, Receive, Scope, Send

class MyMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # --- Pre-processing ---
        # Modify scope, set contextvars, start timer, etc.

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                # --- Modify response headers ---
                pass
            await send(message)

        await self.app(scope, receive, send_wrapper)
        # --- Post-processing ---
```

**Why not `BaseHTTPMiddleware`?**
- It reads the entire request body into memory (no streaming)
- It runs the endpoint in a separate `anyio` task, breaking `contextvars`
- It catches exceptions, making error handling middleware unreliable
- Pure ASGI middleware has zero overhead and full control

See `templates/middleware.py` for RequestID, Logging, and SecurityHeaders implementations.

---

## 6. Pydantic v2

Pydantic v2 has breaking API changes. Use the new API everywhere.

```python
from pydantic import BaseModel, Field, model_validator, ConfigDict
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Annotated
from datetime import datetime, UTC

# --- Models: Use Annotated + Field ---
class CreateUserRequest(BaseModel):
    model_config = ConfigDict(strict=True)  # Strict mode: no coercion

    email: Annotated[str, Field(max_length=255, pattern=r"^[\w.-]+@[\w.-]+\.\w+$")]
    name: Annotated[str, Field(min_length=1, max_length=100)]
    age: Annotated[int, Field(ge=0, le=150)] | None = None

    @model_validator(mode="after")
    def validate_model(self):
        # Cross-field validation goes here
        return self

# --- Response models: Never expose internal fields ---
class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # ORM mode

    public_id: str
    email: str
    name: str
    created_at: datetime

# --- Serialization: model_dump() not .dict() ---
user = UserResponse.model_validate(db_user)  # NOT parse_obj()
data = user.model_dump(exclude_none=True)     # NOT .dict()
json_str = user.model_dump_json()             # NOT .json()

# --- Settings: Use SettingsConfigDict ---
class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "my-service"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False

    database_url: str
    db_pool_size: int = 10
    db_max_overflow: int = 5

    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]
    log_level: str = "INFO"
```

**Pydantic v2 migration cheat sheet:**

| v1 (deprecated) | v2 (use this) |
|-----------------|---------------|
| `.dict()` | `.model_dump()` |
| `.json()` | `.model_dump_json()` |
| `.parse_obj()` | `.model_validate()` |
| `.parse_raw()` | `.model_validate_json()` |
| `class Config:` | `model_config = ConfigDict(...)` |
| `@validator` | `@field_validator` |
| `@root_validator` | `@model_validator` |
| `orm_mode = True` | `from_attributes = True` |
| `Field(regex=...)` | `Field(pattern=...)` |

**Rules:**
- Use `strict=True` on models that accept external input — prevents type coercion attacks
- Use `from_attributes=True` on response models that serialize from ORM objects
- Settings must fail fast — if `database_url` is missing, the app crashes at import time, not on first request
- Never expose internal model fields (like `id`, `password_hash`) in response models

---

## 7. Async Patterns

**The cardinal sin of async FastAPI: blocking the event loop with synchronous I/O.**

```python
# WRONG — blocks the event loop, starves all other requests
@app.get("/users/{user_id}")
async def get_user(user_id: int):
    response = requests.get(f"https://api.example.com/users/{user_id}")  # BLOCKS
    data = open("config.json").read()  # BLOCKS
    time.sleep(1)  # BLOCKS
    return response.json()

# RIGHT — all I/O is async with explicit timeouts
@app.get("/users/{user_id}")
async def get_user(user_id: int, request: Request):
    async with asyncio.timeout(5.0):
        response = await request.app.state.http_client.get(
            f"https://api.example.com/users/{user_id}"
        )
    async with aiofiles.open("config.json") as f:
        data = await f.read()
    return response.json()
```

### Parallel External Calls

```python
# SLOW — sequential, total time = sum of all calls
user = await fetch_user(user_id)
orders = await fetch_orders(user_id)
preferences = await fetch_preferences(user_id)

# FAST — parallel, total time = max of all calls
user, orders, preferences = await asyncio.gather(
    fetch_user(user_id),
    fetch_orders(user_id),
    fetch_preferences(user_id),
)
```

### Timeouts on Everything

```python
# HTTP client — set at client level AND per-request
client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0))

# Database — set at engine level
engine = create_async_engine(url, pool_timeout=30, connect_args={"timeout": 10})

# Redis — set at client level
redis = aioredis.from_url(url, socket_timeout=5.0, socket_connect_timeout=2.0)

# Individual operation timeout
async with asyncio.timeout(3.0):
    result = await some_external_call()
```

**Async rules:**
- Never `import requests` in a FastAPI app — use `httpx.AsyncClient`
- Never use `open()` — use `aiofiles.open()`
- Never use `time.sleep()` — use `asyncio.sleep()`
- Reuse HTTP clients via `app.state` — creating a new client per request leaks connections
- Every external call has an explicit timeout — a hanging dependency should not hang your service
- Use `asyncio.gather()` for independent concurrent operations
- If you must use sync code, run it in a thread pool: `await asyncio.to_thread(sync_function)`

---

## 8. Deployment

### Gunicorn + Uvicorn Workers

```bash
gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 4 \
    --bind 0.0.0.0:8000 \
    --timeout 30 \
    --graceful-timeout 30 \
    --max-requests 10000 \
    --max-requests-jitter 1000 \
    --forwarded-allow-ips="*" \
    --access-logfile -
```

**Worker count:** `workers = (2 * CPU_CORES) + 1` is the starting formula. For I/O-bound apps (most APIs), 2-4x CPU cores. For CPU-bound, match CPU cores exactly.

**`max-requests` + jitter:** Workers restart after serving N requests (prevents memory leaks). Jitter prevents thundering herd — without it, all workers restart at the same time.

**`graceful-timeout`:** After SIGTERM, workers have this many seconds to finish in-flight requests. Must match your Kubernetes `terminationGracePeriodSeconds`.

### Behind a Reverse Proxy

```python
# When behind nginx/ALB/Cloud Run, trust proxy headers
from fastapi import FastAPI
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

app = FastAPI()
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])
```

Without this, `request.client.host` returns the proxy IP, not the real client IP. Rate limiting and audit logs break.

### Dockerfile for FastAPI

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --target=/app/deps -r requirements.txt

FROM python:3.12-slim
RUN useradd --create-home appuser
WORKDIR /app
COPY --from=builder /app/deps /usr/local/lib/python3.12/site-packages
COPY . .
USER appuser
EXPOSE 8000
CMD ["gunicorn", "app.main:app", "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "30"]
```

For container hardening (multi-stage, non-root, distroless, secrets), see **production-docker**.

---

## 9. Rate Limiting

Protect your API from abuse. Per-user AND per-IP, stricter on auth endpoints.

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "type": "https://api.example.com/errors/rate_limited",
            "title": "Rate Limit Exceeded",
            "status": 429,
            "detail": "Too many requests. Please retry later.",
            "request_id": getattr(request.state, "request_id", None),
        },
        headers={"Retry-After": str(exc.retry_after)},
    )

# General endpoints: 60 requests per minute
@app.get("/api/items")
@limiter.limit("60/minute")
async def list_items(request: Request):
    ...

# Auth endpoints: much stricter
@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request):
    ...

# Per-user rate limiting (after auth)
def get_user_id(request: Request) -> str:
    return getattr(request.state, "user_id", get_remote_address(request))

user_limiter = Limiter(key_func=get_user_id)
```

**Rate limiting rules:**
- Apply to ALL public endpoints, not just auth
- Auth endpoints (login, register, password reset) get 5-10x stricter limits
- Return `429 Too Many Requests` with a `Retry-After` header — clients need to know when to retry
- Log rate limit hits — they may indicate an attack
- Consider sliding window over fixed window for smoother enforcement

---

## 10. Security

### Input Validation (Pydantic Does the Heavy Lifting)

```python
# Pydantic rejects invalid input before your code runs
class TransferRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    from_account: Annotated[str, Field(pattern=r"^[A-Z0-9]{10}$")]
    to_account: Annotated[str, Field(pattern=r"^[A-Z0-9]{10}$")]
    amount: Annotated[Decimal, Field(gt=0, le=1_000_000)]
    currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
```

### Parameterized Queries (Always)

```python
# DANGEROUS — SQL injection
await conn.execute(f"SELECT * FROM users WHERE email = '{email}'")

# SAFE — parameterized
await conn.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})
```

### Security Headers

```python
class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    (b"strict-transport-security", b"max-age=63072000; includeSubDomains"),
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"x-xss-protection", b"0"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                ])
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
```

### HTTPS Redirect

```python
# In production, force HTTPS
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

if settings.environment == "production":
    app.add_middleware(HTTPSRedirectMiddleware)
```

### Request Size Limits

```python
# Prevent memory exhaustion from oversized payloads
# Set in Uvicorn/Gunicorn config:
# --limit-request-line 8190 --limit-request-field_size 8190

# Or in nginx:
# client_max_body_size 10m;
```

**Security rules:**
- Trust Pydantic for input validation — use `strict=True` on external input
- Always parameterized queries — even with an ORM, watch for raw SQL
- Security headers on every response — use middleware so you cannot forget
- HTTPS in production — no exceptions
- Limit request body size — default Uvicorn is 1MB, tune for your needs

---

## Cross-References

- For database connection pooling and migration safety, see **production-postgres**
- For container hardening and multi-stage builds, see **production-docker**
- For pre-deployment validation, see **production-deploy**
- For OpenTelemetry traces and alerting, see **production-monitoring**
- For comprehensive security review, see **production-review**
- For architecture planning with failure modes, see **production-planner**
