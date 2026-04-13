"""
SP4: Advanced Merchant Normalization

Single source of truth for merchant name cleaning and normalization.
Used by rules.py (Layer 6) and parser.py (SP1) when that lands.

Pipeline:
  raw string
    → Stage 1: regex clean (strip prefixes/suffixes/UPI handle)
    → Stage 2: exact alias lookup (hardcoded seeds + DB-learned cache)
    → Stage 3: fuzzy match via rapidfuzz WRatio
    → (canonical_name, confidence)

Fuzzy matches above FUZZY_ACCEPT are queued in _pending_aliases and
persisted to DB by calling learn_pending_aliases(db) from the caller.
"""
import re
import logging
from typing import Optional

log = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

FUZZY_ACCEPT    = 85   # score >= 85 → accept + queue alias for persistence
FUZZY_TENTATIVE = 70   # score >= 70 → accept, do not persist

# ── Hardcoded seed aliases ────────────────────────────────────────────────────
# Longest keys checked first so "swiggy instamart" wins over "swiggy".

MERCHANT_ALIASES: dict[str, str] = {
    "swiggy instamart": "swiggy instamart",
    "paytm money":      "paytm money",
    "prime video":      "prime video",
    "youtube premium":  "youtube premium",
    "pizza hut":        "pizza hut",
    "burger king":      "burger king",
    "namma metro":      "namma metro",
    "namma yatri":      "namma yatri",
    "big basket":       "bigbasket",
    "amzn mktp":        "amazon",
    "phonepe merchant": "phonepe",
    "ola money":        "ola",
    "paytm mall":       "paytm",
    "uber eats":        "uber eats",
    "uber trip":        "uber",
    "air india":        "air india",
    "act fibernet":     "act fibernet",
    "act broadband":    "act fibernet",
    "gpay":             "google pay",
    "amzn":             "amazon",
    "swgy":             "swiggy",
    "bbdaily":          "bigbasket",
}

# ── In-memory caches ──────────────────────────────────────────────────────────

_alias_cache: dict[str, str] = {}          # DB-learned: raw → canonical
_pending_aliases: dict[str, str] = {}      # queued for DB persist this request

# ── Regex cleaning ────────────────────────────────────────────────────────────

_STRIP_PREFIXES = ["https ", "http ", "www.", "www "]

_STRIP_SUFFIXES = [
    " limited", " ltd", " pvt", " india", " in",
    " bangalore", " blr", " mumbai", " delhi",
    " chennai", " hyderabad", " pune",
]

_CARD_NOISE = re.compile(r"\b(visa|mastercard|rupay)\b", re.IGNORECASE)
_WHITESPACE  = re.compile(r"\s+")

_RAW_MERCHANT_PATTERNS = [
    re.compile(r"towards\s+([A-Za-z0-9 ._\-]{2,40})", re.IGNORECASE),    # HDFC "towards WWW SWIGGY IN"
    re.compile(r"to\s+([A-Za-z0-9 ._\-]{2,30})(?:\s+on|\s+via|\s+ref|\s*$)", re.IGNORECASE),
    re.compile(r"at\s+([A-Za-z0-9 ._\-]{2,30})", re.IGNORECASE),
    re.compile(r"([\w.\-]+)@[\w]+", re.IGNORECASE),                       # UPI handle
]


def _regex_clean(raw: str) -> str:
    """Strip noise from a raw merchant string and return lowercase clean form."""
    text = raw.lower().strip()

    for prefix in _STRIP_PREFIXES:
        if text.startswith(prefix):
            text = text[len(prefix):]

    # UPI handle — take left of @
    if "@" in text:
        text = text.split("@")[0]

    text = _CARD_NOISE.sub("", text)

    # Strip suffixes (may need multiple passes for "pvt ltd")
    changed = True
    while changed:
        changed = False
        for suffix in _STRIP_SUFFIXES:
            if text.endswith(suffix):
                text = text[: -len(suffix)]
                changed = True

    return _WHITESPACE.sub(" ", text).strip()


