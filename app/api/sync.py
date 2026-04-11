import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import SyncState
from app.config import settings

router = APIRouter()
_background_tasks: set = set()

@router.get("/sync/status")
async def sync_status(db: AsyncSession = Depends(get_db)):
    state = (await db.execute(select(SyncState))).scalar_one_or_none()
    if state and state.last_synced_at:
        next_sync = state.last_synced_at + timedelta(hours=settings.SYNC_INTERVAL_HOURS)
        return {
            "last_synced_at": state.last_synced_at.isoformat(),
            "next_sync_at": next_sync.isoformat(),
            "sync_interval_hours": settings.SYNC_INTERVAL_HOURS,
        }
    return {"last_synced_at": None, "next_sync_at": None,
            "sync_interval_hours": settings.SYNC_INTERVAL_HOURS}

@router.post("/sync/trigger")
async def trigger_sync():
    from app.sync import run_sync
    task = asyncio.create_task(run_sync())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return {"message": "Sync triggered"}
