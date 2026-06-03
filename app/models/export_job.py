from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid_col


class ExportJob(Base):
    __tablename__ = "export_jobs"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    file_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