def extract_raw_merchant(text: str) -> Optional[str]:
    """
    Extract a raw merchant candidate string from email/SMS body text.
    Tries structured patterns first (towards / to / at / UPI handle).
    Returns None if no candidate found.
    """
    for pattern in _RAW_MERCHANT_PATTERNS:
        m = pattern.search(text)
        if m:
            candidate = m.group(1).strip()
            # Skip if candidate looks like noise (all digits, too short)
            if len(candidate) >= 2 and not candidate.isdigit():
                return candidate
    return None


# ── Core normalization ────────────────────────────────────────────────────────

def normalize_merchant(raw: str) -> tuple[str, float]:
    """
    Return (canonical_name, confidence).

    confidence=1.0  — exact alias hit (hardcoded seed or DB-learned)
    confidence≥0.70 — fuzzy match accepted
    confidence=0.5  — no match found, returns regex-cleaned string
    confidence=0.0  — empty input
    """
    if not raw or not raw.strip():
        return ("", 0.0)

    cleaned = _regex_clean(raw)
    if not cleaned:
        return ("", 0.0)

    # Stage 2a: hardcoded seeds (longest key first)
    for key in sorted(MERCHANT_ALIASES, key=len, reverse=True):
        if key in cleaned:
            return (MERCHANT_ALIASES[key], 1.0)

    # Stage 2b: DB-learned alias cache (exact match on cleaned)
    if cleaned in _alias_cache:
        return (_alias_cache[cleaned], 1.0)

    # Stage 3: fuzzy match
    try:
        from rapidfuzz import process, fuzz
        from app.classifier.rules import MERCHANT_MAP

        known = list(MERCHANT_MAP.keys())
        result = process.extractOne(cleaned, known, scorer=fuzz.WRatio)
        if result:
            candidate, score, _ = result
            if score >= FUZZY_ACCEPT and cleaned != candidate:
                _pending_aliases[cleaned] = candidate
                log.debug("merchant: fuzzy alias queued %r → %r (score=%d)", cleaned, candidate, score)
            if score >= FUZZY_TENTATIVE:
                return (candidate, round(score / 100, 2))
    except ImportError:
        log.warning("merchant: rapidfuzz not installed — fuzzy matching disabled")
    except Exception as exc:
        log.warning("merchant: fuzzy error: %s", exc)

    return (cleaned, 0.5)


# ── Alias persistence (async) ─────────────────────────────────────────────────

async def learn_pending_aliases(db) -> list[str]:
    """
    Persist all queued fuzzy-learned aliases to DB and update runtime cache.
    Call inside an active AsyncSession after classify+persist.
    Returns list of newly saved raw strings.
    """
    if not _pending_aliases:
        return []

    from sqlalchemy import select
    from app.models import MerchantAlias

    saved: list[str] = []
    for raw, canonical in list(_pending_aliases.items()):
        try:
            existing = (await db.execute(
                select(MerchantAlias).where(MerchantAlias.raw == raw)
            )).scalar_one_or_none()

            if existing:
                existing.hit_count += 1
            else:
                db.add(MerchantAlias(
                    raw=raw,
                    canonical=canonical,
                    source="fuzzy_learned",
                    hit_count=1,
                ))
                _alias_cache[raw] = canonical
                saved.append(raw)
        except Exception as exc:
            log.warning("merchant: alias persist error for %r: %s", raw, exc)
        finally:
            _pending_aliases.pop(raw, None)

    if saved:
        log.info("merchant: persisted %d new aliases: %s", len(saved), saved)
    return saved


async def load_alias_cache_from_db(db) -> int:
    """
    Load all MerchantAlias rows into _alias_cache.
    Call once at application startup inside lifespan().
    """
    from sqlalchemy import select
    from app.models import MerchantAlias

    _alias_cache.clear()
    rows = (await db.execute(select(MerchantAlias))).scalars().all()
    for row in rows:
        _alias_cache[row.raw] = row.canonical

    log.info("merchant: loaded %d aliases from DB", len(rows))
    return len(rows)
