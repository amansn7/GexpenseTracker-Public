# Email Pre-Filter System — Design Spec

**Date:** 2026-05-11  
**Status:** Approved  
**Scope:** Always-on transaction email pre-filter with review queue and adaptive feedback loop

---

## Problem

All fetched emails currently get stored and run through the classification pipeline. Gmail has no native "financial" filter label. The system needs to decide — before storage — whether an email is a transaction notification. Non-transaction emails waste DB space and LLM classification cost.

---

## Goals

1. Only store emails the system is confident are transaction notifications (or needs human review to decide)
2. Non-passing emails go to a review queue — not silently discarded
3. User keep/discard decisions feed back into the filter immediately
4. Periodic LLM refinement improves rules over time from accumulated feedback

---

## Data Model

### `Email` table — new column

```sql
pre_filter_status  VARCHAR  DEFAULT 'passed'
-- values: 'passed' | 'review_pending' | 'discarded'
```

Existing emails default to `'passed'` (backward compatible).

### New `FilterRule` table

```sql
id          UUID        PRIMARY KEY
rule_type   VARCHAR     -- 'allowlist_domain' | 'blocklist_domain' | 'keyword_pattern'
value       VARCHAR     -- domain string or regex pattern
source      VARCHAR     -- 'system' | 'user' | 'llm'
hit_count   INTEGER     DEFAULT 0
created_at  DATETIME
```

Seed data: existing `_FINANCIAL_DOMAINS` → `allowlist_domain, source=system`. Existing `_FINANCIAL_RE` patterns → `keyword_pattern, source=system`. Loaded at migration time.

---

## Pre-Filter Engine (`app/classifier/pre_filter.py`)

New module. Returns `PreFilterResult(decision: str, confidence: float, tier: int)`.

Decision values: `"pass"` | `"review"`.

### Tier 1 — Domain check (zero cost)

`FilterRule` rows loaded once per sync into a `PreFilterEngine` instance (cached, not queried per-email).

- Sender domain in allowlist → `pass, confidence=1.0, tier=1`
- Sender domain in blocklist → `review, confidence=0.0, tier=1`

### Tier 2 — Weighted regex scoring

Signals evaluated against `subject + body_snippet`:

| Signal | Weight |
|---|---|
| Amount pattern (`Rs. X,XXX` / `INR \d`) | 0.40 |
| Transaction verb (debit/credit/charged/spent/received/deposited/withdrawn) | 0.30 |
| Payment network keyword (UPI/NEFT/IMPS/RTGS/NACH) | 0.20 |
| `keyword_pattern` FilterRule match (user/LLM-learned) | 0.10 |

- Score ≥ 0.60 → `pass, tier=2`
- Score ≤ 0.25 → `review, tier=2`
- 0.25 < score < 0.60 → Tier 3

### Tier 3 — LLM binary call (ambiguous band only)

Input: sender, subject, first 200 chars of snippet.  
Prompt: single binary question — "Is this a transaction notification email? Answer yes or no."  
Uses user's active AI service (`UserSettings.active_ai_service_id`).  
If no LLM configured → falls back to `review`.

Result: `pass` or `review`, `tier=3`.

---

## Sync Pipeline Integration (`app/sync.py`)

Replaces the current `is_likely_financial()` guard. Runs on every incoming email after dedup:

```
result = await pre_filter.evaluate(subject, snippet, sender_domain, session)

if result.decision == "pass":
    store Email(pre_filter_status="passed")
    run classify_email() → create Transaction  [existing flow]

if result.decision == "review":
    store Email(pre_filter_status="review_pending")
    NO Transaction created
    increment FilterRule.hit_count for the rule that fired
```

**Cache:** `FilterRule` rows loaded once at start of each sync run. Invalidated after any keep/discard user action.

**Gmail query scope:** `email_filter` SyncState setting (`all`/`unread`/`read`) still controls what Gmail returns. Pre-filter runs on top — orthogonal.

**Sync progress tally:** adds `"review": N` bucket alongside existing `expense/income/ignore`.

---

## Review API + Feedback Loop

### Endpoints

```
GET  /api/emails?status=review_pending
     Returns emails with pre_filter_status = review_pending (existing list endpoint, new filter param)

POST /api/emails/{id}/review
     Body: { "action": "keep" | "discard" }
```

### Keep action

1. Run `classify_email()` on the email → create `Transaction`
2. Set `email.pre_filter_status = "passed"`
3. Upsert `FilterRule(rule_type="allowlist_domain", value=sender_domain, source="user")`
4. Increment `hit_count` if rule exists
5. Invalidate pre-filter cache

### Discard action

1. Set `email.pre_filter_status = "discarded"`
2. Upsert `FilterRule(rule_type="blocklist_domain", value=sender_domain, source="user")`
3. Invalidate pre-filter cache

### LLM rule refinement

```
POST /api/filter/refine
```

1. Pull last N keep/discard decisions (subject, sender_domain, action) from DB
2. Send to LLM: given these labeled examples, suggest new keyword patterns + domain rules
3. Parse response → upsert `FilterRule` rows with `source="llm"`
4. Return diff of added/updated rules to frontend

Manual trigger for now. Can be scheduled later.

---

## Frontend

Changes to existing inbox only — no new pages:

**Email rows with `pre_filter_status = review_pending`:**
- Amber "Needs Review" badge
- Two inline action buttons: **Keep** | **Discard**
- Keep → classify + moves to normal state
- Discard → disappears from inbox

**Filter tabs:** Add "Review Queue" tab (alongside All / Expense / Income / Ignore) — shows only `review_pending` emails.

**Sync result panel:** Add "Filtered (needs review): N" to existing sync summary counts.

**Settings page:** Add "Refine Filter Rules" button → calls `POST /api/filter/refine` → shows diff of new/updated rules.

---

## Files Affected

| File | Change |
|---|---|
| `app/models.py` | Add `Email.pre_filter_status`, add `FilterRule` model |
| `alembic/versions/` | Migration for new column + table |
| `app/classifier/pre_filter.py` | New — `PreFilterEngine`, `PreFilterResult` |
| `app/sync.py` | Replace `is_likely_financial()` guard with pre-filter call |
| `app/api/emails.py` | Add `POST /api/emails/{id}/review`, `status` filter param |
| `app/api/filter.py` | New — `POST /api/filter/refine` |
| `app/gmail/client.py` | Remove `is_likely_financial()` (moved to pre_filter.py) |
| Frontend inbox | Review badge + Keep/Discard buttons + Review Queue tab |
| Frontend settings | Refine Filter Rules button |

---

## Out of Scope

- Scheduled auto-refinement (manual trigger only for now)
- Bulk review UI (one email at a time)
- Confidence score display to user
