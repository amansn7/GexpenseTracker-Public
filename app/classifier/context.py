from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.llm_client import MultiLLMClient


@dataclass
class ClassificationContext:
    """Bundles all parameters for classify_email into a single context object."""

    # Required email content
    email_id: Optional[str]
    sender: str
    sender_domain: str
    subject: str
    body_text: str

    # Optional runtime configuration
    session: Optional[AsyncSession] = None
    rule_engine_enabled: bool = True
    db_rules: Optional[dict] = None
    user_id: Optional[str] = None
    llm_client_override: Optional[MultiLLMClient] = None
    use_llm: bool = True
    llm_priority: bool = False
    categories_override: Optional[str] = None
