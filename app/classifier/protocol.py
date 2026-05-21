"""
Classifier abstraction layer.

sync.py depends on this protocol, not on the concrete classifier
implementation. This breaks the direct coupling between the
infrastructure/orchestration layer and the domain logic.
"""
from typing import Protocol, runtime_checkable

from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.classifier import ClassificationResult  # re-export for convenience


@runtime_checkable
class ClassifierProtocol(Protocol):
    """Interface that any email classifier must satisfy."""

    async def __call__(
        self,
        email_id: str | None,
        sender: str,
        sender_domain: str,
        subject: str,
        body_text: str,
        session: AsyncSession | None = None,
        rule_engine_enabled: bool = True,
        db_rules: dict | None = None,
        user_id: str | None = None,
    ) -> ClassificationResult:
        ...


__all__ = ["ClassifierProtocol", "ClassificationResult"]
