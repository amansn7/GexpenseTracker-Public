from dataclasses import dataclass
from datetime import date
from typing import Optional, Dict, Tuple
from app.models import Label, TransactionStatus, ClassifierMethod
from app.classifier.rules import apply_rules
from app.classifier.llm_client import llm_client, LLMClassification
from app.classifier.feature_classifier import (
    classify_with_features,
    train_from_high_confidence,
)
from app.classifier.merchant_intelligence import apply_merchant_intelligence, remember_classification
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


@dataclass
class _PipelineSignal:
    label: Optional[Label]
    confidence: float
    category: Optional[str] = None
    merchant: Optional[str] = None


@dataclass
class PipelineTrace:
    rule_result: object
    feature_result: object
    selected_signal: _PipelineSignal
    selected_source: str
    merchant_signal: object
    best_signal: _PipelineSignal
    should_call_llm: bool
    route: str


def _parse_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _select_best_signal(
    rule_result: object,
    rule_signal: _PipelineSignal,
    feature_signal: _PipelineSignal,
) -> tuple[_PipelineSignal, str]:
    if getattr(rule_result, "matched_domain", False) and rule_signal.label:
        return rule_signal, "rule_domain"
    if rule_signal.label and rule_signal.confidence >= feature_signal.confidence:
        return rule_signal, "rule"
    if feature_signal.label:
        return feature_signal, "ml"
    if rule_signal.label:
        return rule_signal, "rule"
    return _PipelineSignal(label=None, confidence=0.0), "none"


def _status_from_confidence(confidence: float) -> TransactionStatus:
    return (
        TransactionStatus.auto
        if confidence >= settings.AUTO_CONFIRM_THRESHOLD
        else TransactionStatus.needs_review
    )


def _build_pipeline_trace(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[Dict[str, Tuple[Label, str]]] = None,
    force_llm: bool = False,
) -> PipelineTrace:
    rule_result = apply_rules(sender_domain, subject, body_snippet, db_rules)
    feature_result = classify_with_features(sender_domain, subject, body_snippet)

    rule_signal = _PipelineSignal(
        label=rule_result.label,
        confidence=rule_result.confidence,
        category=rule_result.category,
        merchant=rule_result.merchant,
    )
    feature_signal = _PipelineSignal(
        label=feature_result.label,
        confidence=feature_result.confidence,
        category=feature_result.category,
        merchant=feature_result.merchant,
    )
    selected_signal, selected_source = _select_best_signal(
        rule_result,
        rule_signal,
        feature_signal,
    )
    merchant_signal = apply_merchant_intelligence(
        subject=subject,
        body_snippet=body_snippet,
        label=selected_signal.label,
        merchant=selected_signal.merchant,
        category=selected_signal.category,
        confidence=selected_signal.confidence,
    )
    best_signal = _PipelineSignal(
        label=merchant_signal.label,
        confidence=merchant_signal.confidence,
        category=merchant_signal.category,
        merchant=merchant_signal.merchant,
    )

    if force_llm:
        route = "llm_forced"
        should_call_llm = True
    elif not best_signal.label:
        route = "uncertain"
        should_call_llm = False
    elif best_signal.confidence >= settings.LLM_CONFIDENCE_THRESHOLD:
        route = "non_llm_accepted"
        should_call_llm = False
    else:
        route = "llm_fallback"
        should_call_llm = True

    return PipelineTrace(
        rule_result=rule_result,
        feature_result=feature_result,
        selected_signal=selected_signal,
        selected_source=selected_source,
        merchant_signal=merchant_signal,
        best_signal=best_signal,
        should_call_llm=should_call_llm,
        route=route,
    )


def trace_classification_pipeline(
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[Dict[str, Tuple[Label, str]]] = None,
    force_llm: bool = False,
) -> PipelineTrace:
    return _build_pipeline_trace(
        sender_domain=sender_domain,
        subject=subject,
        body_snippet=body_snippet,
        db_rules=db_rules,
        force_llm=force_llm,
    )


async def classify_email(
    sender: str,
    sender_domain: str,
    subject: str,
    body_snippet: str,
    db_rules: Optional[Dict[str, Tuple[Label, str]]] = None,
    force_extraction: bool = False,
    force_llm: bool = False,
) -> ClassificationResult:
    """
    Classify an email and extract financial details.

    force_extraction=True: if the final label is expense or income, always call
    LLM with the focused extraction prompt to get amount / merchant / category /
    txn_date — even when the rule engine already determined the label.

    force_llm=True: bypass rule-engine gating entirely and always call LLM for
    the full classify+extract pass. Used when the user explicitly triggers LLM
    from the UI — prevents high-confidence rule results (e.g. ignore) from
    silently overriding the user's intent.
    """
    trace = _build_pipeline_trace(
        sender_domain=sender_domain,
        subject=subject,
        body_snippet=body_snippet,
        db_rules=db_rules,
        force_llm=force_llm,
    )
    best_signal = trace.best_signal

    if not force_llm and best_signal.label and best_signal.confidence >= settings.LLM_CONFIDENCE_THRESHOLD:
        label = best_signal.label
        category = best_signal.category
        amount = None
        merchant = best_signal.merchant
        txn_date = None
        confidence = best_signal.confidence
        method = ClassifierMethod.rule

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
                category = ext.category or category
                txn_date = _parse_date(ext.txn_date)
                method = ClassifierMethod.llm  # LLM did extraction work
            except Exception:
                pass

    else:
        # Covers: force_llm=True, llm_fallback route, and uncertain (no signal) route.
        # Uncertain emails fall through here instead of returning a silent ignore — LLM
        # is the right call when rules and ML have no opinion at all.
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
        except Exception:
            label = best_signal.label or Label.ignore
            amount = None
            merchant = best_signal.merchant
            category = best_signal.category
            txn_date = None
            confidence = best_signal.confidence if best_signal.label else 0.0
            method = ClassifierMethod.rule

    remember_classification(merchant, label, category)
    if label in (Label.expense, Label.income, Label.ignore):
        train_from_high_confidence(
            sender_domain=sender_domain,
            subject=subject,
            body_snippet=body_snippet,
            label=label.value,
            confidence=confidence,
        )
    status = _status_from_confidence(confidence)

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
