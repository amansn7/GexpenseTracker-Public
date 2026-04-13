"""
LLM → Pattern Rule auto-generation.

After LLM classifies an expense/income email with high confidence,
generate a regex pattern for future rule-based matching and persist it.

In-memory cache (`_pattern_cache`) is loaded at startup and checked
synchronously inside apply_rules() Layer 0.5 — no async needed there.
"""
import re
import logging
from dataclasses import dataclass
from typing import Optional, List

log = logging.getLogger(__name__)

# ── In-memory cache ───────────────────────────────────────────────────────────

@dataclass
class CachedPattern:
    regex: re.Pattern
    label: str
    merchant: Optional[str]
    category: Optional[str]
    confidence: float

_pattern_cache: List[CachedPattern] = []
_MAX_CACHE_SIZE = 500  # evict oldest when exceeded


def get_pattern_cache() -> List[CachedPattern]:
    return _pattern_cache


def _add_to_cache(raw_pattern: str, label: str, merchant: Optional[str],
                  category: Optional[str], confidence: float) -> None:
    try:
        compiled = re.compile(raw_pattern, re.IGNORECASE)
        _pattern_cache.append(CachedPattern(
            regex=compiled, label=label, merchant=merchant,
            category=category, confidence=confidence,
        ))
        if len(_pattern_cache) > _MAX_CACHE_SIZE:
            evicted = _pattern_cache.pop(0)
            log.debug("pattern_gen: cache full (%d), evicted oldest: %s", _MAX_CACHE_SIZE, evicted.merchant)
    except re.error as exc:
        log.warning("pattern_gen: bad regex skipped: %s — %s", raw_pattern, exc)


def clear_cache() -> None:
    _pattern_cache.clear()


# ── Pattern generation ────────────────────────────────────────────────────────

def generate_pattern(merchant: str, label: str) -> str:
    """
    Build a regex that matches Indian bank alert text for a merchant.

    For expense:
        (?:(?:debited|paid|charged|spent|purchase).{0,120}MERCHANT|MERCHANT.{0,80}(?:debited|paid|charged|spent))
    For income:
        (?:(?:credited|received|refund|salary).{0,120}MERCHANT|MERCHANT.{0,80}(?:credited|received))
    """
    m = re.escape(merchant.lower())
    if label == "income":
        return (
            rf"(?:(?:credited|received|refund|salary).{{0,120}}{m}"
            rf"|{m}.{{0,80}}(?:credited|received|refund))"
        )
    # default: expense
    return (
        rf"(?:(?:debited|paid|charged|spent|purchase).{{0,120}}{m}"
        rf"|{m}.{{0,80}}(?:debited|paid|charged|spent|purchase))"
    )


def _pattern_matches_text(pattern: str, text: str) -> bool:
    try:
        return bool(re.search(pattern, text, re.IGNORECASE))
    except re.error:
        return False


# ── Persistence (async) ───────────────────────────────────────────────────────

async def save_pattern_rule(
    db,
    merchant: str,
    label: str,
    category: Optional[str],
    confidence: float,
    trigger_text: str,
) -> Optional[str]:
    """
    Generate a pattern for `merchant`, test it against `trigger_text`,
    and persist to DB if novel. Returns the pattern string or None.

    `db` is an AsyncSession already in scope from the caller.
    """
    from sqlalchemy import select
    from app.models import PatternRule

    if not merchant or label not in ("expense", "income"):
        return None

    pattern = generate_pattern(merchant, label)

    # Sanity check: pattern must match the email that triggered it
    if not _pattern_matches_text(pattern, trigger_text):
        log.info("pattern_gen: generated pattern did not match trigger text, skipping. merchant=%s", merchant)
        return None

    # Skip if identical pattern already exists
    existing = (await db.execute(
        select(PatternRule).where(PatternRule.regex_pattern == pattern)
    )).scalar_one_or_none()

    if existing:
        existing.hit_count += 1
        log.debug("pattern_gen: existing pattern hit_count++. merchant=%s", merchant)
        return None

    rule = PatternRule(
        regex_pattern=pattern,
        label=label,
        merchant=merchant,
        category=category,
        confidence=confidence,
        hit_count=1,
        source="llm_generated",
    )
    db.add(rule)
    # Caller commits; we just add the object.

    # Update in-memory cache immediately
    _add_to_cache(pattern, label, merchant, category, confidence)
    log.info("pattern_gen: new rule saved. merchant=%s label=%s pattern=%s", merchant, label, pattern)
    return pattern


# ── Startup loader ────────────────────────────────────────────────────────────

async def load_pattern_cache_from_db(db) -> int:
    """
    Load all PatternRule rows from DB into the in-memory cache.
    Call once at application startup inside lifespan().
    Returns the number of patterns loaded.
    """
    from sqlalchemy import select
    from app.models import PatternRule

    clear_cache()
    result = await db.execute(select(PatternRule))
    rows = result.scalars().all()
    for row in rows:
        _add_to_cache(row.regex_pattern, row.label, row.merchant, row.category, row.confidence)

    log.info("pattern_gen: loaded %d pattern rules from DB", len(rows))
    return len(rows)


# ── Cache lookup (sync, for use inside apply_rules) ───────────────────────────

def match_pattern_cache(text: str) -> Optional[CachedPattern]:
    """
    Check in-memory cache against combined email text.
    Returns first match or None.
    """
    lower = text.lower()
    for cp in _pattern_cache:
        if cp.regex.search(lower):
            return cp
    return None
