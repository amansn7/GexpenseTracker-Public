import logging
import os
import secrets as _secrets
import uuid
from contextlib import asynccontextmanager

import jwt as pyjwt
import sentry_sdk
import structlog

SENSITIVE_KEYS = {"password", "token", "secret", "authorization", "fernet", "api_key", "cookie", "jwt"}


def _redact_sensitive_fields(_logger, _method_name, event_dict):
    """Redact sensitive values from log entries before JSON rendering."""
    for key in event_dict:
        if any(s in key.lower() for s in SENSITIVE_KEYS):
            event_dict[key] = "***REDACTED***"
    return event_dict


structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        _redact_sensitive_fields,
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=False,
)

_log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, _log_level, logging.INFO), stream=__import__("sys").stdout)

import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import RedirectResponse as StarletteRedirect

from app.api import admin as admin_api
from app.api import auth, review, transactions
from app.api import budget_llm as budget_llm_api
from app.api import budgets as budgets_api
from app.api import cleanup as cleanup_api
from app.api import debt as debt_api
from app.api import duplicates as duplicates_api
from app.api import emails as emails_api
from app.api import exports as exports_api
from app.api import filter as filter_api
from app.api import goals as goals_api
from app.api import health as health_api
from app.api import insights as insights_api
from app.api import merchant_aliases as merchant_aliases_api
from app.api import merchants as merchants_api
from app.api import onboarding as onboarding_api
from app.api import reconciliation as reconciliation_api
from app.api import recurring as recurring_api
from app.api import rules as rules_api
from app.api import settings as settings_api
from app.api import stats as stats_api
from app.api import sync as sync_api
from app.config import settings
from app.csrf import validate_csrf
from app.rate_limiter import RATE_LIMIT_PREFIXES, RATE_LIMITS, rate_limiter
from app.scheduler import scheduler, setup_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    dsn = os.getenv("SENTRY_DSN")
    if dsn:
        sentry_sdk.init(dsn=dsn, traces_sample_rate=0.1)

    if settings.SECRET_KEY == "change-me-in-production" and not os.getenv("TESTING"):
        raise RuntimeError(
            "SECRET_KEY is still the default value. Set a secure random key in .env before starting the server."
        )
    if not settings.FERNET_KEY and not os.getenv("TESTING"):
        raise RuntimeError(
            "FERNET_KEY is not configured. Generate a Fernet key and set it in .env before starting the server."
        )
    if not settings.JWT_PRIVATE_KEY and not settings.JWT_PUBLIC_KEY and not os.getenv("TESTING"):
        logging.getLogger(__name__).warning(
            "JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are not configured. Bearer JWT authentication will be unavailable; session-based auth still works."
        )
    if not os.getenv("TESTING"):
        from app.workers.queue import task_queue
        from app.workers.recompute_worker import handle_recompute_task
        from app.workers.sync_worker import register, register_fetch_range

        register(task_queue)
        register_fetch_range(task_queue)
        task_queue.register_handler("recompute", handle_recompute_task)
        await task_queue.connect()
        asyncio.create_task(task_queue.worker_loop())
        setup_scheduler()

        async def _startup_init():
            try:
                from app.classifier.merchant import load_alias_cache_from_db
                from app.classifier.merchant_entity import load_db_aliases
                from app.database import AsyncSessionLocal

                async with AsyncSessionLocal() as db:
                    await load_alias_cache_from_db(db)
                    await load_db_aliases(db)
                from app.database import AsyncSessionLocal
                from app.sync.progress import recover_stale_progresses, set_db_session_factory, start_progress_writer

                set_db_session_factory(AsyncSessionLocal)
                start_progress_writer()
                await recover_stale_progresses()
            except Exception as exc:
                logging.getLogger(__name__).warning("startup cache load failed: %s", exc)

        asyncio.create_task(_startup_init())
    yield
    if not os.getenv("TESTING"):
        from app.sync.progress import stop_progress_writer

        await stop_progress_writer()
        from app.workers.queue import task_queue

        task_queue.stop()
        await task_queue.disconnect()
        if scheduler.running:
            scheduler.shutdown(wait=False)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: StarletteRequest, call_next):
        nonce = _secrets.token_hex(16)
        request.state.nonce = nonce
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        if request.url.path == "/mobile" or request.url.path.startswith("/static/mobile"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: blob:; "
                "connect-src 'self' https://unpkg.com; "
                "frame-ancestors 'none'; "
                "base-uri 'self'"
            )
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                f"script-src 'self' 'nonce-{nonce}'; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com; "
                "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
        return response


