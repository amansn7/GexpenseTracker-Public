import asyncio
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import SyncState, User, UserRole
from app.config import settings
from app.auth_deps import get_current_user

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
async def sync_status(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
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
async def update_sync_settings(body: SyncSettingsBody, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
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
async def trigger_sync(current_user=Depends(get_current_user)):
    from app.sync import run_sync
    user_id = getattr(current_user, "id", None)
    task = asyncio.create_task(run_sync(user_id=user_id))
    _background_tasks.add(task)
    task.add_done_callback(_log_task_result)
    return {"message": "Sync triggered"}


class BackfillBody(BaseModel):
    email_ids: list[str] = []   # empty = backfill all missing


@router.post("/sync/backfill-bodies")
async def backfill_bodies(payload: BackfillBody = BackfillBody(), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Fetch full body_text from Gmail.
    email_ids supplied → only those rows (regardless of current body_text).
    email_ids empty   → all emails with null or empty body_text.
    """
    if current_user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    import asyncio
    from sqlalchemy import or_
    from app.models import Email
    from app.gmail.auth import get_credentials_for_user
    from app.gmail.client import _build_service, _extract_body_text

    if payload.email_ids:
        result = await db.execute(
            select(Email).where(Email.id.in_(payload.email_ids))
        )
    else:
        result = await db.execute(
            select(Email).where(
                or_(Email.body_text.is_(None), Email.body_text == "")
            )
        )
    emails = result.scalars().all()
    if not emails:
        return {"updated": 0, "message": "All emails already have body text"}

    creds = await get_credentials_for_user(db, getattr(current_user, "id", None))
    if not creds:
        raise HTTPException(status_code=503, detail="Gmail not authenticated. Visit /api/auth/google")
    service = await asyncio.to_thread(_build_service, creds)

    updated = 0
    errors = 0
    for email in emails:
        try:
            msg = await asyncio.to_thread(
                lambda eid=email.gmail_id: service.users().messages().get(
                    userId="me", id=eid, format="full"
                ).execute()
            )
            body = _extract_body_text(msg.get("payload", {}))
            if body:
                email.body_text = body
                updated += 1
        except Exception as exc:
            logger.warning("backfill: failed for %s: %s", email.gmail_id, exc)
            errors += 1

    await db.commit()
    logger.info("backfill-bodies: updated=%d errors=%d", updated, errors)
    return {"updated": updated, "errors": errors, "total": len(emails)}


@router.get("/alerts")
async def get_alerts():
    from app.alerts import get_alerts as _get
    return _get()


@router.post("/alerts/clear")
async def clear_alerts(current_user=Depends(get_current_user)):
    from app.alerts import clear_alerts as _clear
    _clear()
    return {"cleared": True}


@router.get("/llm/status")
async def llm_status(current_user: User = Depends(get_current_user)):
    if current_user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.classifier.llm_client import llm_client
    return {
        "providers": llm_client.get_status(),
        "config": {
            "confidence_threshold": settings.LLM_CONFIDENCE_THRESHOLD,
            "auto_confirm_threshold": settings.AUTO_CONFIRM_THRESHOLD,
        },
    }
