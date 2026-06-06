import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

logger = logging.getLogger(__name__)


async def log_audit(
    db: AsyncSession,
    action: str,
    user_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    status_code: int | None = None,
    details: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Record an audit log entry."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        method=method,
        path=path,
        resource_type=resource_type,
        resource_id=resource_id,
        status_code=status_code,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    try:
        await db.commit()
    except Exception:
        logger.exception("Failed to write audit log entry")
        await db.rollback()