def _extract_jwt_user_id(request: StarletteRequest) -> str:
    """Extract user_id from a verified Bearer JWT for rate limiting."""
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if token:
        try:
            from app.jwt_utils import _public_keys
            for key in _public_keys():
                try:
                    payload = pyjwt.decode(token, key, algorithms=["RS256"])
                    sub = payload.get("sub")
                    if sub:
                        return f"user:{sub}"
                except pyjwt.PyJWTError:
                    continue
        except Exception:
            pass
    return request.client.host if request.client else "unknown"


def _match_rate_limit(path: str):
    """Return (max_requests, window_seconds) for path, or None."""
    if path in RATE_LIMITS:
        return RATE_LIMITS[path]
    for prefix, limits in RATE_LIMIT_PREFIXES.items():
        if path.startswith(prefix):
            return limits
    return None


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Generate a correlation ID for every request and attach it to structlog context."""

    async def dispatch(self, request: StarletteRequest, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class AuthMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated requests: 401 for API calls, redirect for browser pages."""

    EXEMPT = {"/login", "/api/auth/google", "/api/auth/callback", "/api/auth/token/refresh", "/health", "/mobile"}
    CSRF_EXEMPT = {"/api/auth/csrf-token"}

    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path

        # Rate limiting runs before EXEMPT short-circuit so that unauthenticated
        # endpoints like /api/auth/callback and /api/auth/token/refresh are
        # covered. (EXEMPT entries appearing in RATE_LIMITS were previously
        # bypassed because the EXEMPT return happened first.)
        if not os.getenv("TESTING"):
            limits = _match_rate_limit(path)
            if limits:
                max_requests, window_seconds = limits
                if request.headers.get("Authorization", "").startswith("Bearer "):
                    identifier = _extract_jwt_user_id(request)
                else:
                    session_cookie = request.cookies.get("session")
                    identifier = (
                        session_cookie if session_cookie else (request.client.host if request.client else "unknown")
                    )
                if not rate_limiter.is_allowed(identifier, path, max_requests, window_seconds):
                    return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)

        if path.startswith("/static") or path in self.EXEMPT or os.getenv("TESTING"):
            return await call_next(request)

        # Bearer-authenticated requests — let handler validate the token, skip session/CSRF
        if request.headers.get("Authorization", "").startswith("Bearer "):
            return await call_next(request)

        if not request.cookies.get("session"):
            if path.startswith("/api/"):
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
            return StarletteRedirect("/login")

        if path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
            if path not in self.CSRF_EXEMPT:
                try:
                    await validate_csrf(request)
                except Exception as exc:
                    return JSONResponse({"detail": str(exc)}, status_code=403)

        return await call_next(request)


app = FastAPI(title="Expense Tracker", lifespan=lifespan)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(AuthMiddleware)
if os.getenv("COOKIE_SECURE"):
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:8000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(health_api.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(onboarding_api.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(sync_api.router, prefix="/api")
app.include_router(rules_api.router, prefix="/api")
app.include_router(recurring_api.router, prefix="/api")
app.include_router(stats_api.router, prefix="/api")
app.include_router(budgets_api.router, prefix="/api")
app.include_router(budget_llm_api.router, prefix="/api")
app.include_router(emails_api.router, prefix="/api")
app.include_router(admin_api.router, prefix="/api")
app.include_router(duplicates_api.router, prefix="/api")
app.include_router(debt_api.router, prefix="/api")
app.include_router(goals_api.router, prefix="/api")
app.include_router(filter_api.router, prefix="/api")
app.include_router(merchant_aliases_api.router, prefix="/api")
app.include_router(reconciliation_api.router, prefix="/api")
app.include_router(merchants_api.router, prefix="/api")
app.include_router(insights_api.router, prefix="/api")
app.include_router(cleanup_api.router, prefix="/api")
app.include_router(exports_api.router, prefix="/api")


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/dashboard-old")
async def dashboard_redirect():
    return StarletteRedirect("/")


@app.get("/transactions")
async def transactions_redirect():
    return StarletteRedirect("/")


@app.get("/review")
async def review_redirect():
    return StarletteRedirect("/")


@app.get("/settings")
async def settings_redirect():
    return StarletteRedirect("/")


@app.get("/recurring")
async def recurring_redirect():
    return StarletteRedirect("/")


@app.get("/budgets")
async def budgets_redirect():
    return StarletteRedirect("/")


@app.get("/emails")
async def emails_redirect():
    return StarletteRedirect("/")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Suppress stack traces in production; log internally."""
    logger = logging.getLogger(__name__)
    logger.exception("Unhandled exception: %s", exc)
    if os.getenv("DEV_MODE"):
        return JSONResponse({"detail": str(exc), "type": type(exc).__name__}, status_code=500)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.get("/mobile", response_class=HTMLResponse)
async def mobile_app(request: Request):
    with open("static/mobile/index.html", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), headers={"Cache-Control": "no-store"})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})
