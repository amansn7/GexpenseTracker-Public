import time
import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Label, TransactionStatus, ClassifierMethod, ClassificationLog
from app.classifier.llm_client import llm_client
from app.classifier.merchant import normalize_merchant
from app.alerts import add_alert
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    label: Label
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    txn_date: Optional[date]
    confidence: float
    status: TransactionStatus
    classifier_method: ClassifierMethod


def _parse_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


async def classify_email(
    email_id: Optional[str],
    sender: str,
    sender_domain: str,
    subject: str,
    body_text: str,
    session: Optional[AsyncSession] = None,
) -> ClassificationResult:
    t0 = time.monotonic()
    body_snippet = body_text[:3000]
    provider = "none"
    model_name = "none"
    raw_response = ""
    llm_result = None

    try:
        verbose = await llm_client.classify_verbose(sender, subject, body_snippet)
        llm_result = verbose["result"]
        provider = verbose["provider"]
        model_name = verbose["model"]
        raw_response = verbose["raw_response"]
    except Exception as exc:
        logger.error("LLM classification failed for email %s: %s", email_id, exc)
        add_alert("error", f"LLM classification failed: {exc}", source="classifier")

    latency_ms = round((time.monotonic() - t0) * 1000)

    if llm_result:
        raw_merchant = llm_result.merchant
        merchant, _ = normalize_merchant(raw_merchant) if raw_merchant else (None, 0.0)
        try:
            label = Label(llm_result.label)
        except ValueError:
            logger.warning("LLM returned unknown label %r for email %s, defaulting to ignore", llm_result.label, email_id)
            label = Label.ignore
        amount = llm_result.amount
        category = llm_result.category
        confidence = llm_result.confidence
        txn_date = _parse_date(llm_result.txn_date)
    else:
        raw_merchant = None
        merchant = None
        label = Label.ignore
        amount = None
        category = None
        confidence = 0.0
        txn_date = None

    status = (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )

    if session is not None:
        try:
            session.add(ClassificationLog(
                email_id=email_id,
                sender_domain=sender_domain,
                subject=subject,
                body_snippet=body_snippet,
                provider=provider,
                model=model_name,
                latency_ms=latency_ms,
                llm_label=llm_result.label if llm_result else None,
                llm_amount=llm_result.amount if llm_result else None,
                llm_merchant=raw_merchant,
                llm_category=llm_result.category if llm_result else None,
                llm_confidence=llm_result.confidence if llm_result else None,
                llm_txn_date=_parse_date(llm_result.txn_date) if llm_result else None,
                raw_response=raw_response,
            ))
        except Exception as log_exc:
            logger.warning("Failed to write classification log: %s", log_exc)

    return ClassificationResult(
        label=label,
        amount=amount,
        merchant=merchant,
        category=category,
        txn_date=txn_date,
        confidence=confidence,
        status=status,
        classifier_method=ClassifierMethod.llm,
    )
