from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.llm_client import MultiLLMClient


@dataclass
class ClassificationContext:
    """Bundles all parameters for classify_email into a single context object."""

    # Required email content
    email_id: str | None
    sender: str
    sender_domain: str
    subject: str
    body_text: str

    # Optional runtime configuration
    session: AsyncSession | None = None
    rule_engine_enabled: bool = True
    db_rules: dict | None = None
    user_id: str | None = None
    llm_client_override: MultiLLMClient | None = None
    use_llm: bool = True
    llm_priority: bool = False
    categories_override: str | None = None
