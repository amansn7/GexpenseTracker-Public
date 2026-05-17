"""
Wave 4.1: Merchant Entity Resolution

Resolves raw merchant strings to canonical entities with parent grouping.

Pipeline:
  raw string
    → UPI handle extraction (@paytm, @ybl, @ibl, @okicici, @axl)
    → Merchant cleaning (strip suffixes, prefixes, noise)
    → Exact alias lookup (seed dict + DB cache)
    → Fuzzy match (rapidfuzz WRatio >= 85)
    → Parent entity resolution (Swiggy Instamart -> Swiggy)
    → {"canonical", "parent", "confidence", "method"}
"""
import re
import logging
from typing import Optional

log = logging.getLogger(__name__)

# ── UPI handle providers ──────────────────────────────────────────────────────

UPI_PROVIDERS = {"paytm", "ybl", "ibl", "okicici", "axl", "pts", "upi", "payzapp"}

UPI_HANDLE_RE = re.compile(r"@([a-zA-Z0-9_]+)")

# ── Suffix / prefix stripping ─────────────────────────────────────────────────

_STRIP_SUFFIXES = [
    " pvt ltd", " pvt.", " pvt", " llp", " ltd", " limited",
    " india", " indian", " in",
    " services", " technologies", " technology", " solutions",
    " systems", " enterprises", " private limited",
    " bangalore", " blr", " mumbai", " delhi",
    " chennai", " hyderabad", " pune", " noida", " gurgaon",
    " hq", " corp", " corporation", " inc",
]

_STRIP_PREFIXES = ["https ", "http ", "www.", "www ", "pay ", "paid to ", "payment to "]

_CARD_NOISE = re.compile(r"\b(visa|mastercard|rupay|amex)\b", re.IGNORECASE)
_WHITESPACE = re.compile(r"\s+")

# ── Seed parent entity map ────────────────────────────────────────────────────
# Maps known sub-brand / product names -> parent entity

PARENT_ENTITY_MAP: dict[str, str] = {
    "swiggy instamart": "Swiggy",
    "swiggy dineout": "Swiggy",
    "swiggy genie": "Swiggy",
    "amazon prime": "Amazon",
    "amazon fresh": "Amazon",
    "amazon pay": "Amazon",
    "amzn mktp": "Amazon",
    "amzn digital": "Amazon",
    "zomato gold": "Zomato",
    "zomato hyperpure": "Zomato",
    "zomato instant": "Zomato",
    "uber eats": "Uber",
    "uber trip": "Uber",
    "uber moto": "Uber",
    "uber auto": "Uber",
    "flipkart grok": "Flipkart",
    "flipkart plus": "Flipkart",
    "phonepe insurance": "PhonePe",
    "phonepe mutual fund": "PhonePe",
    "paytm money": "Paytm",
    "paytm mall": "Paytm",
    "ola money": "Ola",
    "ola cabs": "Ola",
    "bigbasket daily": "BigBasket",
    "bb daily": "BigBasket",
    "zepto cafe": "Zepto",
    "blinkit minutes": "Blinkit",
    "youtube premium": "Google",
    "youtube music": "Google",
    "google play": "Google",
    "google one": "Google",
    "google cloud": "Google",
    "prime video": "Amazon",
    "kindle unlimited": "Amazon",
    "audible": "Amazon",
    "microsoft 365": "Microsoft",
    "azure": "Microsoft",
    "xbox live": "Microsoft",
    "apple music": "Apple",
    "apple tv": "Apple",
    "icloud": "Apple",
    "app store": "Apple",
    "netflix.com": "Netflix",
    "hotstar": "Disney",
    "disney hotstar": "Disney",
    "sony liv": "Sony",
    "jiocinema": "Jio",
    "jiosaavn": "Jio",
    "jiofiber": "Jio",
    "airtel xstream": "Airtel",
    "act fibernet": "ACT",
    "act broadband": "ACT",
}

# ── Seed alias dict (longest keys first for substring matching) ───────────────

SEED_ALIASES: dict[str, str] = {
    "swiggy instamart": "Swiggy Instamart",
    "swiggy dineout": "Swiggy Dineout",
    "swiggy genie": "Swiggy Genie",
    "amazon prime": "Amazon Prime",
    "amazon fresh": "Amazon Fresh",
    "amazon pay": "Amazon Pay",
    "amzn mktp": "Amazon",
    "amzn digital": "Amazon",
    "zomato gold": "Zomato Gold",
    "uber eats": "Uber Eats",
    "uber trip": "Uber",
    "uber moto": "Uber",
    "uber auto": "Uber",
    "youtube premium": "YouTube Premium",
    "youtube music": "YouTube Music",
    "google play": "Google Play",
    "google one": "Google One",
    "prime video": "Amazon Prime Video",
    "kindle unlimited": "Amazon Kindle",
    "microsoft 365": "Microsoft 365",
    "apple music": "Apple Music",
    "apple tv": "Apple TV+",
    "icloud": "iCloud",
    "app store": "App Store",
    "big basket": "BigBasket",
    "bbdaily": "BigBasket",
    "bb daily": "BigBasket",
    "phonepe merchant": "PhonePe",
    "paytm money": "Paytm Money",
    "paytm mall": "Paytm",
    "ola money": "Ola Money",
    "ola cabs": "Ola",
    "air india": "Air India",
    "act fibernet": "ACT Fibernet",
    "act broadband": "ACT Fibernet",
    "gpay": "Google Pay",
    "amzn": "Amazon",
    "swgy": "Swiggy",
    "pizza hut": "Pizza Hut",
    "burger king": "Burger King",
    "namma metro": "Namma Metro",
    "namma yatri": "Namma Yatri",
}

# ── In-memory DB cache ────────────────────────────────────────────────────────

