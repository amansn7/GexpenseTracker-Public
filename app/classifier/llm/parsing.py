"""Response parsing, JSON extraction, and validation."""
import json
import logging
import re
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class LLMClassification:
    label: str
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    txn_date: Optional[str]
    confidence: float
    email_type: Optional[str] = None


def extract_json(text: str) -> str:
    """Extract JSON from LLM response text, stripping markdown fences and quotes."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            elif text.startswith("xml"):
                text = text[3:]
    text = text.strip()
    text = re.sub(r"^```.*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    if text.startswith("'") and text.endswith("'"):
        text = text[1:-1]
    bracket_open = text.find("[")
    if bracket_open >= 0 and text.rfind("]") > bracket_open and (bracket_open < text.find("{") or text.find("{") < 0):
        brace_close = text.rfind("]")
        text = text[bracket_open : brace_close + 1]
    else:
        brace_open = text.find("{")
        brace_close = text.rfind("}")
        if brace_open >= 0 and brace_close > brace_open:
            text = text[brace_open : brace_close + 1]
    return text


_REPAIRERS = [
    ("original", lambda t: t),
    ("trailing commas", lambda t: re.sub(r",(\s*[}\]])", r"\1", t)),
    ("single quotes", lambda t: t.replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")),
    ("unquoted keys", lambda t: re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', t)),
    ("trailing commas + single quotes", lambda t: re.sub(r",(\s*[}\]])", r"\1", t).replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")),
    ("trailing commas + unquoted keys", lambda t: re.sub(r",(\s*[}\]])", r"\1", re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', t))),
    ("all fixes", lambda t: re.sub(r",(\s*[}\]])", r"\1", re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', t.replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")))),
]


def parse_response(raw: str) -> LLMClassification:
    """Parse a single-email LLM response into an LLMClassification."""
    cleaned = extract_json(raw)
    for name, fix in _REPAIRERS:
        try:
            data = json.loads(fix(cleaned))
            if name != "original":
                logger.info("Repair strategy '%s' succeeded", name)
            break
        except json.JSONDecodeError:
            continue
    else:
        raise ValueError(f"Cannot parse response: {cleaned[:200]}")
    return LLMClassification(
        label=data.get("label", "ignore"),
        amount=float(data["amount"]) if data.get("amount") is not None else None,
        merchant=data.get("merchant"),
        category=data.get("category"),
        txn_date=data.get("txn_date"),
        confidence=float(data.get("confidence", 0.5)),
        email_type=data.get("email_type"),
    )


def parse_batch_response(raw: str, expected_count: int) -> List[LLMClassification]:
    """Parse a JSON array response into individual LLMClassification objects."""
    cleaned = extract_json(raw)
    for _, fix in _REPAIRERS:
        try:
            data = json.loads(fix(cleaned))
            break
        except json.JSONDecodeError:
            continue
    else:
        raise ValueError(f"Cannot parse batch response: {cleaned[:200]}")

    if not isinstance(data, list):
        data = [data]

    results: List[LLMClassification] = []
    for item in data:
        if not isinstance(item, dict):
            results.append(LLMClassification(
                label="ignore", amount=None, merchant=None,
                category=None, txn_date=None, confidence=0.0,
            ))
            continue
        results.append(LLMClassification(
            label=str(item.get("label", "ignore")),
            amount=float(item["amount"]) if item.get("amount") is not None else None,
            merchant=item.get("merchant"),
            category=item.get("category"),
            txn_date=item.get("txn_date"),
            confidence=float(item.get("confidence", 0.5)),
            email_type=item.get("email_type"),
        ))

    if len(results) != expected_count:
        logger.warning("LLM returned %d results for batch of %d; padding/truncating", len(results), expected_count)
    while len(results) < expected_count:
        results.append(LLMClassification(
            label="ignore", amount=None, merchant=None,
            category=None, txn_date=None, confidence=0.0,
            email_type=None,
        ))
    return results[:expected_count]
