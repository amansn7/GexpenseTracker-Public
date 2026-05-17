import re
import time
import logging
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Label, TransactionStatus, ClassifierMethod, ClassificationLog
from app.classifier.llm_client import llm_client, MultiLLMClient
from app.classifier.merchant import extract_raw_merchant
from app.classifier.merchant_entity import resolve_merchant
from app.classifier.rule_engine_adapter import rule_engine_adapter
from app.classifier.rules import MERCHANT_MAP, apply_rules
from app.config import settings

_AMOUNT_RE = re.compile(
    r'(?:Rs\.?\s*|INR\s*|₹\s*)(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)'  # prefix: Rs. 2754, INR 2754, ₹2754
    r'|'
    r'(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|₹)',  # suffix: 2754 INR, 2754 Rs, 2754₹
    re.IGNORECASE
)

# Amount validation thresholds
_AMOUNT_CEILING = 10_000_000  # ₹1 crore — reject above this
_AMOUNT_REVIEW_THRESHOLD = 1_000_000  # ₹10 lakh — flag for review above this

_CC_PATTERNS = [
    re.compile(r"credit\s*card", re.I),
    re.compile(r"cc\s*statement", re.I),
    re.compile(r"hdfc.*credit", re.I),
    re.compile(r"icici.*credit", re.I),
    re.compile(r"sbi\s*card", re.I),
    re.compile(r"axis.*credit", re.I),
    re.compile(r"amex", re.I),
    re.compile(r"american.?express", re.I),
]
_UPI_PATTERNS = [
    re.compile(r"@\w+", re.I),  # UPI handle
    re.compile(r"upi", re.I),
    re.compile(r"gpay|phonepe|paytm", re.I),
    re.compile(r"ybl|ibl|okicici|axl", re.I),
]
_NET_BANKING_PATTERNS = [
    re.compile(r"net\s*banking", re.I),
    re.compile(r"neft|imps|rtgs", re.I),
]


def _detect_payment_mode(text: str) -> Optional[str]:
    """Detect payment mode from email text. Returns credit_card, upi, net_banking, or None."""
    if not text:
        return None
    if any(p.search(text) for p in _CC_PATTERNS):
        return "credit_card"
    if any(p.search(text) for p in _UPI_PATTERNS):
        return "upi"
    if any(p.search(text) for p in _NET_BANKING_PATTERNS):
        return "net_banking"
    return None


