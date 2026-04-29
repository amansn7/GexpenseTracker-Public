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
from app.api import account, auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api, stats as stats_api, budgets as budgets_api, emails as emails_api, admin as admin_api, duplicates as duplicates_api, debt as debt_api, settings as settings_api, onboarding as onboarding_api
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.SECRET_KEY == "change-me-in-production" and not os.getenv("TESTING"):
        raise RuntimeError(
            "SECRET_KEY is still the default value. "
            "Set a secure random key in .env before starting the server."
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


class AuthMiddleware(BaseHTTPMiddleware):
    """Block unauthenticated requests: 401 for API calls, redirect for browser pages."""

    EXEMPT = {"/login", "/api/auth/google", "/api/auth/callback", "/health"}

    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path
        if path.startswith("/static") or path in self.EXEMPT or os.getenv("TESTING"):
            return await call_next(request)
        if not request.cookies.get("session"):
            if path.startswith("/api/"):
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
            return StarletteRedirect("/login")
        return await call_next(request)


app = FastAPI(title="Expense Tracker", lifespan=lifespan)

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
app.include_router(account.router, prefix="/api")
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


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/dashboard-old", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/transactions", response_class=HTMLResponse)
async def transactions_page(request: Request):
    return templates.TemplateResponse("transactions.html", {"request": request})


@app.get("/review", response_class=HTMLResponse)
async def review_page(request: Request):
    return templates.TemplateResponse("review.html", {"request": request})


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    return templates.TemplateResponse("settings.html", {"request": request})


@app.get("/recurring", response_class=HTMLResponse)
async def recurring_page(request: Request):
    return templates.TemplateResponse("recurring.html", {"request": request})


@app.get("/budgets", response_class=HTMLResponse)
async def budgets_page(request: Request):
    return templates.TemplateResponse("budgets.html", {"request": request})


@app.get("/emails", response_class=HTMLResponse)
async def emails_page(request: Request):
    return templates.TemplateResponse("emails.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})
