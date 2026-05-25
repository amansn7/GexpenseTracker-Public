import logging
import os
import uuid
from contextlib import asynccontextmanager

import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
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
from starlette.requests import Request as StarletteRequest
from starlette.responses import RedirectResponse as StarletteRedirect

from app.api import admin as admin_api
from app.api import auth, review, transactions
from app.api import budgets as budgets_api
from app.api import cleanup as cleanup_api
from app.api import debt as debt_api
from app.api import duplicates as duplicates_api
from app.api import emails as emails_api
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
    if settings.SECRET_KEY == "change-me-in-production" and not os.getenv("TESTING"):
        raise RuntimeError(
            "SECRET_KEY is still the default value. Set a secure random key in .env before starting the server."
        )
    if not settings.FERNET_KEY and not os.getenv("TESTING"):
        raise RuntimeError(
            "FERNET_KEY is not configured. Generate a Fernet key and set it in .env before starting the server."
        )
    if not settings.JWT_SECRET and not os.getenv("TESTING"):
        raise RuntimeError(
            "JWT_SECRET is not configured. Set a secure random value in .env before starting the server."
        )
    if not os.getenv("TESTING"):
        from app.workers.queue import task_queue
        from app.workers.sync_worker import register as register_sync_worker
        from app.workers.sync_worker import register_fetch_range

        register_sync_worker(task_queue)
        register_fetch_range(task_queue)
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
        if scheduler.running:
            scheduler.shutdown(wait=False)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            # TODO: login-effects.js externalized — remaining 'unsafe-inline' needed for FOUC-prevention theme scripts in login.html:3 and index.html:3
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        return response


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

    EXEMPT = {"/login", "/api/auth/google", "/api/auth/callback", "/api/auth/token/refresh", "/health"}
    CSRF_EXEMPT = {"/api/auth/csrf-token"}

    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path
        if path.startswith("/static") or path in self.EXEMPT or os.getenv("TESTING"):
            return await call_next(request)

        # Bearer-authenticated mobile clients — let handler validate the token
        if request.headers.get("Authorization", "").startswith("Bearer "):
            return await call_next(request)

        limits = _match_rate_limit(path)
        if limits:
            max_requests, window_seconds = limits
            session_cookie = request.cookies.get("session")
            identifier = session_cookie if session_cookie else (request.client.host if request.client else "unknown")
            if not rate_limiter.is_allowed(identifier, path, max_requests, window_seconds):
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)

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


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})