def _validate_llm_amount(amount, confidence, status):
    """Validate LLM-extracted amount. Returns (amount, status, needs_review_flag)."""
    if amount is None:
        return amount, status, False
    if amount <= 0:
        return None, TransactionStatus.needs_review, True
    if amount > _AMOUNT_CEILING:
        return None, TransactionStatus.needs_review, True
    if amount > _AMOUNT_REVIEW_THRESHOLD:
        # Flag for review even if confidence is high
        return amount, TransactionStatus.needs_review, True
    return amount, status, False

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
    transaction_type: Optional[str] = None
    payment_mode: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


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
    rule_engine_enabled: bool = True,
    db_rules: Optional[dict] = None,
    user_id: Optional[str] = None,
    llm_client_override: Optional[MultiLLMClient] = None,
    use_llm: bool = True,
    llm_priority: bool = False,
    categories_override: Optional[str] = None,
) -> ClassificationResult:
    t0 = time.monotonic()
    body_snippet = (body_text or "")[:3000]

    if categories_override is not None:
        user_categories = categories_override
    else:
        from app.services.category_service import CategoryService
        user_categories = await CategoryService.load_for_llm(session, user_id)

    # Stage 1 pre-filter: skip LLM for clear non-financial emails
    if rule_engine_enabled and not llm_priority:
        rule_pre = apply_rules(sender_domain, subject, body_text, db_rules or {})
        if rule_pre.label == Label.ignore and rule_pre.confidence >= 0.82:
            logger.debug("Rule pre-filter: skipping LLM for ignore (domain=%s conf=%.2f)", sender_domain, rule_pre.confidence)
            status = (
                TransactionStatus.auto
                if rule_pre.confidence >= settings.AUTO_CONFIRM_THRESHOLD
                else TransactionStatus.needs_review
            )
            txn_type = None
            if rule_pre.category == "CC Payment":
                txn_type = "cc_payment"
            return ClassificationResult(
                label=Label.ignore,
                amount=None,
                merchant=None,
                category=None,
                txn_date=None,
                confidence=rule_pre.confidence,
                status=status,
                classifier_method=ClassifierMethod.rule,
                transaction_type=txn_type,
                payment_mode=_detect_payment_mode(body_text),
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
        merchant_info = resolve_merchant(raw_merchant) if raw_merchant else {"canonical": None, "parent": None, "confidence": 0.0, "method": "empty"}
        merchant = merchant_info["canonical"] or None
        try:
            label = Label(llm_result.label)
        except ValueError:
            logger.warning("LLM returned unknown label %r for email %s, defaulting to ignore", llm_result.label, email_id)
            label = Label.ignore
        amount = llm_result.amount
        category = llm_result.category
        confidence = llm_result.confidence
        txn_date = _parse_date(llm_result.txn_date)

        if label == Label.ignore and category == "CC Payment":
            txn_type = "cc_payment"
        elif category == "Investment":
            txn_type = "investment"
        elif label == Label.income:
            txn_type = "income"
        elif label == Label.expense:
            txn_type = "purchase"
        else:
            txn_type = None
    else:
        rule_result = apply_rules(sender_domain, subject, body_text, db_rules or {})
        if rule_result.merchant:
            merchant = rule_result.merchant
            merchant_conf = 1.0
            merchant_category = MERCHANT_MAP.get(rule_result.merchant.lower(), {}).get("category")
        else:
            raw_merchant = extract_raw_merchant(body_text)
            merchant_info = resolve_merchant(raw_merchant or "")
            merchant_conf = merchant_info["confidence"]
            merchant_meta = MERCHANT_MAP.get(merchant_info["canonical"].lower() if merchant_info["canonical"] else "", {})
            merchant = merchant_meta.get("display") or (merchant_info["canonical"].title() if merchant_info["canonical"] else None)
            merchant_category = merchant_meta.get("category")
        label = rule_result.label or Label.ignore
        amount = None
        category = rule_result.category or merchant_category
        confidence = max(rule_result.confidence, merchant_conf if rule_result.label else 0.0)
        txn_date = None

        if label == Label.ignore and category == "CC Payment":
            txn_type = "cc_payment"
        elif category == "Investment":
            txn_type = "investment"
        elif label == Label.income:
            txn_type = "income"
        elif label == Label.expense:
            txn_type = "purchase"
        else:
            txn_type = None
    classifier_method = ClassifierMethod.llm if llm_result else ClassifierMethod.rule

    status = (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )

    # Validate LLM-extracted amount
    if llm_result:
        amount, status, _ = _validate_llm_amount(amount, confidence, status)

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
        transaction_type=txn_type,
        payment_mode=_detect_payment_mode(body_text),
        warnings=result_warnings,
    )


def _rules_fallback_result(
    sender_domain: str, subject: str, body_text: str,
    db_rules: Optional[dict],
) -> ClassificationResult:
    rule_result = apply_rules(sender_domain, subject, body_text, db_rules or {})
    if rule_result.merchant:
        merchant = rule_result.merchant
        merchant_conf = 1.0
        merchant_category = MERCHANT_MAP.get(rule_result.merchant.lower(), {}).get("category")
    else:
        raw_merchant = extract_raw_merchant(body_text)
        merchant_info = resolve_merchant(raw_merchant or "")
        merchant_conf = merchant_info["confidence"]
        merchant_meta = MERCHANT_MAP.get(merchant_info["canonical"].lower() if merchant_info["canonical"] else "", {})
        merchant = merchant_meta.get("display") or (merchant_info["canonical"].title() if merchant_info["canonical"] else None)
        merchant_category = merchant_meta.get("category")
    label = rule_result.label or Label.ignore
    amount = _extract_amount(body_text)
    category = rule_result.category or merchant_category
    confidence = max(rule_result.confidence, merchant_conf if rule_result.label else 0.0)
    status = (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )

    if label == Label.ignore and category == "CC Payment":
        txn_type = "cc_payment"
    elif category == "Investment":
        txn_type = "investment"
    elif label == Label.income:
        txn_type = "income"
    elif label == Label.expense:
        txn_type = "purchase"
    else:
        txn_type = None

    return ClassificationResult(
        label=label, amount=amount, merchant=merchant, category=category,
        txn_date=None, confidence=confidence, status=status,
        classifier_method=ClassifierMethod.rule,
        transaction_type=txn_type,
        payment_mode=_detect_payment_mode(body_text),
    )


