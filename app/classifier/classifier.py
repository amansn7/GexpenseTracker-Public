import time
import logging
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Label, TransactionStatus, ClassifierMethod, ClassificationLog
from app.classifier.llm_client import llm_client, MultiLLMClient
from app.classifier.merchant import extract_raw_merchant, normalize_merchant
from app.classifier.rule_engine_adapter import rule_engine_adapter
from app.classifier.rules import MERCHANT_MAP, apply_rules
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    label: Label
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    confidence: float
    classifier_method: ClassifierMethod
    txn_date: Optional[date] = None
    status: TransactionStatus = TransactionStatus.needs_review
    warnings: List[str] = field(default_factory=list)


def _parse_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


async def _load_user_categories(session: AsyncSession, user_id: Optional[str]) -> Optional[str]:
    """Return comma-separated active category names for the given user, or None."""
    if not session or not user_id:
        return None
    from sqlalchemy import select
    from app.models import UserCategory
    rows = (await session.execute(
        select(UserCategory.name)
        .where(UserCategory.user_id == user_id, UserCategory.active.is_(True))
        .order_by(UserCategory.sort_order, UserCategory.name)
    )).scalars().all()
    return ", ".join(rows) if rows else None


async def classify_email(
    email_id: Optional[str],
    sender: str,
    sender_domain: str,
    subject: str,
    body_text: str,
    session: Optional[AsyncSession] = None,
    rule_engine_enabled: bool = True,
    db_rules: Optional[dict] = None,
    user_id: Optional[str] = None,
    llm_client_override: Optional[MultiLLMClient] = None,
    use_llm: bool = True,
) -> ClassificationResult:
    t0 = time.monotonic()
    body_snippet = body_text[:3000]

    user_categories = await _load_user_categories(session, user_id)

    # Stage 1 pre-filter: skip LLM for clear non-financial emails
    if rule_engine_enabled:
        rule_pre = apply_rules(sender_domain, subject, body_text, db_rules or {})
        if rule_pre.label == Label.ignore and rule_pre.confidence >= 0.82:
            logger.debug("Rule pre-filter: skipping LLM for ignore (domain=%s conf=%.2f)", sender_domain, rule_pre.confidence)
            status = (
                TransactionStatus.auto
                if rule_pre.confidence >= settings.AUTO_CONFIRM_THRESHOLD
                else TransactionStatus.needs_review
            )
            return ClassificationResult(
                label=Label.ignore,
                amount=None,
                merchant=None,
                category=None,
                txn_date=None,
                confidence=rule_pre.confidence,
                status=status,
                classifier_method=ClassifierMethod.rule,
            )

    provider = "none"
    model_name = "none"
    raw_response = ""
    llm_result = None
    result_warnings: List[str] = []

    pre_extraction = rule_engine_adapter.extract(subject, body_snippet)
    logger.debug("Pre-extraction for email %s: %s", email_id, pre_extraction)

    provider = "none"
    model_name = "none"
    raw_response = ""
    llm_result = None
    result_warnings: List[str] = []

    if not use_llm:
        logger.debug("LLM disabled for email %s, using rules only", email_id)
    else:
        active_client = llm_client_override or llm_client
        try:
            verbose = await active_client.classify_verbose(
                sender, subject, body_snippet,
                categories=user_categories,
                pre_extraction=pre_extraction,
            )
            llm_result = verbose["result"]
            provider = verbose["provider"]
            model_name = verbose["model"]
            raw_response = verbose["raw_response"]
        except Exception as exc:
            logger.error("LLM classification failed for email %s: %s", email_id, exc, exc_info=True)
            result_warnings.append(f"LLM classification failed: {exc}")

    latency_ms = round((time.monotonic() - t0) * 1000)

    if llm_result:
        raw_merchant = llm_result.merchant
        merchant, _ = normalize_merchant(raw_merchant) if raw_merchant else (None, 0.0)
        merchant = merchant or None  # normalize_merchant returns "" on no-match
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
        rule_result = apply_rules(sender_domain, subject, body_text, db_rules or {})
        if rule_result.merchant:
            merchant = rule_result.merchant
            merchant_conf = 1.0
            merchant_category = MERCHANT_MAP.get(rule_result.merchant.lower(), {}).get("category")
        else:
            raw_merchant = extract_raw_merchant(body_text)
            normalized_merchant, merchant_conf = normalize_merchant(raw_merchant or "")
            merchant_meta = MERCHANT_MAP.get(normalized_merchant, {})
            merchant = merchant_meta.get("display") or (normalized_merchant.title() if normalized_merchant else None)
            merchant_category = merchant_meta.get("category")
        label = rule_result.label or Label.ignore
        amount = None
        category = rule_result.category or merchant_category
        confidence = max(rule_result.confidence, merchant_conf if rule_result.label else 0.0)
        txn_date = None
    classifier_method = ClassifierMethod.llm if llm_result or confidence == 0.0 else ClassifierMethod.rule

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
        classifier_method=classifier_method,
        warnings=result_warnings,
    )