_db_alias_cache: dict[str, str] = {}  # alias_name (lower) -> canonical_name


def extract_upi_handle(merchant_str: str) -> Optional[str]:
    """Extract UPI handle provider from merchant string.
    
    Returns the provider ID (e.g. 'paytm', 'ybl') or None.
    """
    m = UPI_HANDLE_RE.search(merchant_str)
    if m:
        provider = m.group(1).lower()
        if provider in UPI_PROVIDERS:
            return provider
    return None


def clean_merchant(raw: str) -> str:
    """Strip prefixes, suffixes, UPI handles, and noise from merchant string.
    
    Returns lowercase cleaned string.
    """
    text = raw.lower().strip()

    for prefix in _STRIP_PREFIXES:
        if text.startswith(prefix):
            text = text[len(prefix):]

    # Strip UPI handle: take left part before @
    if "@" in text:
        text = text.split("@")[0].strip()

    text = _CARD_NOISE.sub("", text)

    # Strip suffixes (multi-pass for "pvt ltd")
    changed = True
    while changed:
        changed = False
        for suffix in _STRIP_SUFFIXES:
            if text.endswith(suffix):
                text = text[: -len(suffix)]
                changed = True

    return _WHITESPACE.sub(" ", text).strip()


async def load_db_aliases(db) -> int:
    """Load user-specific and global aliases from DB into cache.
    
    Call at startup or after alias creation.
    """
    from sqlalchemy import select
    from app.models.merchant import MerchantAlias

    _db_alias_cache.clear()
    rows = (await db.execute(select(MerchantAlias))).scalars().all()
    for row in rows:
        _db_alias_cache[row.alias_name.lower()] = row.canonical_name

    log.info("merchant_entity: loaded %d DB aliases", len(rows))
    return len(rows)


def _exact_lookup(cleaned: str) -> Optional[str]:
    """Exact match against seed dict + DB cache."""
    # Seed aliases (longest key first for substring match)
    for key in sorted(SEED_ALIASES, key=len, reverse=True):
        if key in cleaned:
            return SEED_ALIASES[key]

    # DB cache exact match
    if cleaned in _db_alias_cache:
        return _db_alias_cache[cleaned]

    # Check against MERCHANT_MAP canonical names
    try:
        from app.classifier.rules import MERCHANT_MAP
        if cleaned in MERCHANT_MAP:
            return MERCHANT_MAP[cleaned]["display"]
    except Exception as exc:
        log.warning("merchant_entity: MERCHANT_MAP lookup error: %s", exc)

    return None


def _fuzzy_lookup(cleaned: str) -> Optional[tuple[str, float]]:
    """Fuzzy match using rapidfuzz WRatio. Returns (canonical, score) or None."""
    try:
        from rapidfuzz import process, fuzz
        from app.classifier.rules import MERCHANT_MAP

        known = list(MERCHANT_MAP.keys())
        result = process.extractOne(cleaned, known, scorer=fuzz.WRatio)
        if result:
            candidate, score, _ = result
            if score >= 85 and cleaned != candidate:
                return (MERCHANT_MAP[candidate]["display"], score / 100.0)
    except ImportError:
        log.debug("merchant_entity: rapidfuzz not installed — fuzzy disabled")
    except Exception as exc:
        log.warning("merchant_entity: fuzzy error: %s", exc)

    return None


def resolve_parent(canonical: str) -> Optional[str]:
    """Resolve parent entity for a canonical name."""
    key = canonical.lower()
    return PARENT_ENTITY_MAP.get(key)


def resolve_merchant(merchant_str: str) -> dict:
    """Resolve a raw merchant string to canonical entity info.
    
    Returns:
        {"canonical": str, "parent": str|None, "confidence": float, "method": str}
    
    Methods: "exact_seed", "exact_db", "exact_map", "fuzzy", "cleaned", "empty"
    """
    if not merchant_str or not merchant_str.strip():
        return {"canonical": "", "parent": None, "confidence": 0.0, "method": "empty"}

    cleaned = clean_merchant(merchant_str)
    if not cleaned:
        return {"canonical": merchant_str.strip(), "parent": None, "confidence": 0.3, "method": "cleaned"}

    # Stage 1: exact seed lookup
    for key in sorted(SEED_ALIASES, key=len, reverse=True):
        if key in cleaned:
            canonical = SEED_ALIASES[key]
            return {
                "canonical": canonical,
                "parent": resolve_parent(canonical),
                "confidence": 1.0,
                "method": "exact_seed",
            }

    # Stage 2: exact DB cache lookup
    if cleaned in _db_alias_cache:
        canonical = _db_alias_cache[cleaned]
        return {
            "canonical": canonical,
            "parent": resolve_parent(canonical),
            "confidence": 1.0,
            "method": "exact_db",
        }

    # Stage 3: exact MERCHANT_MAP lookup
    try:
        from app.classifier.rules import MERCHANT_MAP
        if cleaned in MERCHANT_MAP:
            canonical = MERCHANT_MAP[cleaned]["display"]
            return {
                "canonical": canonical,
                "parent": resolve_parent(canonical),
                "confidence": 1.0,
                "method": "exact_map",
            }
    except Exception as exc:
        log.warning("merchant_entity: MERCHANT_MAP lookup error: %s", exc)

    # Stage 4: fuzzy match
    fuzzy = _fuzzy_lookup(cleaned)
    if fuzzy:
        canonical, score = fuzzy
        return {
            "canonical": canonical,
            "parent": resolve_parent(canonical),
            "confidence": round(score, 2),
            "method": "fuzzy",
        }

    # Fallback: return cleaned string
    return {"canonical": cleaned, "parent": None, "confidence": 0.5, "method": "cleaned"}
