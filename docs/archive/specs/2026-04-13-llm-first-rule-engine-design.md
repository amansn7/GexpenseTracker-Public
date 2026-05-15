# LLM-First Rule Engine Design

## Goal

Flip the classifier from LLM-as-fallback to LLM-as-primary. LLM classifies new emails and its outputs compile into a growing pattern rule cache. Rules are validated before saving. A bootstrap service seeds the rule engine from all existing emails on first launch, grouping similar emails to minimise LLM calls.

## Context

Current pipeline (what exists today):
```
Email → Rule engine → ML classifier → Merchant intelligence → LLM (fallback only)
```

The rule engine was hand-crafted and LLM only fires when rules are uncertain. Result: many emails classified by brittle keyword rules with no learning from LLM quality.

New pipeline (what this spec builds):
```
Email → Pattern cache hit? → YES: rule result (skip LLM)
               ↓ NO
        Domain rule hit?  → YES: rule result (skip LLM)
               ↓ NO
        LLM classify + extract
               ↓
        Save transaction  +  async: generate & validate rule
```

Rule cache grows with every LLM call. Over time most emails hit the cache and LLM cost falls.

---

## Architecture

### 1. Ongoing Email Classification (new flow)

**Fast-path checks (skip LLM):**
1. Pattern cache lookup — in-memory, compiled from past LLM outputs
2. Builtin domain rules — `amazon.in`, `swiggy.in`, bank domains, etc.

**Slow path (novel emails):**
1. Call `llm_client.classify(sender, subject, body)` → label + amount + merchant + category + date
2. Save transaction immediately
3. Async: run rule generation loop

### 2. Rule Generation Loop

Runs after every successful LLM classification where `label ∈ {expense, income}` and `confidence ≥ 0.75` and `merchant` is not null.

**Step 1 — Template regex:**
- `generate_pattern(merchant, label)` builds: `(?:debit|paid|charged).{0,120}MERCHANT|MERCHANT.{0,80}(?:debit|paid)`
- Test against the trigger email text
- Match → save rule with `source="llm_generated"` → done

**Step 2 — LLM writes regex (fallback):**
- If template regex fails the self-test, call `llm_client.write_regex(email_text, label, merchant)`
- Prompt: *"Write a Python regex that matches this Indian financial email. Label: {label}. Merchant: {merchant}. Email body: {text}. Return ONLY the regex pattern, nothing else."*
- Test LLM-generated regex against trigger email
- Match → save rule with `source="llm_written"` → done
- No match → drop rule; transaction is still saved

**Rule saved to:**
- `pattern_rules` DB table (existing)
- In-memory `_pattern_cache` immediately (no restart needed)

### 3. Bootstrap Service

Runs automatically on first launch when `COUNT(pattern_rules) = 0 AND COUNT(emails) > 0`. Can be re-triggered manually from Settings.

**Phase 1 — Grouping:**
- Load all `Email` rows with non-empty `body_text`
- Group key: `sender_domain` + body fingerprint
- Body fingerprint: top-3 most frequent non-stopword tokens from `body_text` (simple frequency, no external libs)
- Example: `hdfc.co.in::debited upi account` → 1 group covering 12 emails

**Phase 2 — OTP/noise skip:**
- Groups whose fingerprint contains any of: `otp`, `one time`, `password`, `login`, `verify`, `statement`, `newsletter` → skip entirely (no LLM call, no rule)

**Phase 3 — LLM + rule per group:**
For each surviving group (batches of 8, concurrent):
1. Pick representative: email with longest `body_text` in the group
2. Call LLM on representative → classification result
3. Run rule generation loop (Step 1 → Step 2 above)
4. Test saved rule against **all emails in group** (not just representative)
5. Rule kept if it matches ≥70% of the group; otherwise dropped
6. Backfill: for each email in group that matched the rule, upsert a `Transaction` row using the LLM result (skip emails that already have a confirmed transaction)

**Progress tracking:**
- `_bootstrap_progress` dict in `bootstrap.py` (same pattern as `_sync_progress` in `sync.py`)
- Fields: `running`, `phase`, `groups_total`, `groups_done`, `rules_saved`, `rules_dropped`, `emails_covered`, `llm_calls`, `log` (last 20 lines)
- Polled by `GET /api/bootstrap/status`

---

## Components

### New: `app/classifier/bootstrap.py`

| Function | Purpose |
|---|---|
| `_body_fingerprint(text) → str` | Top-3 token frequency signature from body text |
| `group_emails(emails) → Dict[str, List[Email]]` | Group by domain + fingerprint |
| `_is_noise_group(fingerprint) → bool` | Detect OTP/login/newsletter groups |
| `needs_bootstrap(db) → bool` | 0 pattern rules AND emails exist |
| `run_bootstrap(db) → dict` | Main bootstrap loop |
| `get_bootstrap_progress() → dict` | Returns current `_bootstrap_progress` |

### Modified: `app/classifier/pattern_gen.py`

| Addition | Purpose |
|---|---|
| `generate_llm_regex(email_text, label, merchant) → Optional[str]` | Calls LLM to write regex |
| `save_pattern_rule_with_llm_fallback(db, merchant, label, category, confidence, trigger_text) → Optional[str]` | Template → LLM fallback → drop |

### Modified: `app/classifier/llm_client.py`

| Addition | Purpose |
|---|---|
| `MultiLLMClient.write_regex(email_text, label, merchant) → str` | Regex-writing prompt, returns pattern only |

### Modified: `app/api/sync.py`

| Endpoint | Purpose |
|---|---|
| `GET /api/bootstrap/status` | `{needed, running, progress}` |
| `POST /api/bootstrap/start` | Trigger bootstrap as background task |

### Modified: `app/main.py`

In `lifespan()`, after startup caches load:
```python
from app.classifier.bootstrap import needs_bootstrap, run_bootstrap
if await needs_bootstrap(db):
    task = asyncio.create_task(run_bootstrap(db))
    _background_tasks.add(task)
```

### Modified: `templates/settings.html`

New "Rule Engine Bootstrap" card:
- Progress bar (`groups_done / groups_total`)
- Live log feed (last 20 lines, auto-scrolled)
- Stats: rules saved · emails covered · LLM calls · dropped
- "Re-run Bootstrap" button (POST `/api/bootstrap/start`)
- Card hidden when bootstrap has never run and is not needed

---

## Data Model

No migrations needed. `PatternRule.source` (existing `String(20)` column) gains a new value:
- `"llm_generated"` — existing, template regex matched
- `"llm_written"` — new, LLM produced the regex directly

---

## Error Handling

- LLM 429 (rate limit): bootstrap pauses for `Retry-After` seconds (handled by `MultiLLMClient`)
- LLM exception on a group: log warning, skip group, continue
- Bad regex from LLM `write_regex`: catch `re.error`, treat as no-match → drop
- Overly broad regex from LLM (e.g. `.*`, `.+`): reject patterns shorter than 10 chars or containing no literal word characters (`\w{2,}`) — treat as no-match → drop
- Bootstrap crash mid-run: `_bootstrap_progress` set to `phase="error"`, re-triggerable from UI

---

## Success Criteria

- Bootstrap completes on a 582-email corpus with significantly fewer LLM calls than emails (target: <20% of email count)
- After bootstrap, ≥80% of subsequent emails hit the pattern cache and skip LLM
- Every saved rule passes its self-test (match against trigger email)
- Bootstrap is idempotent: re-running doesn't create duplicate rules (deduped by `regex_pattern UNIQUE`)
- Zero regression: existing `apply_rules()` behaviour unchanged; pattern cache Layer 0.5 still runs first
