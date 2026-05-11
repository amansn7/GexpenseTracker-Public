import re
import logging
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class PreFilterResult:
    decision: str   # "pass" | "review" | "ambiguous"
    confidence: float
    tier: int


class PreFilterEngine:
    _AMOUNT_RE = re.compile(
        r"Rs\.?\s*[\d,]+|INR\s*[\d,]+|[\d,]+\s*(?:INR|Rs)",
        re.IGNORECASE,
    )
    _VERB_RE = re.compile(
        r"\b(debit|credit|charged|spent|received|deposited|withdrawn)\b",
        re.IGNORECASE,
    )
    _NETWORK_RE = re.compile(
        r"\b(UPI|NEFT|IMPS|RTGS|NACH)\b",
        re.IGNORECASE,
    )

    def __init__(self, rules: list) -> None:
        self._allowlist = {r.value.lower() for r in rules if r.rule_type == "allowlist_domain"}
        self._blocklist = {r.value.lower() for r in rules if r.rule_type == "blocklist_domain"}
        self._keyword_patterns = [
            re.compile(re.escape(r.value), re.IGNORECASE)
            for r in rules
            if r.rule_type == "keyword_pattern"
        ]

    def evaluate_sync(self, subject: str, snippet: str, sender_domain: str) -> PreFilterResult:
        domain = (sender_domain or "").lower()

        # Tier 1 — domain check
        if domain in self._allowlist:
            return PreFilterResult(decision="pass", confidence=1.0, tier=1)
        if domain in self._blocklist:
            return PreFilterResult(decision="review", confidence=0.0, tier=1)

        # Tier 2 — weighted regex scoring
        text = f"{subject} {snippet}"
        score = 0.0
        if self._AMOUNT_RE.search(text):
            score += 0.40
        if self._VERB_RE.search(text):
            score += 0.30
        if self._NETWORK_RE.search(text):
            score += 0.20
        if any(p.search(text) for p in self._keyword_patterns):
            score += 0.10

        if score >= 0.60:
            return PreFilterResult(decision="pass", confidence=score, tier=2)
        if score <= 0.25:
            return PreFilterResult(decision="review", confidence=score, tier=2)
        return PreFilterResult(decision="ambiguous", confidence=score, tier=2)

    async def evaluate(
        self,
        subject: str,
        snippet: str,
        sender_domain: str,
        session,
        user_llm_client=None,
    ) -> PreFilterResult:
        result = self.evaluate_sync(subject, snippet, sender_domain)
        if result.decision != "ambiguous":
            return result

        # Tier 3 — LLM binary call
        if not user_llm_client:
            return PreFilterResult(decision="review", confidence=result.confidence, tier=3)

        try:
            verbose = await user_llm_client.classify_verbose(
                sender=sender_domain,
                subject=subject,
                body_snippet=f"{subject} {snippet[:200]}",
            )
            label = verbose.get("label", "ignore")
            decision = "pass" if label != "ignore" else "review"
            return PreFilterResult(decision=decision, confidence=0.5, tier=3)
        except Exception as exc:
            logger.warning("Pre-filter Tier 3 LLM call failed: %s", exc)
            return PreFilterResult(decision="review", confidence=result.confidence, tier=3)


async def load_engine_from_db(session) -> "PreFilterEngine":
    """Load all FilterRule rows and build a PreFilterEngine. Call once per sync run."""
    from sqlalchemy import select
    from app.models import FilterRule

    rules = (await session.execute(select(FilterRule))).scalars().all()
    return PreFilterEngine(rules)
