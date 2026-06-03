import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from app.auth_deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.export_service import create_export_job, delete_job, get_job, get_user_jobs

router = APIRouter()
logger = logging.getLogger(__name__)


class ExportRequest(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    label: str | None = None


@router.post("/export", status_code=202)
async def create_export(
    body: ExportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = {}
    if body.date_from:
        filters["date_from"] = body.date_from
    if body.date_to:
        filters["date_to"] = body.date_to
    if body.label:
        filters["label"] = body.label

    job = await create_export_job(db, user.id, filters)
    await db.commit()
    await db.refresh(job)

    import asyncio

    from app.services.export_service import process_export_job

    asyncio.create_task(process_export_job(job.id, get_db))

    return {"id": job.id, "status": job.status}


@router.get("/export/jobs")
async def list_exports(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    jobs = await get_user_jobs(db, user.id)
    return {
        "jobs": [
            {
                "id": j.id,
                "status": j.status,
                "row_count": j.row_count,
                "error": j.error,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ]
    }


@router.get("/export/jobs/{job_id}")
async def get_export_status(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await get_job(db, job_id, user.id)
    if not job:
        raise HTTPException(404, "Export job not found")
    return {
        "id": job.id,
        "status": job.status,
        "row_count": job.row_count,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }


@router.get("/export/jobs/{job_id}/download")
async def download_export(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = await get_job(db, job_id, user.id)
    if not job:
        raise HTTPException(404, "Export job not found")
    if job.status != "completed":
        raise HTTPException(409, "Export not ready")
    if not job.file_path or not os.path.exists(job.file_path):
        raise HTTPException(410, "Export file no longer available")
    return FileResponse(
        job.file_path,
        media_type="text/csv",
        filename="transactions.csv",
        headers={"X-Row-Count": str(job.row_count or 0)},
    )


@router.delete("/export/jobs/{job_id}")
async def cancel_export(
    job_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_job(db, job_id, user.id)
    return {"ok": True}
