import logging
import re
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ReDoS protection: reject patterns that look dangerous
_REDOS_PATTERNS = [
    re.compile(r"(\([^)]*\)|\[[^\]]*\])\*"),  # (abc)* or [abc]*
    re.compile(r"(\([^)]*\)|\[[^\]]*\])\+"),  # (abc)+ or [abc]+
    re.compile(r"\(\.\*\)\*"),                 # (.*)*
    re.compile(r"\(\.\*\)\+"),                 # (.*)+
    re.compile(r"\(\.\+\)\*"),                 # (.+)*
    re.compile(r"\(\.\+\)\+"),                 # (.+)+
    re.compile(r"\(\\w\+\)\*"),                # (\w+)*
    re.compile(r"\(\\w\*\)\*"),                # (\w*)*
    re.compile(r"\(\\d\+\)\*"),                # (\d+)*
    re.compile(r"\(\\d\*\)\*"),                # (\d*)*
    re.compile(r"\(\\s\+\)\*"),                # (\s+)*
    re.compile(r"\(\\s\*\)\*"),                # (\s*)*
]

_MAX_PATTERN_LENGTH = 256


def _is_safe_pattern(pattern: str) -> bool:
    """Check if a regex pattern is safe from ReDoS attacks."""
    if len(pattern) > _MAX_PATTERN_LENGTH:
        return False
    for dangerous in _REDOS_PATTERNS:
        if dangerous.search(pattern):
            return False
    # Check for nested quantifiers like (a+)+ or (a*)*
    depth = 0
    for i, c in enumerate(pattern):
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if depth < 0:
                return False
        elif c in '*+?' and depth > 0:
            # Check if preceded by another quantifier
            if i > 0 and pattern[i-1] in '*+?':
                return False
    return depth == 0


class RegexTimeoutError(Exception):
    """Raised when a regex match takes too long."""
    pass


def _safe_match(pattern: re.Pattern, text: str, timeout_ms: int = 100) -> bool:
    """Run regex match with timeout protection."""
    import threading

    result = [False]
    exception = [None]

    def _match():
        try:
            result[0] = bool(pattern.search(text))
        except Exception as e:
            exception[0] = e

    thread = threading.Thread(target=_match)
    thread.daemon = True
    thread.start()
    thread.join(timeout=timeout_ms / 1000.0)

    if thread.is_alive():
        raise RegexTimeoutError(f"Regex match timed out after {timeout_ms}ms")

    if exception[0]:
        raise exception[0]

    return result[0]


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
        self._keyword_patterns = []
        for r in rules:
            if r.rule_type == "keyword_pattern":
                if not _is_safe_pattern(r.value):
                    logger.warning("Rejected unsafe keyword pattern: %s", r.value[:50])
                    continue
                try:
                    self._keyword_patterns.append(re.compile(re.escape(r.value), re.IGNORECASE))
                except re.error as exc:
                    logger.warning("Invalid keyword pattern: %s (%s)", r.value[:50], exc)

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
        if any(_safe_match(p, text) for p in self._keyword_patterns):
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


async def load_engine_from_db(session, user_id: str = None) -> "PreFilterEngine":
    """Load all FilterRule rows and build a PreFilterEngine. Call once per sync run."""
    from sqlalchemy import select

    from app.models import FilterRule

    stmt = select(FilterRule)
    if user_id:
        stmt = stmt.where(FilterRule.user_id == user_id)
    rules = (await session.execute(stmt)).scalars().all()
    return PreFilterEngine(rules)
