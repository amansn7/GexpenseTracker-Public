from dataclasses import dataclass
from typing import Optional

from app.classifier.learning import get_learned_rule, update_learning
from app.classifier.rules import detect_merchant
from app.models import Label


@dataclass
class MerchantIntelligenceResult:
    label: Optional[Label]
    merchant: Optional[str]
    category: Optional[str]
    confidence: float
    source: str


def apply_merchant_intelligence(
    subject: str,
    body_snippet: str,
    label: Optional[Label],
    merchant: Optional[str],
    category: Optional[str],
    confidence: float,
) -> MerchantIntelligenceResult:
    # Only re-run detection when upstream signals didn't yield a merchant/category.
    # This avoids duplicating the detect_merchant() call already made in apply_rules().
    if merchant is None or category is None:
        text = f"{subject or ''} {body_snippet or ''}"
        detected_merchant, detected_category, detected_conf = detect_merchant(text)
    else:
        detected_merchant, detected_category, detected_conf = None, None, 0.0

    resolved_merchant = merchant or detected_merchant
    resolved_category = category or detected_category
    resolved_label = label
    resolved_confidence = confidence
    source = "carry"

    if resolved_merchant:
        learned = get_learned_rule(resolved_merchant)
        if learned:
            if resolved_label is None:
                resolved_label = Label(str(learned["label"]))
            resolved_category = resolved_category or learned.get("category")
            resolved_confidence = max(
                resolved_confidence,
                min(0.93, 0.80 + (learned.get("count", 0) * 0.03)),
            )
            source = "history"
        elif resolved_label is None and detected_merchant:
            resolved_label = Label.expense
            resolved_confidence = max(
                resolved_confidence,
                round(0.68 + (detected_conf * 0.15), 2),
            )
            source = "merchant"

    return MerchantIntelligenceResult(
        label=resolved_label,
        merchant=resolved_merchant,
        category=resolved_category,
        confidence=resolved_confidence,
        source=source,
    )


def remember_classification(
    merchant: Optional[str],
    label: Optional[Label],
    category: Optional[str],
) -> None:
    if merchant and label in (Label.expense, Label.income):
        update_learning(merchant, label.value, category)
