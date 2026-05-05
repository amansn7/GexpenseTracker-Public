import asyncio
import logging
from datetime import timedelta, date as _date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
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


class FetchRangeBody(BaseModel):
    after_date: _date
    before_date: _date

    @model_validator(mode="after")
    def _check_range(self):
        if self.after_date >= self.before_date:
            raise ValueError("after_date must be before before_date")
        if (self.before_date - self.after_date).days > 365:
            raise ValueError("Date range cannot exceed 365 days")
        return self


@router.post("/sync/fetch-range")
async def fetch_range(
    body: FetchRangeBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.sync import run_sync_range
    result = await run_sync_range(
        user_id=current_user.id,
        after_date=body.after_date.strftime("%Y/%m/%d"),
        before_date=body.before_date.strftime("%Y/%m/%d"),
    )
    return result


@router.get("/alerts")
async def get_alerts():
    from app.alerts import get_alerts as _get
    return _get()


@router.post("/alerts/clear")
async def clear_alerts(current_user=Depends(get_current_user)):
    from app.alerts import clear_alerts as _clear
    _clear()
    return {"cleared": True}


@router.get("/llm/my-limits")
async def my_llm_limits(current_user: User = Depends(get_current_user)):
    """Get current user's rate limit status for their configured AI service."""
    from app.classifier.groq_rate_limiter import get_groq_limiter

    limits = {}
    try:
        limiter = get_groq_limiter(user_id=current_user.id)
        if limiter:
            limits = {
                "llama-3.3-70b-versatile": limiter.get_available("llama-3.3-70b-versatile"),
                "llama-3.1-8b-instant": limiter.get_available("llama-3.1-8b-instant"),
            }
    except RuntimeError:
        pass

    if not limits:
        return {"message": "No Groq service configured. Add one in Settings → AI."}

    return {"groq": limits}


@router.get("/llm/limits")
async def llm_limits(current_user: User = Depends(get_current_user)):
    """Get user's current rate limit status (for their configured AI service)."""
    from app.classifier.llm_client import llm_client

    result = {"providers": {}}
    try:
        user_client = llm_client.get_user_client(current_user.id)
        if user_client:
            result["providers"] = user_client.get_status()
    except Exception as e:
        result["error"] = str(e)

    if not result.get("providers"):
        result["message"] = "No AI service configured. Go to Settings → AI to add one."
    return result


@router.get("/llm/status")
async def llm_status(current_user: User = Depends(get_current_user)):
    if current_user.role not in (UserRole.owner, "owner"):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.classifier.llm_client import llm_client

    result = {
        "providers": llm_client.get_status(),
        "config": {
            "confidence_threshold": settings.LLM_CONFIDENCE_THRESHOLD,
            "auto_confirm_threshold": settings.AUTO_CONFIRM_THRESHOLD,
        },
    }
    if settings.GROQ_API_KEY:
        try:
            from app.classifier.groq_rate_limiter import get_groq_limiter

            limiter = get_groq_limiter()
            result["groq"] = {
                "llama-3.3-70b-versatile": limiter.get_status("llama-3.3-70b-versatile"),
                "llama-3.1-8b-instant": limiter.get_status("llama-3.1-8b-instant"),
                "qwen/qwen3-32b": limiter.get_status("qwen/qwen3-32b"),
            }
        except Exception as e:
            result["groq_error"] = str(e)
    return result
