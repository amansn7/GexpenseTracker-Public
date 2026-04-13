from dataclasses import dataclass
from datetime import date
from typing import Optional, Dict, Tuple
from app.models import Label, TransactionStatus, ClassifierMethod
from app.classifier.rules import apply_rules
from app.classifier.llm_client import llm_client, LLMClassification
from app.config import settings

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
    sender: str,
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[Dict[str, Tuple[Label, str]]] = None,
    force_extraction: bool = False,
) -> ClassificationResult:
    """
    Classify an email and extract financial details.

    force_extraction=True: if the final label is expense or income, always call
    LLM with the focused extraction prompt to get amount / merchant / category /
    txn_date — even when the rule engine already determined the label with high
    confidence (rules don't extract these fields).
    """
    rule_result = apply_rules(sender_domain, subject, body_snippet, db_rules)

    if rule_result.confidence >= settings.LLM_CONFIDENCE_THRESHOLD:
        label = rule_result.label
        category = rule_result.category
        amount = None
        merchant = None
        txn_date = None
        confidence = rule_result.confidence
        method = ClassifierMethod.rule

        # Rule classified it — but if it's expense/income we still want the
        # financial details. Run extraction-only LLM call.
        if force_extraction and label in (Label.expense, Label.income):
            try:
                ext: LLMClassification = await llm_client.extract(
                    label=label.value,
                    sender=sender,
                    subject=subject,
                    body_snippet=body_snippet,
                )
                amount = ext.amount
                merchant = ext.merchant
                # Only override category if LLM returned one
                category = ext.category or category
                txn_date = _parse_date(ext.txn_date)
                # Keep rule confidence — we trust the label; extraction confidence is secondary
            except Exception:
                pass  # extraction failure is non-fatal; label is already confirmed

    elif rule_result.confidence == 0.0:
        # No rule signal at all — skip LLM, mark as ignore pending review
        return ClassificationResult(
            label=Label.ignore,
            amount=None, merchant=None, category=None, txn_date=None,
            confidence=0.0,
            status=TransactionStatus.needs_review,
            classifier_method=ClassifierMethod.rule,
        )
    else:
        # Partial rule signal — call LLM for full classify + extract
        try:
            llm_result: LLMClassification = await llm_client.classify(
                sender, subject, body_snippet
            )
            label = Label(llm_result.label)
            amount = llm_result.amount
            merchant = llm_result.merchant
            category = llm_result.category
            confidence = llm_result.confidence
            method = ClassifierMethod.llm
            txn_date = _parse_date(llm_result.txn_date)

            # If LLM classified as expense/income with force_extraction,
            # the full classify call already returns details — no second call needed.
        except Exception:
            label = rule_result.label or Label.ignore
            amount = None
            merchant = None
            category = None
            txn_date = None
            confidence = 0.0
            method = ClassifierMethod.rule

    status = (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )

    return ClassificationResult(
        label=label,
        amount=amount,
        merchant=merchant,
        category=category,
        txn_date=txn_date,
        confidence=confidence,
        status=status,
        classifier_method=method,
    )
