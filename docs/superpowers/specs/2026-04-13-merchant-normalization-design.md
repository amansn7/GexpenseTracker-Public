# SP4: Advanced Merchant Normalization

## Goal

Replace the flat `MERCHANT_MAP` dict lookup in `rules.py` with a dedicated normalization module that combines regex cleaning, fuzzy matching (rapidfuzz), and a hybrid alias store (hardcoded seeds + DB-persisted learned aliases). All merchant detection across the classifier goes through a single interface: `normalize_merchant(raw) → (canonical, confidence)`.

## Architecture

```
app/classifier/merchant.py          ← NEW: single source of truth
app/models.py                       ← ADD: MerchantAlias model
alembic/versions/0008_merchant_alias.py  ← NEW migration
app/classifier/rules.py             ← MODIFY: detect_merchant() delegates to merchant.py
app/main.py                         ← MODIFY: load alias cache at startup
tests/test_merchant.py              ← NEW: unit tests
```

Startup flow (same pattern as `pattern_gen.py`):

```
lifespan() → load_alias_cache_from_db(db) → populates _alias_cache dict
```

Runtime flow per email:

```
raw string
    │
    ▼  Stage 1: regex clean
stripped = lowercase → strip www/http prefix → strip city/legal/UPI/card-network suffixes → collapse whitespace
    │
    ▼  Stage 2: exact alias lookup (O(1))
_alias_cache.get(stripped) or MERCHANT_ALIASES.get(stripped) → (canonical, 1.0) if hit
    │
    ▼  Stage 3: fuzzy match (rapidfuzz WRatio vs KNOWN_MERCHANTS)
score ≥ 85 → (candidate, score/100), trigger learn_alias() side-effect
score ≥ 70 → (candidate, score/100), no persistence (uncertain)
score < 70 → (stripped, 0.5)
    │
    ▼
normalize_merchant(raw) → (canonical: str, confidence: float)
```

## New File: `app/classifier/merchant.py`

### Constants

```python
# Hardcoded seed aliases (raw fragment → canonical).
# Longest-key-first iteration ensures "swiggy instamart" matches before "swiggy".
MERCHANT_ALIASES: dict[str, str] = {
    "amzn mktp": "amazon",
    "amzn":      "amazon",
    "swgy":      "swiggy",
    "swiggy instamart": "swiggy instamart",
    "gpay":      "google pay",
    "phonepe merchant": "phonepe",
    "paytm mall": "paytm",
    "uber trip": "uber",
    "uber eats": "uber eats",
    "ola money": "ola",
    "namma yatri": "namma yatri",
}

# Canonical merchant names used as the fuzzy match target list.
# Sourced from keys of MERCHANT_MAP in rules.py — no separate list to maintain.
KNOWN_MERCHANTS: list[str] = [...]  # populated at module load from rules.MERCHANT_MAP

FUZZY_ACCEPT  = 85   # score >= 85 → accept + persist alias
FUZZY_TENTATIVE = 70 # score >= 70 → accept, do not persist
```

### Regex cleaning

```python
_STRIP_PREFIXES = ["www.", "www ", "http ", "https "]
_STRIP_SUFFIXES = [
    " in", " india", " limited", " ltd", " pvt",
    " blr", " bangalore", " mumbai", " delhi",
    " chennai", " hyderabad", " pune",
]
_CARD_NOISE = re.compile(r"\b(visa|mastercard|rupay)\b", re.I)

def _regex_clean(raw: str) -> str:
    text = raw.lower().strip()
    for p in _STRIP_PREFIXES:
        if text.startswith(p):
            text = text[len(p):]
    if "@" in text:
        text = text.split("@")[0]
    text = _CARD_NOISE.sub("", text)
    for s in _STRIP_SUFFIXES:
        if text.endswith(s):
            text = text[: -len(s)]
    return re.sub(r"\s+", " ", text).strip()
```

### Core function

```python
def normalize_merchant(raw: str) -> tuple[str, float]:
    """
    Return (canonical_name, confidence).
    confidence=1.0 for exact alias hits, score/100 for fuzzy, 0.5 for unknown.
    Pure function — no I/O. learn_alias() is called as a side-effect only inside
    this function when score >= FUZZY_ACCEPT.
    """
    if not raw:
        return ("", 0.0)

    cleaned = _regex_clean(raw)

    # Stage 2: exact alias lookup (longest key first)
    for key in sorted(MERCHANT_ALIASES, key=len, reverse=True):
        if key in cleaned:
            return (MERCHANT_ALIASES[key], 1.0)
    if cleaned in _alias_cache:
        return (_alias_cache[cleaned], 1.0)

    # Stage 3: fuzzy
    from rapidfuzz import process, fuzz
    result = process.extractOne(cleaned, KNOWN_MERCHANTS, scorer=fuzz.WRatio)
    if result:
        candidate, score, _ = result
        if score >= FUZZY_ACCEPT and cleaned != candidate:
            # Schedule async persist — caller must flush DB session
            _pending_aliases[cleaned] = candidate
        if score >= FUZZY_TENTATIVE:
            return (candidate, round(score / 100, 2))

    return (cleaned, 0.5)
```

### Alias learning

