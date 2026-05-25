import asyncio
import logging
import re
from datetime import date as _date
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user, is_owner
from app.config import settings
from app.database import get_db
from app.models import SyncState, User

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
async def sync_progress_endpoint(current_user=Depends(get_current_user)):
    from app.sync import get_sync_progress_public

    return get_sync_progress_public(user_id=current_user.id)


@router.get("/sync/status")
async def sync_status(db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    state = (await db.execute(select(SyncState).where(SyncState.user_id == current_user.id))).scalar_one_or_none()
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
    email_filter: str  # all | unread | read


@router.patch("/sync/settings")
async def update_sync_settings(
    body: SyncSettingsBody, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)
):
    if body.email_filter not in ("all", "unread", "read"):
        raise HTTPException(status_code=422, detail="email_filter must be all, unread, or read")
    state = (await db.execute(select(SyncState).where(SyncState.user_id == current_user.id))).scalar_one_or_none()
    if state is None:
        state = SyncState(user_id=current_user.id, email_filter=body.email_filter)
        db.add(state)
    else:
        state.email_filter = body.email_filter
    await db.commit()
    return {"email_filter": body.email_filter}


@router.post("/sync/trigger")
async def trigger_sync(current_user=Depends(get_current_user)):
    from app.workers.queue import task_queue

    user_id = getattr(current_user, "id", None)
    task_id = await task_queue.enqueue("sync", user_id, {"trigger": "manual"})
    if task_id is None:
        return {"message": "Sync already in progress"}
    return {"message": "Sync queued", "task_id": task_id}


class BackfillBody(BaseModel):
    email_ids: list[str] = []  # empty = backfill all missing


