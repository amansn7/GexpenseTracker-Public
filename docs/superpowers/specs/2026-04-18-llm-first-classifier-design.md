# LLM-First Classification Pipeline — Design Spec
**Date:** 2026-04-18
**Status:** Approved

---

## Problem

The existing classification pipeline has three layers — rule engine, ML feature classifier, and LLM fallback — but the rule engine and ML have never produced reliable results. In practice, 99.9% of emails reach the LLM anyway. The orchestration layer (signal selection, confidence thresholds, pipeline traces) adds complexity with no benefit and introduces bugs (uncertain emails silently skip LLM).

The LLM classification itself works correctly. The goal is to make it the single, authoritative path and capture structured output to enable a future rule engine built from real data.

---

## Architecture

The new pipeline is a straight line with no branching:

```
Email (sender, subject, body_text)
        ↓
  MultiLLMClient.classify()
        ↓
  Parse + normalize merchant
        ↓
  Write → classification_log
        ↓
  Return ClassificationResult
```

No signal selection. No confidence-based routing. No rule/ML fallback. One path in, one path out.

---

## Files

### Deleted
- `app/classifier/rules.py`
- `app/classifier/feature_classifier.py`
- `app/classifier/merchant_intelligence.py`
- `app/classifier/learning.py`
- `app/classifier/pattern_gen.py`
- `app/classifier/text_utils.py`

### Kept unchanged
- `app/classifier/llm_client.py` — multi-provider LLM client with rate-limit fallback
- `app/classifier/merchant.py` — merchant name normalization applied post-LLM

### Rewritten
- `app/classifier/classifier.py` — ~70 lines, single responsibility

### New
- `alembic/versions/0009_classification_log.py` — migration adding `classification_log` table

---

## `classification_log` Table Schema

One row per LLM call. Captures full input/output for future rule engine training.

| Column | Type | Notes |
|--------|------|-------|
| `id` | integer PK | — |
| `email_id` | integer FK → emails | nullable (manual reclassify has no email) |
| `sender_domain` | varchar | primary future rule-mining key |
| `subject` | text | input signal |
| `body_snippet` | text | truncated body sent to LLM (≤3000 chars) |
| `provider` | varchar | google / grok / scaleway / openrouter / none |
| `model` | varchar | exact model string used |
| `latency_ms` | integer | LLM call duration |
| `llm_label` | varchar | raw LLM output: expense / income / ignore |
| `llm_amount` | numeric | raw LLM output |
| `llm_merchant` | varchar | raw LLM output before normalization |
| `llm_category` | varchar | raw LLM output |
| `llm_confidence` | float | raw LLM output |
| `llm_txn_date` | date | raw LLM output |
| `raw_response` | text | full JSON string returned by LLM |
| `created_at` | timestamp with tz | — |

User corrections are not stored here. They are captured in `transactions.status = corrected` and can be joined to `classification_log` via `email_id` when the future rule engine is built.

---

## New `classifier.py` Logic

```
classify_email(email_id, sender, sender_domain, subject, body_text)
    │
    ├─ start timer
    ├─ call llm_client.classify(sender, subject, body_text[:3000])
    │
    ├─ SUCCESS:
    │   ├─ normalize merchant (merchant.py)
    │   ├─ write classification_log row
    │   └─ return ClassificationResult
    │       - status = auto    if confidence >= AUTO_CONFIRM_THRESHOLD
    │       - status = needs_review  otherwise
    │
    └─ FAILURE (all providers exhausted):
        ├─ write classification_log row (provider="none", raw_response=error string)
        ├─ add_alert("error", ...)
        └─ return ClassificationResult(label=ignore, confidence=0.0, status=needs_review)
            ← no exception raised; sync continues for remaining emails
```

`ClassificationResult` dataclass shape is unchanged — no API or DB schema changes required beyond the new log table.

---

## `sync.py` Change

Remove the `clean_body()` call. Pass `body_text` directly to `classify_email()`. The LLM handles noise well and benefits from more signal. `text_utils.py` can be deleted once this import is removed.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| One provider rate-limited | `MultiLLMClient` automatically falls to next provider — no change needed |
| All providers exhausted | Return `ignore / needs_review`, log failure, surface alert in UI |
| LLM returns malformed JSON | `_parse_response` raises — caught as failure, same path as above |
| DB write of log fails | Log warning, do not fail the classification — transaction is more important than the log |

---

## Future Rule Engine (not in scope now)

The `classification_log` table enables:
1. **Sender-domain rules** — mine `sender_domain → (label, category)` pairs where `llm_confidence >= 0.9` appears 5+ times
2. **Amount pattern rules** — regex patterns per domain derived from high-confidence extractions
3. **User correction training** — join `classification_log` with `transactions WHERE status = corrected` to find where LLM was wrong

Pre-filters (skip obvious non-financial emails before LLM) are a separate future concern, revisited once the log has enough data to identify high-volume ignore patterns.

---

## Success Criteria

- Every email that enters `classify_email()` produces a `classification_log` row
- No email silently returns `ignore` without an LLM call
- Deleted files have zero remaining imports in the codebase
- Existing tests for `classify_email()` pass with the new implementation
- `sync.py` calls `classify_email()` with `email_id` so the log is linkable
