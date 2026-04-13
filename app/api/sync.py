import asyncio
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import SyncState
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
_background_tasks: set = set()


def _log_task_result(task: asyncio.Task):
    _background_tasks.discard(task)
    if task.cancelled():
        logger.warning("Sync task was cancelled")
    elif task.exception():
        logger.error("Sync task raised an exception", exc_info=task.exception())
    else:
        logger.info("Sync task completed: %s", task.result())


@router.get("/sync/progress")
async def sync_progress_endpoint():
    from app.sync import get_sync_progress
    return get_sync_progress()


@router.get("/sync/status")
async def sync_status(db: AsyncSession = Depends(get_db)):
    state = (await db.execute(select(SyncState))).scalar_one_or_none()
    if state and state.last_synced_at:
        next_sync = state.last_synced_at + timedelta(hours=settings.SYNC_INTERVAL_HOURS)
        return {
            "last_synced_at": state.last_synced_at.isoformat(),
            "next_sync_at": next_sync.isoformat(),
            "sync_interval_hours": settings.SYNC_INTERVAL_HOURS,
            "email_filter": getattr(state, "email_filter", "all") or "all",
        }
    return {
        "last_synced_at": None,
        "next_sync_at": None,
        "sync_interval_hours": settings.SYNC_INTERVAL_HOURS,
        "email_filter": "all",
    }


class SyncSettingsBody(BaseModel):
    email_filter: str   # all | unread | read


@router.patch("/sync/settings")
async def update_sync_settings(body: SyncSettingsBody, db: AsyncSession = Depends(get_db)):
    if body.email_filter not in ("all", "unread", "read"):
        raise HTTPException(status_code=422, detail="email_filter must be all, unread, or read")
    state = (await db.execute(select(SyncState))).scalar_one_or_none()
    if state is None:
        state = SyncState(id=1, email_filter=body.email_filter)
        db.add(state)
    else:
        state.email_filter = body.email_filter
    await db.commit()
    return {"email_filter": body.email_filter}


@router.post("/sync/trigger")
async def trigger_sync():
    from app.sync import run_sync
    task = asyncio.create_task(run_sync())
    _background_tasks.add(task)
    task.add_done_callback(_log_task_result)
    return {"message": "Sync triggered"}


@router.get("/alerts")
async def get_alerts():
    from app.alerts import get_alerts as _get
    return _get()


@router.post("/alerts/clear")
async def clear_alerts():
    from app.alerts import clear_alerts as _clear
    _clear()
    return {"cleared": True}


@router.get("/llm/status")
async def llm_status():
    from app.classifier.llm_client import llm_client
    return {"providers": llm_client.get_status()}