```python
# Module-level pending queue — flushed by learn_pending_aliases() in emails.py
_pending_aliases: dict[str, str] = {}

async def learn_pending_aliases(db) -> list[str]:
    """
    Persist all queued fuzzy-learned aliases to DB. Call after classify+persist
    inside the existing db session. Returns list of saved raw strings.
    """
    from sqlalchemy import select
    from app.models import MerchantAlias

    saved = []
    for raw, canonical in list(_pending_aliases.items()):
        existing = (await db.execute(
            select(MerchantAlias).where(MerchantAlias.raw == raw)
        )).scalar_one_or_none()
        if existing:
            existing.hit_count += 1
        else:
            db.add(MerchantAlias(raw=raw, canonical=canonical,
                                 source="fuzzy_learned", hit_count=1))
            _alias_cache[raw] = canonical  # update runtime cache immediately
            saved.append(raw)
        _pending_aliases.pop(raw, None)
    return saved


async def load_alias_cache_from_db(db) -> int:
    """Load all MerchantAlias rows into _alias_cache. Call at startup."""
    from sqlalchemy import select
    from app.models import MerchantAlias

    _alias_cache.clear()
    rows = (await db.execute(select(MerchantAlias))).scalars().all()
    for row in rows:
        _alias_cache[row.raw] = row.canonical
    log.info("merchant: loaded %d aliases from DB", len(rows))
    return len(rows)
```

## Modified: `app/classifier/rules.py`

`detect_merchant()` currently does a plain `name in text.lower()` loop. Replace:

```python
# Before
def detect_merchant(text: str) -> tuple[str | None, str | None]:
    tl = text.lower()
    for name, category in MERCHANT_MAP.items():
        if name in tl:
            return name.title(), category
    return None, None

# After
def detect_merchant(text: str) -> tuple[str | None, str | None, float]:
    """Returns (merchant_display, category, confidence)."""
    from app.classifier.merchant import normalize_merchant
    # Extract candidate raw merchant string from text first
    raw = _extract_raw_merchant(text)  # existing UPI + "towards/to/at" patterns
    if not raw:
        return None, None, 0.0
    canonical, conf = normalize_merchant(raw)
    category = MERCHANT_MAP.get(canonical)
    if category and conf >= 0.70:
        return canonical.title(), category, conf
    return None, None, 0.0
```

`RuleResult.confidence` for merchant layer becomes `0.92 × merchant_conf` instead of flat 0.92.

`apply_rules()` signature is unchanged — backward compatible.

## New Model: `app/models.py`

```python
class MerchantAlias(Base):
    __tablename__ = "merchant_aliases"

    id: Mapped[str] = _uuid_col()
    raw: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    canonical: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(20), default="fuzzy_learned")  # seed | fuzzy_learned | user
    hit_count: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
```

## Migration: `alembic/versions/0008_merchant_alias.py`

```python
revision = '0008'
down_revision = '0007'

def upgrade():
    op.create_table('merchant_aliases',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('raw', sa.String(255), nullable=False, unique=True),
        sa.Column('canonical', sa.String(255), nullable=False),
        sa.Column('confidence', sa.Float(), server_default='1.0'),
        sa.Column('source', sa.String(20), server_default='fuzzy_learned'),
        sa.Column('hit_count', sa.Integer(), server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table('merchant_aliases')
```

## Modified: `app/main.py`

Add to lifespan after pattern cache load:

```python
from app.classifier.merchant import load_alias_cache_from_db as load_merchant_cache
async with AsyncSessionLocal() as db:
    await load_merchant_cache(db)
```

## Modified: `app/api/emails.py`

After the pattern rule save block, flush pending fuzzy aliases:

```python
from app.classifier.merchant import learn_pending_aliases
await learn_pending_aliases(db)
```

## Dependency

Add to `requirements.txt`:

```
rapidfuzz>=3.6.0
```

## Testing: `tests/test_merchant.py`

```python
from app.classifier.merchant import normalize_merchant

def test_www_prefix():
    assert normalize_merchant("WWW SWIGGY IN")[0] == "swiggy"

def test_city_suffix():
    assert normalize_merchant("SWIGGY LIMITED BLR")[0] == "swiggy"

def test_upi_handle():
    assert normalize_merchant("swiggy@ybl")[0] == "swiggy"

def test_amazon_alias():
    assert normalize_merchant("AMZN MKTP IN")[0] == "amazon"

def test_instamart_not_collapsed():
    name, conf = normalize_merchant("SWIGGY INSTAMART")
    assert name == "swiggy instamart"

def test_uber_trip():
    assert normalize_merchant("UBER TRIP BLR")[0] == "uber"

def test_unknown_returns_cleaned():
    name, conf = normalize_merchant("TOTALLY UNKNOWN VENDOR")
    assert conf == 0.5
    assert name == "totally unknown vendor"

def test_confidence_exact():
    _, conf = normalize_merchant("swiggy@ybl")
    assert conf == 1.0
```

## What This Does NOT Include

- UI for manual alias management (view/edit learned aliases) — add later
- SMS ingestion — parser interface works for SMS but no pipeline yet
- Per-user alias overrides — single global alias store for now
- Fuzzy matching against free-form text (only against extracted raw merchant string, not full email body)
