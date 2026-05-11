from datetime import datetime
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, _uuid_col, _utcnow


class FilterRule(Base):
    __tablename__ = "filter_rules"

    id: Mapped[str] = _uuid_col()
    rule_type: Mapped[str] = mapped_column(String(30))   # allowlist_domain | blocklist_domain | keyword_pattern
    value: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(20))      # system | user | llm
    hit_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
