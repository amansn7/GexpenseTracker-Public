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

async def classify_email(
    sender: str,
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[Dict[str, Tuple[Label, str]]] = None,
) -> ClassificationResult:
    rule_result = apply_rules(sender_domain, subject, body_snippet, db_rules)

    if rule_result.confidence >= settings.LLM_CONFIDENCE_THRESHOLD:
        label = rule_result.label
        category = rule_result.category
        amount = None
        merchant = None
        txn_date = None
        confidence = rule_result.confidence
        method = ClassifierMethod.rule
    else:
        try:
            llm_result: LLMClassification = await llm_client.classify(sender, subject, body_snippet)
            label = Label(llm_result.label)
            amount = llm_result.amount
            merchant = llm_result.merchant
            category = llm_result.category
            confidence = llm_result.confidence
            method = ClassifierMethod.llm
            txn_date = None
            if llm_result.txn_date:
                try:
                    txn_date = date.fromisoformat(llm_result.txn_date)
                except ValueError:
                    pass
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
