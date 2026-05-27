# Money Flow ←→ Inbox Data Pipeline Audit

## Bug 1: "Other" Category Click → Empty Inbox (PROVEN)

### Root Cause
Two mismatches between Money Flow's grouped display and Inbox's filter:

**Mismatch A — NULL/uncategorized transactions**:
- Backend `stats/category-breakdown` replaces `NULL` category with `"Uncategorized"` (`stats.py:259`)
- Frontend `_normCat("Uncategorized")` → `"other"` (`data.jsx:80-81`)
- Money Flow shows these as "Other" with their amounts included
- **But** clicking "Other" sends `?category=other` to inbox API
- Backend `filter_aliases("other")` returns only `{"cash", "other"}` (`category_service.py:209`)
- SQL becomes `LOWER(category) IN ('cash', 'other')` — **NULL is not in this set**
- → Zero results in inbox

**Mismatch B — Truncated small categories**:
- After the top 6 categories, the rest are grouped into a synthetic `"Other"` bucket (`stats.py:267-278`)
- These real DB values (e.g. `"stationery"`, `"gifts"`, `"misc"`) get normalized to `"other"` in display
- But `filter_aliases("other")` doesn't include them — only `{"cash", "other"}`
- → Those transactions are invisible when filtering by "Other"

### Fix Scope
- `app/services/category_service.py`: `filter_aliases("other")` must also match `NULL` and any category value not in any known alias set
- `app/api/transactions.py` line 242-245: category filter logic
- `app/api/stats.py` line 237-240: category filter in category-breakdown endpoint  
- `app/api/stats.py` line 105-108: category filter in summary endpoint

---

## Bug 2: CC Payments Click → Black Screen Crash (UNCONFIRMED ROOT CAUSE)

### What Should Happen
Clicking CC Payments → `handleCategoryClick("card")` → `setDrillCategory("card")` → opens drill modal showing CC payment transactions → "View all in inbox" navigates to inbox with `?category=card`

### Code Path Verified
- `CategoryService.display("card")` returns correct `{label:"CC Payment",...}` from `CATEGORIES["card"]` (`data.jsx:15`)
- `filter_aliases("card")` returns 6 aliases (`cc payment`, `cc`, `credit card`, etc.) all valid
- API `GET /api/transactions?category=card&date_from=...` should work

**Possible cause**: The modal tries to look up `catBreakdown?.categories?.find(c => normCat(c.category, false) === "card")` but the category-breakdown endpoint explicitly excludes `transaction_type != "purchase"` transactions. If the user has exactly 0 purchase-type transactions with cc-related categories, `c` is `undefined`. `c ? fmtK(c.amount) : ""` handles this — returns empty string. **Not the crash source.**

**Need more info from user**: Does the crash happen immediately on click, or after clicking "View all in inbox"?

---

## Bug 3: Data Consistency Audit (ALL CHANNELS VERIFIED)

### Income Pipeline ✅
| Step | Location |
|------|----------|
| Backend sums income with `effective_month` logic | `stats.py:121-139` |
| Frontend uses `summary.total_income` directly | `data.jsx:161-163` |
| Inbox shows individual `amount > 0` transactions | `transformTransaction` at `data.jsx:104` |
| **Verdict**: Same source → consistent | |

### CC Payments Pipeline ✅ (with caveat)
| Step | Location |
|------|----------|
| Backend sums `transaction_type == "cc_payment"` only | `stats.py:141-157` |
| Frontend injects into `catMap["card"]` | `data.jsx:192-195` |
| Category-breakdown excludes `transaction_type == "cc_payment"` | `stats.py:231` |
| Inbox filter uses `LOWER(category) IN (...card aliases...)` regardless of transaction_type | `transactions.py:244-245` |
| **Verdict**: Summary total = sum of `cc_payment` type. Inbox filter = sum of all transactions with "card" aliases regardless of type. **Could differ slightly** if some transactions are categorized as "card" but not CC payment type. Unlikely in practice but not guaranteed equal. | |

### Regular Expense Categories ✅
| Step | Location |
|------|----------|
| Backend groups by `Transaction.category` for `label=="expense"`, `transaction_type IN ("purchase", NULL)` | `stats.py:242-254` |
| Frontend normalizes via `_normCat()` | `data.jsx:168-173` |
| Inbox filter uses same `_normCat()` via `transformTransaction` | `data.jsx:101` |
| Backend `filter_aliases()` in transactions.py matches the reverse mapping | `transactions.py:244-245` |
| **Verdict**: Consistent — same alias map on both sides (`_CAT_ALIAS` in JS, `_CANONICAL_MAP` in Python) | |

### "Other" Bucket Data Integrity ❌ (THIS IS BUG 1)
- Money Flow "Other" includes: `NULL` categories + unknown categories + 7th+ categories
- `filter_aliases("other")` only matches `{"cash", "other"}` — not NULL, not unknown categories
- **Data shown in Money Flow cannot be verified in Inbox** — they're different queries

---

## Recommended Fixes (Ordered by Impact)

### P0: Fix `filter_aliases("other")` to be a true catch-all

In `app/services/category_service.py`:
- `filter_aliases("other")` should return a special sentinel or the SQL should add `OR category IS NULL OR LOWER(category) NOT IN (all_known_aliases)`
- Alternative: add `__catch_all__` concept to the reverse map

This affects:
- `transactions.py:242-245` (inbox list)
- `stats.py:237-240` (category-breakdown query)
- `stats.py:105-108` (summary query)

### P1: Fix CC Payments click behavior
- If CC Payments + Investments commitments should NOT be clickable (they're synthetic summary rows, not categories), remove the onClick
- OR if they should navigate to inbox, ensure `handleCategoryClick("card")` navigates directly rather than opening a drill modal (since "card" isn't a real breakdown category)

### P2: Document the `transaction_type` caveat for CC payments
- The summary endpoint uses `transaction_type == "cc_payment"` while the inbox filter uses `category` aliases
- Not a practical concern given classifier behavior, but technically could diverge
