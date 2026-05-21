"""Detailed health and readiness endpoints."""
import time
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, engine
from app.models import User, ConnectedAccount, Session

router = APIRouter()

_START_TIME = time.time()


def _get_git_sha() -> str:
    """Return short git SHA from environment or fallback."""
    import os
    return os.getenv("RAILWAY_GIT_COMMIT_SHA", os.getenv("GIT_SHA", "unknown"))[:8]


@router.get("/health/detailed")
async def health_detailed(db: AsyncSession = Depends(get_db)):
    """Detailed health check reporting component readiness."""
    components = {}

    # Database
    try:
        t0 = time.monotonic()
        await db.execute(text("SELECT 1"))
        latency_ms = round((time.monotonic() - t0) * 1000, 1)
        components["database"] = {"status": "ok", "latency_ms": latency_ms}
    except Exception as exc:
        components["database"] = {"status": "error", "detail": str(exc)}

    # Gmail auth — count connected accounts
    try:
        connected_count = await db.scalar(
            select(func.count(ConnectedAccount.id)).where(
                ConnectedAccount.provider == "gmail",
                ConnectedAccount.status == "connected",
            )
        )
        components["gmail_auth"] = {
            "status": "ok" if (connected_count or 0) > 0 else "no_accounts",
            "accounts_connected": connected_count or 0,
        }
    except Exception as exc:
        components["gmail_auth"] = {"status": "error", "detail": str(exc)}

    # LLM providers — check config
    try:
        from app.config import settings
        available = []
        if settings.GOOGLE_AI_API_KEY:
            available.append("gemini")
        if settings.GROK_API_KEY:
            available.append("grok")
        if settings.GROQ_API_KEY:
            available.append("groq")
        if settings.SCALEWAY_API_KEY:
            available.append("scaleway")
        if settings.OPENROUTER_API_KEY:
            available.append("openrouter")
        if settings.CLOUDFLARE_API_TOKEN:
            available.append("cloudflare")
        components["llm_providers"] = {
            "status": "ok" if available else "no_keys_configured",
            "available": available,
        }
    except Exception as exc:
        components["llm_providers"] = {"status": "error", "detail": str(exc)}

    # Scheduler
    try:
        from app.scheduler import scheduler
        jobs = scheduler.get_jobs()
        components["scheduler"] = {
            "status": "ok" if scheduler.running else "stopped",
            "jobs_scheduled": len(jobs),
            "running": scheduler.running,
        }
    except Exception as exc:
        components["scheduler"] = {"status": "error", "detail": str(exc)}

    # Worker queue
    try:
        from app.workers.queue import task_queue
        components["worker_queue"] = {
            "status": "ok",
            "workers": task_queue.worker_count,
            "pending": task_queue.pending_count,
        }
    except Exception as exc:
        components["worker_queue"] = {"status": "error", "detail": str(exc)}

    overall = "ok" if all(c.get("status") in ("ok", "no_accounts", "no_keys_configured") for c in components.values()) else "degraded"

    return {
        "status": overall,
        "components": components,
        "version": _get_git_sha(),
        "uptime_seconds": round(time.time() - _START_TIME, 1),
    }


@router.get("/health/ready")
async def health_ready(db: AsyncSession = Depends(get_db)):
    """Readiness probe — returns 503 if database or critical components are down."""
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database_unavailable: {exc}")

    return {"status": "ready"}
