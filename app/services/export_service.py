import csv
import os
import tempfile
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email import Email
from app.models.export_job import ExportJob
from app.models.transaction import Transaction

EXPORT_COLUMNS = [
    "id",
    "label",
    "amount",
    "currency",
    "merchant",
    "category",
    "txn_date",
    "confidence",
    "status",
    "classifier_method",
    "user_notes",
    "read",
    "flagged",
    "email_subject",
    "email_sender",
    "email_received_at",
    "gmail_link",
    "created_at",
]

EXPORT_BATCH_SIZE = 1000
EXPORT_DIR = os.path.join(tempfile.gettempdir(), "moneyflow_exports")

os.makedirs(EXPORT_DIR, exist_ok=True)


def _csv_value(value):
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


async def create_export_job(db: AsyncSession, user_id: str, filters: dict) -> ExportJob:
    job = ExportJob(
        user_id=user_id,
        status="queued",
        filters=filters,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
    )
    db.add(job)
    return job


async def get_job(db: AsyncSession, job_id: str, user_id: str) -> ExportJob | None:
    result = await db.execute(
        select(ExportJob).where(ExportJob.id == job_id, ExportJob.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_jobs(db: AsyncSession, user_id: str, limit: int = 20) -> list[ExportJob]:
    result = await db.execute(
        select(ExportJob)
        .where(ExportJob.user_id == user_id)
        .order_by(ExportJob.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def delete_job(db: AsyncSession, job_id: str, user_id: str) -> bool:
    job = await get_job(db, job_id, user_id)
    if not job:
        return False
    if job.file_path and os.path.exists(job.file_path):
        try:
            os.remove(job.file_path)
        except OSError:
            pass
    await db.execute(
        delete(ExportJob).where(ExportJob.id == job_id, ExportJob.user_id == user_id)
    )
    return True


async def cleanup_expired(db: AsyncSession) -> int:
    now = datetime.now(UTC)
    result = await db.execute(
        select(ExportJob).where(
            ExportJob.expires_at <= now,
            ExportJob.status.in_(["completed", "failed"]),
        )
    )
    expired = list(result.scalars().all())
    for job in expired:
        if job.file_path and os.path.exists(job.file_path):
            try:
                os.remove(job.file_path)
            except OSError:
                pass
        await db.delete(job)
    await db.commit()
    return len(expired)


async def process_export_job(job_id: str, get_db):
    """Background task that generates CSV for an export job."""
    try:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        async for db in get_db():
            job = (await db.execute(select(ExportJob).where(ExportJob.id == job_id))).scalar_one()
            job.status = "processing"
            await db.commit()

            filters = job.filters or {}
            conditions = [Email.user_id == job.user_id]
            if filters.get("date_from"):
                conditions.append(Transaction.txn_date >= filters["date_from"])
            if filters.get("date_to"):
                conditions.append(Transaction.txn_date <= filters["date_to"])
            if filters.get("label"):
                conditions.append(Transaction.label == filters["label"])

            file_path = os.path.join(EXPORT_DIR, f"{job_id}.csv")
            row_count = 0
            with open(file_path, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=EXPORT_COLUMNS)
                writer.writeheader()
                last_id = ""
                while True:
                    rows = (
                        await db.execute(
                            select(Transaction, Email)
                            .join(Email, Transaction.email_id == Email.id)
                            .where(*conditions, Transaction.id > last_id)
                            .order_by(Transaction.id)
                            .limit(EXPORT_BATCH_SIZE)
                        )
                    ).all()
                    if not rows:
                        break
                    for t, e in rows:
                        last_id = t.id
                        row_count += 1
                        writer.writerow(
                            {
                                "id": t.id,
                                "label": t.label,
                                "amount": float(t.amount) if t.amount is not None else None,
                                "currency": t.currency,
                                "merchant": t.merchant,
                                "category": t.category,
                                "txn_date": _csv_value(t.txn_date),
                                "confidence": t.confidence,
                                "status": t.status,
                                "classifier_method": t.classifier_method,
                                "user_notes": t.user_notes,
                                "read": bool(t.read),
                                "flagged": bool(t.flagged),
                                "email_subject": e.subject if e else None,
                                "email_sender": e.sender if e else None,
                                "email_received_at": _csv_value(e.received_at if e else None),
                                "gmail_link": e.gmail_link if e else None,
                                "created_at": _csv_value(t.created_at),
                            }
                        )

            job.status = "completed"
            job.row_count = row_count
            job.file_path = file_path
            job.completed_at = datetime.now(UTC)
            await db.commit()
    except Exception as exc:
        try:
            async for db in get_db():
                job = (await db.execute(select(ExportJob).where(ExportJob.id == job_id))).scalar_one()
                job.status = "failed"
                job.error = str(exc)
                await db.commit()
        except Exception:
            pass
