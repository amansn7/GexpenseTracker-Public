import uuid
from datetime import UTC, datetime
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import String
from sqlalchemy.orm import mapped_column


class Base(DeclarativeBase):
    pass


def _uuid_col():
    # SQLite-compatible UUID: store as String(36)
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))


def _utcnow() -> datetime:
    return datetime.now(UTC)