@router.post("/sync/backfill-bodies")
async def backfill_bodies(
    payload: BackfillBody = BackfillBody(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner only")
    import asyncio

    from sqlalchemy import or_

    from app.gmail.auth import get_credentials_for_user
    from app.gmail.client import _build_service, _extract_body_text
    from app.models import Email

    if payload.email_ids:
        result = await db.execute(
            select(Email).where(Email.id.in_(payload.email_ids), Email.user_id == current_user.id)
        )
        emails = result.scalars().all()
        if not emails:
            return {"updated": 0, "message": "No matching emails found"}

        creds = await get_credentials_for_user(db, getattr(current_user, "id", None))
        if not creds:
            raise HTTPException(status_code=503, detail="Gmail not authenticated. Visit /api/auth/google")
        service = await asyncio.to_thread(_build_service, creds)

        total_updated = 0
        total_errors = 0
        total_scanned = len(emails)

        for email in emails:
            try:
                msg = await asyncio.to_thread(
                    lambda eid=email.gmail_id: (
                        service.users().messages().get(userId="me", id=eid, format="full").execute()
                    )
                )
                body = _extract_body_text(msg.get("payload", {}))
                if body:
                    email.body_text = body
                    total_updated += 1
            except Exception as exc:
                logger.warning("backfill: failed for %s: %s", email.gmail_id, exc)
                total_errors += 1

        await db.commit()
        logger.info("backfill-bodies: updated=%d errors=%d", total_updated, total_errors)
        return {"updated": total_updated, "errors": total_errors, "total": total_scanned}

    from sqlalchemy import func

    count = (
        await db.execute(
            select(func.count(Email.id)).where(
                Email.user_id == current_user.id, or_(Email.body_text.is_(None), Email.body_text == "")
            )
        )
    ).scalar()
    if not count:
        return {"updated": 0, "errors": 0, "total": 0}

    batch_size = 100
    total_updated = 0
    total_errors = 0
    total_scanned = 0

    creds = await get_credentials_for_user(db, getattr(current_user, "id", None))
    if not creds:
        raise HTTPException(status_code=503, detail="Gmail not authenticated. Visit /api/auth/google")
    service = await asyncio.to_thread(_build_service, creds)

    while True:
        batch = (
            (
                await db.execute(
                    select(Email)
                    .where(Email.user_id == current_user.id, or_(Email.body_text.is_(None), Email.body_text == ""))
                    .order_by(Email.id)
                    .limit(batch_size)
                )
            )
            .scalars()
            .all()
        )
        if not batch:
            break

        for email in batch:
            total_scanned += 1
            try:
                msg = await asyncio.to_thread(
                    lambda eid=email.gmail_id: (
                        service.users().messages().get(userId="me", id=eid, format="full").execute()
                    )
                )
                body = _extract_body_text(msg.get("payload", {}))
                if body:
                    email.body_text = body
                    total_updated += 1
            except Exception as exc:
                logger.warning("backfill: failed for %s: %s", email.gmail_id, exc)
                total_errors += 1

        await db.commit()

    logger.info("backfill-bodies: updated=%d errors=%d", total_updated, total_errors)
    return {"updated": total_updated, "errors": total_errors, "total": total_scanned}


_DIRTY_BODY_RE = re.compile(r"&[a-zA-Z#][\w#]*;|[\u200b-\u200f\u200c\u200d\ufeff\u034f\u00ad\u2028-\u202f]")


@router.post("/sync/trigger-clean-bodies")
async def trigger_clean_bodies(
    current_user: User = Depends(get_current_user),
):
    """Trigger a background job to re-fetch and clean dirty email body text."""
    if not is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.sync import clean_bodies_job

    task = asyncio.create_task(clean_bodies_job(user_id=current_user.id))
    _background_tasks.add(task)
    task.add_done_callback(_log_task_result)
    return {"message": "Clean-bodies started"}


class FetchRangeBody(BaseModel):
    after_date: _date
    before_date: _date
    llm_priority: bool = False
    sender: str | None = None
    subject: str | None = None

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
    if not is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.sync import run_sync_range

    result = await asyncio.wait_for(
        run_sync_range(
            user_id=current_user.id,
            after_date=body.after_date.strftime("%Y/%m/%d"),
            before_date=body.before_date.strftime("%Y/%m/%d"),
            llm_priority=body.llm_priority,
            sender=body.sender,
            subject=body.subject,
        ),
        timeout=1800,
    )
    return result


@router.post("/sync/trigger-fetch-range")
async def trigger_fetch_range(
    body: FetchRangeBody,
    current_user: User = Depends(get_current_user),
):
    if not is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.workers.queue import task_queue

    task_id = await task_queue.enqueue(
        "fetch_range",
        current_user.id,
        {
            "after_date": body.after_date.strftime("%Y/%m/%d"),
            "before_date": body.before_date.strftime("%Y/%m/%d"),
            "llm_priority": body.llm_priority,
            "sender": body.sender,
            "subject": body.subject,
        },
    )
    return {"message": "Fetch-range queued", "task_id": task_id}


@router.get("/alerts")
async def get_alerts(current_user: User = Depends(get_current_user)):
    if not is_owner(current_user):
        raise HTTPException(403, "Admin only")
    from app.alerts import get_alerts as _get

    return _get()


@router.get("/tasks")
async def list_tasks(current_user: User = Depends(get_current_user)):
    from app.workers.queue import task_queue

    return {"tasks": task_queue.get_tasks(user_id=current_user.id, limit=20)}


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str, current_user: User = Depends(get_current_user)):
    from app.workers.queue import task_queue

    task = task_queue.get_status(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your task")
    return task


@router.post("/alerts/clear")
async def clear_alerts(current_user: User = Depends(get_current_user)):
    if not is_owner(current_user):
        raise HTTPException(403, "Admin only")
    from app.alerts import clear_alerts as _clear

    _clear()
    return {"cleared": True}


@router.get("/llm/limits")
async def llm_limits(current_user: User = Depends(get_current_user)):
    """Get user's current rate limit status (for their configured AI service)."""
    from app.classifier.llm_client import llm_client

    result = {"providers": {}}
    try:
        user_client = await llm_client.get_user_client(current_user.id)
        if user_client:
            result["providers"] = user_client.get_status()
    except Exception as e:
        result["error"] = str(e)

    if not result.get("providers"):
        result["message"] = "No AI service configured. Go to Settings → AI to add one."
    return result


@router.get("/llm/status")
async def llm_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner only")
    from app.classifier.llm_client import llm_client
    from app.models import UserAIService

    providers = llm_client.get_status()
    for p in providers:
        p["source"] = "builtin"

    user_client = None
    try:
        user_client = await llm_client.get_user_client(current_user.id)
    except Exception as exc:
        logger.warning("llm_status: get_user_client failed: %s", exc)
    provider_runtime = {}
    if user_client and user_client is not llm_client:
        for p in user_client.get_status():
            provider_runtime[p["name"]] = p

    services_result = await db.execute(select(UserAIService).where(UserAIService.user_id == current_user.id))
    custom_services = services_result.scalars().all()

    for svc in custom_services:
        runtime = provider_runtime.get(svc.provider, {})
        providers.append(
            {
                "source": "custom",
                "service_id": svc.id,
                "name": svc.display_name,
                "display_name": svc.display_name,
                "model": svc.model_id,
                "model_id": svc.model_id,
                "enabled": svc.enabled,
                "available": svc.enabled,
                "rate_limited_secs": runtime.get("rate_limited_secs", 0),
                "rate_limit_count": runtime.get("rate_limit_count", 0),
                "priority_score": runtime.get("priority_score", 0),
                "success": runtime.get("success", 0),
                "fail": runtime.get("fail", 0),
                "error_rate": runtime.get("error_rate", 0),
            }
        )

    result = {
        "providers": providers,
        "active_service_id": getattr(current_user, "active_ai_service_id", None),
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