def _extract_amount(text: str) -> Optional[float]:
    m = _AMOUNT_RE.search(text)
    if m:
        raw = m.group(1) or m.group(2)
        if raw:
            raw = raw.replace(",", "")
            try:
                return float(raw)
            except ValueError:
                return None
    return None


async def batch_classify_emails(
    items: List[Tuple[Optional[str], str, str, str, str]],
    session: Optional[AsyncSession] = None,
    rule_engine_enabled: bool = True,
    db_rules: Optional[dict] = None,
    user_id: Optional[str] = None,
    llm_client_override: Optional[MultiLLMClient] = None,
    use_llm: bool = True,
    llm_priority: bool = False,
    batch_size: int = 5,
) -> List[ClassificationResult]:
    """Classify multiple emails, batching LLM calls for efficiency.

    Batches share a single system prompt + instruction overhead, reducing
    token consumption, HTTP requests, and rate-limit pressure.

    Args:
        items: (email_id, sender, sender_domain, subject, body_text) tuples
        session: optional DB session for ClassificationLog writes
        rule_engine_enabled: whether to apply rules pre-filter
        db_rules: learned domain rules from DB
        user_id: for loading user-specific categories
        llm_client_override: per-user LLM client
        use_llm: whether to use LLM at all
        llm_priority: skip rules pre-filter, always try LLM first
        batch_size: max emails per batch

    Returns:
        List[ClassificationResult] in same order as items.
    """
    t0 = time.monotonic()
    from app.services.category_service import CategoryService
    user_categories = await CategoryService.load_for_llm(session, user_id)

    n = len(items)
    body_snippets: List[str] = []
    for _, _, _, _, body_text in items:
        body_snippets.append(body_text[:3000])

    results: List[ClassificationResult] = [None] * n  # type: ignore[list-item]
    need_llm: List[Tuple[int, Optional[str], str, str, str, str]] = []

    # ── Phase 1: rules pre-check per email ────────────────────────────
    for i, (email_id, sender, sender_domain, subject, body_text) in enumerate(items):
        if rule_engine_enabled and not llm_priority and use_llm:
            rule_pre = apply_rules(sender_domain, subject, body_text, db_rules or {})
            if rule_pre.label == Label.ignore and rule_pre.confidence >= 0.82:
                status = (
                    TransactionStatus.auto
                    if rule_pre.confidence >= settings.AUTO_CONFIRM_THRESHOLD
                    else TransactionStatus.needs_review
                )
                txn_type = "cc_payment" if rule_pre.category == "CC Payment" else None
                results[i] = ClassificationResult(
                    label=Label.ignore, amount=None, merchant=None, category=None,
                    txn_date=None, confidence=rule_pre.confidence, status=status,
                    classifier_method=ClassifierMethod.rule,
                    transaction_type=txn_type,
                    payment_mode=_detect_payment_mode(body_text),
                )
                continue

        if not use_llm:
            results[i] = _rules_fallback_result(sender_domain, subject, body_text, db_rules)
            continue

        need_llm.append((i, email_id, sender, sender_domain, subject, body_text))

    # ── Phase 2: batch LLM calls ──────────────────────────────────────
    if need_llm and use_llm:
        client = llm_client_override or llm_client
        for batch_start in range(0, len(need_llm), batch_size):
            batch = need_llm[batch_start:batch_start + batch_size]
            batch_args = [
                (
                    items[idx][1], items[idx][3], body_snippets[idx],
                    rule_engine_adapter.extract(items[idx][3], body_snippets[idx]),
                )
                for idx, _, _, _, _, _ in batch
            ]
            batch_ts = time.monotonic()

            try:
                verbose = await client.batch_classify_verbose(batch_args, categories=user_categories)
                llm_provider = verbose["provider"]
                llm_model = verbose["model"]
                llm_raw = verbose["raw_response"]
                batch_results = verbose["results"]

                for offset, llm_res in enumerate(batch_results):
                    idx, email_id, sender, sender_domain, subject, _ = batch[offset]
                    snippet = body_snippets[idx]

                    raw_merchant = llm_res.merchant
                    merchant_info = resolve_merchant(raw_merchant) if raw_merchant else {"canonical": None, "parent": None, "confidence": 0.0, "method": "empty"}
                    merchant = merchant_info["canonical"] or None
                    try:
                        label = Label(llm_res.label)
                    except ValueError:
                        logger.warning("LLM returned unknown label %r for email %s, defaulting to ignore", llm_res.label, email_id)
                        label = Label.ignore
                    amount = llm_res.amount
                    category = llm_res.category
                    confidence = llm_res.confidence
                    txn_date = _parse_date(llm_res.txn_date)

                    if label == Label.ignore and category == "CC Payment":
                        txn_type = "cc_payment"
                    elif category == "Investment":
                        txn_type = "investment"
                    elif label == Label.income:
                        txn_type = "income"
                    elif label == Label.expense:
                        txn_type = "purchase"
                    else:
                        txn_type = None

                    status = (
                        TransactionStatus.auto
                        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
                        else TransactionStatus.needs_review
                    )

                    # Validate LLM-extracted amount
                    amount, status, _ = _validate_llm_amount(amount, confidence, status)

                    results[idx] = ClassificationResult(
                        label=label, amount=amount, merchant=merchant,
                        category=category, txn_date=txn_date,
                        confidence=confidence, status=status,
                        classifier_method=ClassifierMethod.llm,
                        transaction_type=txn_type,
                        payment_mode=_detect_payment_mode(items[idx][4]),
                    )

                    latency_ms = round((time.monotonic() - batch_ts) * 1000)
                    if session is not None:
                        try:
                            session.add(ClassificationLog(
                                email_id=email_id,
                                sender_domain=sender_domain,
                                subject=subject,
                                body_snippet=snippet,
                                provider=llm_provider,
                                model=llm_model,
                                latency_ms=latency_ms,
                                llm_label=llm_res.label if llm_res else None,
                                llm_amount=llm_res.amount if llm_res else None,
                                llm_merchant=raw_merchant,
                                llm_category=llm_res.category if llm_res else None,
                                llm_confidence=llm_res.confidence if llm_res else None,
                                llm_txn_date=_parse_date(llm_res.txn_date) if llm_res else None,
                                raw_response=llm_raw,
                            ))
                        except Exception as log_exc:
                            logger.warning("Failed to write batch classification log: %s", log_exc)

            except Exception as exc:
                logger.error("Batch classification failed for %d emails: %s", len(batch), exc, exc_info=True)

    # ── Phase 3: retry remaining with per-email LLM, fall back to rules ──
    for i in range(n):
        if results[i] is not None:
            continue
        email_id, sender, sender_domain, subject, body_text = items[i]
        try:
            results[i] = await classify_email(
                email_id=email_id, sender=sender, sender_domain=sender_domain,
                subject=subject, body_text=body_text, session=session,
                rule_engine_enabled=rule_engine_enabled, db_rules=db_rules,
                user_id=user_id, llm_client_override=llm_client_override,
                use_llm=use_llm,
            )
        except Exception:
            results[i] = _rules_fallback_result(sender_domain, subject, body_text, db_rules)

    return results  # type: ignore[return-value]
