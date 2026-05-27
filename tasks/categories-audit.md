# Category System Audit Report

## TL;DR — Two Bugs Found

### Bug 1: Category filter returns empty for most categories
The frontend sends **canonical keys** (`"food"`, `"card"`, `"sub"`) but the backend stores **raw display names** (`"Food & Dining"`, `"CC Payment"`, `"Subscriptions"`). The filter does `Transaction.category == "food"` which never matches `"Food & Dining"`.

### Bug 2: Duplicate custom categories allowed
Case-insensitive duplicates like "CC payment" vs "CC Payment" pass through because the DB `UniqueConstraint` is case-sensitive, the CREATE endpoint has no case-insensitive check, and the frontend dedup only checks canonical keys.

---

## Detailed Analysis

### Data Flow: How Categories Get Stored

| Source | Writes to `Transaction.category` | Example value |
|--------|------|--------|
| LLM classifier (`classifier.py:295`) | Raw LLM output | `"Food & Dining"` |
| Rules engine (`classifier.py:363`, `rules.py:21-49`) | Domain/merchant map value | `"Food"`, `"Shopping"`, `"CC Payment"` |
| CategoryPicker/inline edit (`inbox.jsx:1498` → `transactions.py:534`) | Canonical key (built-in) or lowercased name (custom) | `"food"`, `"cc_payment"` |
| Bulk actions (`transactions.py:149,208`) | Value from payload | varies |
| Review accept (`review.py:133,253`) | From classification result | same as LLM/rules |

### Data Flow: How Category Filter Works

```
[CategoryPicker] → item.key = canonical key e.g. "food"
[app.jsx:302]    → setCategoryFilter("food")
[app.jsx:67]     → params.append("category", "food")
[API call]       → GET /api/transactions?category=food
[backend:243]    → Transaction.category == "food"
[DB]             → "Food & Dining" != "food" → NO MATCH → empty
```

### All Affected Backend Filter Locations

| File | Line | SQL | Views affected |
|------|------|-----|----------------|
| `app/api/transactions.py` | 243 | `Transaction.category == category` | Inbox list |
| `app/api/stats.py` | 106 | `Transaction.category == category` | Dashboard stats |
| `app/api/stats.py` | 236 | `Transaction.category == category` | Flow view stats, Category breakdown |

### All Frontend Filter Pass-Through Locations

| File | Line | What it does | Correct? |
|------|------|--------------|----------|
| `app.jsx:67` | Sends `category=categoryFilter` to API | ❌ sends canonical key |
| `app.jsx:90` | Sends `category=categoryFilter` to API (loadMore) | ❌ sends canonical key |
| `dashboard.jsx:52` | Sends `category=categoryFilter` to stats API | ❌ sends canonical key |
| `dashboard.jsx:78-79` | Client-side filter: `t.cat === categoryFilter` | ✅ uses normalized value |
| `flow.jsx:295` | Sends `category=categoryFilter` to stats API | ❌ sends canonical key |
| `flow.jsx:310-311` | Client-side filter: `t.cat === categoryFilter` | ✅ uses normalized value |

### Duplicate Category Issue

**Routes of entry for duplicates:**

| Point | Has case-insensitive check? | Details |
|-------|---------------------------|---------|
| `POST /api/account/categories` (`settings.py:225-249`) | ❌ No | Only catches exact name match via DB `IntegrityError` |
| `POST /api/account/categories/generate` (`settings.py:340-361`) | ✅ Yes | Uses `name.lower() in existing` set |
| `PATCH /api/account/categories/{id}` (`settings.py:370-390`) | ❌ No | Same IntegrityError path |
| DB `UniqueConstraint("user_id", "name")` | ❌ Case-sensitive | SQLite/PostgreSQL default collation is case-sensitive |
| Frontend `_iter()` dedup (`data.jsx:424-428`) | ⚠️ Partial | Checks `lowercased name in canonical_keys` not `lowercased name in existing user cat names` |

**Example:** User creates "CC payment" (lowercase 'p') when "CC Payment" is already seeded:
1. "CC payment" != "CC Payment" → UNIQUE constraint passes
2. `"cc payment"` NOT in `{card, food, ...}` canonical key set → frontend shows it as separate
3. Result: two entries for essentially the same category

---

## Recommended Fix

### Fix 1: Normalize the filter query (backwards-compatible)

Add a reverse alias index to `category_service.py` and use it in all filter queries:

**`app/services/category_service.py`** — Add reverse map:
```python
_CANONICAL_REVERSE: dict[str, set[str]] = {}
for alias, canonical in _CANONICAL_MAP.items():
    _CANONICAL_REVERSE.setdefault(canonical, set()).add(alias)
```

**`app/services/category_service.py`** — Add resolver method:
```python
@staticmethod
def filter_aliases(canonical_key: str) -> set[str]:
    """Return all DB values that map to this canonical key."""
    return _CANONICAL_REVERSE.get(canonical_key, {canonical_key})
```

**`app/api/transactions.py:242-243`** — Use alias resolution:
```python
if category:
    aliases = CategoryService.filter_aliases(category)
    conditions.append(Transaction.category.in_(aliases))
```

**`app/api/stats.py:105-106, 235-236`** — Same fix:
```python
if category:
    aliases = CategoryService.filter_aliases(category)
    expense_where.append(Transaction.category.in_(aliases))
```

### Fix 2: Case-insensitive dedup on create

**`app/api/settings.py`** — CREATE endpoint (line ~231):
```python
existing = await db.execute(
    select(UserCategory).where(
        UserCategory.user_id == user.id,
        func.lower(UserCategory.name) == body.name.strip().lower(),
    )
)
if existing.scalar_one_or_none():
    raise HTTPException(status_code=409, detail="Category already exists")
```

Same for PATCH endpoint (line ~370).

### Fix 3: Normalize on write (preventive)

**`app/classifier/classifier.py`** — After getting category from LLM (line 295) and rules (line 363):
```python
from app.services.category_service import CategoryService
category = CategoryService.resolve(llm_result.category)  # or rule_result.category
```

This ensures `Transaction.category` always stores canonical keys, making the filter alias map eventually unnecessary.
