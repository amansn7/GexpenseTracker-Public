from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import mapped_column

from .base import Base


class SyncProgress(Base):
    __tablename__ = "sync_progress"

    user_id = mapped_column(String(36), primary_key=True, unique=True)
    running = mapped_column(Boolean, default=False)
    phase = mapped_column(String(64), default="idle")
    phase_detail = mapped_column(String(256), default="")
    current = mapped_column(Integer, default=0)
    total = mapped_column(Integer, default=0)
    result_json = mapped_column(Text, nullable=True)
    error = mapped_column(String(512), nullable=True)
    log_json = mapped_column(Text, nullable=True)
    updated_at = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
