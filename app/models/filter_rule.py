from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid_col


class FilterRule(Base):
    __tablename__ = "filter_rules"

    id: Mapped[str] = _uuid_col()
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    rule_type: Mapped[str] = mapped_column(String(30), index=True)   # allowlist_domain | blocklist_domain | keyword_pattern
    value: Mapped[str] = mapped_column(String(255), index=True)
    source: Mapped[str] = mapped_column(String(20))      # system | user | llm
    hit_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
