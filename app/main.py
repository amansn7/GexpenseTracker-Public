import os
import logging
from contextlib import asynccontextmanager

_log_fmt = "%(asctime)s %(levelname)s %(name)s: %(message)s"
logging.basicConfig(level=logging.INFO, format=_log_fmt)

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import RedirectResponse as StarletteRedirect
from app.scheduler import setup_scheduler, scheduler
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api, stats as stats_api, budgets as budgets_api, emails as emails_api, admin as admin_api, duplicates as duplicates_api, debt as debt_api, settings as settings_api, onboarding as onboarding_api, filter as filter_api, merchant_aliases as merchant_aliases_api, reconciliation as reconciliation_api
from app.config import settings
from app.csrf import validate_csrf
from app.rate_limiter import rate_limiter, RATE_LIMITS


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.SECRET_KEY == "change-me-in-production" and not os.getenv("TESTING"):
        raise RuntimeError(
            "SECRET_KEY is still the default value. "
            "Set a secure random key in .env before starting the server."
        )
    if not settings.FERNET_KEY and not os.getenv("TESTING"):
        raise RuntimeError(
            "FERNET_KEY is not configured. "
            "Generate a Fernet key and set it in .env before starting the server."
        )
    if not os.getenv("TESTING"):
        setup_scheduler()
        try:
            from app.database import AsyncSessionLocal
            from app.classifier.merchant import load_alias_cache_from_db
            async with AsyncSessionLocal() as db:
                await load_alias_cache_from_db(db)
        except Exception as exc:
            logging.getLogger(__name__).warning("startup cache load failed: %s", exc)
    yield
    if not os.getenv("TESTING") and scheduler.running:
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
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        return response


class AuthMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated requests: 401 for API calls, redirect for browser pages."""

    EXEMPT = {"/login", "/api/auth/google", "/api/auth/callback", "/health"}
    CSRF_EXEMPT = {"/api/auth/csrf-token"}

    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path
        if path.startswith("/static") or path in self.EXEMPT or os.getenv("TESTING"):
            return await call_next(request)

        if path in RATE_LIMITS:
            max_requests, window_seconds = RATE_LIMITS[path]
            client_ip = request.client.host if request.client else "unknown"
            if not rate_limiter.is_allowed(client_ip, path, max_requests, window_seconds):
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
app.include_router(filter_api.router, prefix="/api")
app.include_router(merchant_aliases_api.router, prefix="/api")
app.include_router(reconciliation_api.router, prefix="/api")


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
