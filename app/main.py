import os
import logging
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app.scheduler import setup_scheduler, scheduler
from app.api import auth, transactions, review, sync as sync_api, rules as rules_api, recurring as recurring_api, stats as stats_api, budgets as budgets_api, emails as emails_api


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv("TESTING"):
        setup_scheduler()
        try:
            from app.database import AsyncSessionLocal
            from app.classifier.pattern_gen import load_pattern_cache_from_db
            from app.classifier.merchant import load_alias_cache_from_db
            async with AsyncSessionLocal() as db:
                await load_pattern_cache_from_db(db)
                await load_alias_cache_from_db(db)
        except Exception as exc:
            logging.getLogger(__name__).warning("startup cache load failed: %s", exc)
    yield
    if not os.getenv("TESTING") and scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Expense Tracker", lifespan=lifespan)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(auth.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(sync_api.router, prefix="/api")
app.include_router(rules_api.router, prefix="/api")
app.include_router(recurring_api.router, prefix="/api")
app.include_router(stats_api.router, prefix="/api")
app.include_router(budgets_api.router, prefix="/api")
app.include_router(emails_api.router, prefix="/api")


@app.get("/", response_class=HTMLResponse)
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
