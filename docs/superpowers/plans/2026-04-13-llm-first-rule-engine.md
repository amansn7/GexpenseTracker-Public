# LLM-First Rule Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip the classifier so LLM is primary, its outputs compile into a self-growing pattern rule cache, and a bootstrap service seeds the rule engine from all existing emails on first launch.

**Architecture:** New emails first check the in-memory pattern cache (LLM-compiled rules) and builtin domain rules — if either matches, LLM is skipped entirely. Novel emails go to LLM; its output triggers a two-step rule-generation loop (template regex → LLM-written regex fallback) that validates the new rule against the triggering email before saving. The bootstrap service groups all existing emails by sender+body-fingerprint to deduplicate, then processes one representative per group, dramatically reducing LLM calls.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, httpx, re, collections.Counter. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/classifier/llm_client.py` | Modify | Add `write_regex()` method + `_call_provider_text()` helper |
| `app/classifier/pattern_gen.py` | Modify | Add `_is_valid_regex()`, `generate_llm_regex()`, `save_pattern_rule_with_llm_fallback()` |
| `app/api/emails.py` | Modify | Switch pattern-rule call to `save_pattern_rule_with_llm_fallback` |
| `app/classifier/bootstrap.py` | Create | All bootstrap logic: grouping, fingerprinting, run loop, progress |
| `app/api/sync.py` | Modify | Add `GET /api/bootstrap/status` and `POST /api/bootstrap/start` |
| `app/main.py` | Modify | Auto-trigger bootstrap on first launch in lifespan |
| `templates/settings.html` | Modify | Bootstrap card: progress bar, live log, stats, re-run button |
| `tests/test_bootstrap.py` | Create | Unit tests for grouping, fingerprint, noise detection, needs_bootstrap |
| `tests/test_pattern_gen_llm.py` | Create | Unit tests for `_is_valid_regex`, `save_pattern_rule_with_llm_fallback` |

---

## Task 1: Add `write_regex` to MultiLLMClient

**Files:**
- Modify: `app/classifier/llm_client.py`
- Test: `tests/test_pattern_gen_llm.py`

This adds a new method to the existing `MultiLLMClient` class that asks the LLM to write a raw regex pattern (not JSON). Uses a new `_call_provider_text` helper that skips JSON parsing and returns raw string content.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pattern_gen_llm.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_mock_response(content: str):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "choices": [{"message": {"content": content}}]
    }
    return mock_resp


@pytest.mark.asyncio
async def test_write_regex_returns_cleaned_pattern():
    from app.classifier.llm_client import MultiLLMClient
    client = MultiLLMClient()

    mock_provider = MagicMock()
    mock_provider.available.return_value = True
    mock_provider.priority_score.return_value = 1.0
    mock_provider.api_key = "test"
    mock_provider.base_url = "https://api.example.com"
    mock_provider.model = "test-model"
    mock_provider.extra_headers = {}
    mock_provider.success_count = 0
    client._providers = [mock_provider]

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_http = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        mock_http.post = AsyncMock(return_value=make_mock_response(
            "```python\n(?:debited|paid).{0,80}swiggy\n```"
        ))

        result = await client.write_regex(
            email_text="Rs.350 debited via UPI to swiggy@upi",
            label="expense",
            merchant="swiggy",
        )

    assert "swiggy" in result.lower()
    assert "```" not in result  # backticks stripped
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/amansaini/Desktop/Vibe/GexpenseTracker
docker compose exec app pytest tests/test_pattern_gen_llm.py::test_write_regex_returns_cleaned_pattern -v 2>&1 | tail -15
```

Expected: FAIL with `AttributeError: 'MultiLLMClient' object has no attribute 'write_regex'`

- [ ] **Step 3: Add `_REGEX_TEMPLATE`, `_call_provider_text`, and `write_regex` to `app/classifier/llm_client.py`**

Add after the `_EXTRACT_TEMPLATE` string (around line 82), before the `LLMClassification` dataclass:

```python
# Regex-writing prompt — returns raw pattern string, not JSON
_REGEX_TEMPLATE = (
    "You are a regex expert for Indian financial emails.\n"
    "This email is classified as a {label} transaction for merchant \"{merchant}\".\n\n"
    "Email text:\n{email_text}\n\n"
    "Write a Python regex pattern that matches SIMILAR emails from this sender.\n"
    "Rules:\n"
    "- Match merchant name + transaction keywords (debited/credited/paid/charged)\n"
    "- Do NOT hardcode the transaction amount (amounts vary per email)\n"
    "- Pattern will be compiled with re.IGNORECASE — write case-insensitively\n"
    "- Keep it specific enough to avoid false positives\n"
    "Return ONLY the regex pattern string. No explanation, no code blocks, no quotes."
)
```

Add inside `MultiLLMClient` class, before `get_status` (around line 221):

```python
async def _call_provider_text(self, provider: "_Provider", user_prompt: str) -> str:
    """Like _call_provider_verbose but returns raw text instead of parsed JSON."""
    payload = {
        "model": provider.model,
        "messages": [
            {"role": "system", "content": "You are a regex expert. Return only the regex pattern, nothing else."},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.0,
        "max_tokens": 150,
    }
    headers = {
        "Authorization": f"Bearer {provider.api_key}",
        "Content-Type": "application/json",
        **provider.extra_headers,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{provider.base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"].strip()
    # Strip markdown fences if LLM wraps the pattern
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(l for l in lines if not l.startswith("```")).strip()
    if raw.startswith("python"):
        raw = raw[6:].strip()
    return raw.strip("`").strip()

async def write_regex(self, email_text: str, label: str, merchant: str) -> str:
    """
    Ask LLM to write a regex pattern that matches this email.
    Returns the raw pattern string. Raises RuntimeError if all providers fail.
    """
    ranked = self._ranked_providers()
    if not ranked:
        raise RuntimeError("No LLM providers available")

    prompt = _REGEX_TEMPLATE.format(
        label=label,
        merchant=merchant,
        email_text=email_text[:1200],
    )
    last_error: Optional[Exception] = None
    for provider in ranked:
        try:
            raw = await self._call_provider_text(provider, prompt)
            provider.success_count += 1
            return raw
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                retry_after = int(exc.response.headers.get("Retry-After", "60"))
                provider.mark_rate_limited(retry_after)
                last_error = exc
                continue
            provider.fail_count += 1
            last_error = exc
            continue
        except Exception as exc:
            provider.fail_count += 1
            logger.warning("Provider '%s' write_regex error: %s", provider.name, exc)
            last_error = exc
            continue
    raise last_error or RuntimeError("All LLM providers failed for write_regex")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker compose exec app pytest tests/test_pattern_gen_llm.py::test_write_regex_returns_cleaned_pattern -v 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/classifier/llm_client.py tests/test_pattern_gen_llm.py
git commit -m "feat: add write_regex to MultiLLMClient for LLM-written rule generation"
```

---

## Task 2: Add regex validation and LLM fallback to `pattern_gen.py`

**Files:**
- Modify: `app/classifier/pattern_gen.py`
- Test: `tests/test_pattern_gen_llm.py`

Adds three functions:
- `_is_valid_regex(pattern)` — safety gate rejecting broad/invalid patterns
- `generate_llm_regex(email_text, label, merchant)` — calls `llm_client.write_regex`, validates result
- `save_pattern_rule_with_llm_fallback(db, ...)` — template first, LLM-written fallback on failure

- [ ] **Step 1: Write failing tests**

Append to `tests/test_pattern_gen_llm.py`:

```python
def test_is_valid_regex_rejects_too_short():
    from app.classifier.pattern_gen import _is_valid_regex
    assert _is_valid_regex("ab") is False

def test_is_valid_regex_rejects_too_broad():
    from app.classifier.pattern_gen import _is_valid_regex
    assert _is_valid_regex(".*") is False
    assert _is_valid_regex(".+") is False

def test_is_valid_regex_rejects_invalid_syntax():
    from app.classifier.pattern_gen import _is_valid_regex
    assert _is_valid_regex("(?:unclosed") is False

def test_is_valid_regex_accepts_good_pattern():
    from app.classifier.pattern_gen import _is_valid_regex
    assert _is_valid_regex(r"(?:debited|paid).{0,80}swiggy") is True

def test_is_valid_regex_rejects_no_literals():
    from app.classifier.pattern_gen import _is_valid_regex
    assert _is_valid_regex(r"\d+\s+\w+") is False


@pytest.mark.asyncio
async def test_save_pattern_rule_with_llm_fallback_uses_llm_when_template_fails():
    """When template regex doesn't match trigger text, LLM is called."""
    from app.classifier.pattern_gen import save_pattern_rule_with_llm_fallback, clear_cache

    clear_cache()

    # trigger_text has no 'swiggy' keyword → template regex will fail self-test
    trigger_text = "payment of rs 350 processed successfully ref 12345"

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))

    with patch("app.classifier.pattern_gen.generate_llm_regex", new=AsyncMock(return_value=None)) as mock_llm:
        result = await save_pattern_rule_with_llm_fallback(
            db=mock_db,
            merchant="swiggy",
            label="expense",
            category="Food",
            confidence=0.88,
            trigger_text=trigger_text,
        )
        mock_llm.assert_called_once()

    assert result is None  # LLM returned None → drop
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec app pytest tests/test_pattern_gen_llm.py::test_is_valid_regex_rejects_too_short tests/test_pattern_gen_llm.py::test_save_pattern_rule_with_llm_fallback_uses_llm_when_template_fails -v 2>&1 | tail -15
```

Expected: FAIL with `ImportError: cannot import name '_is_valid_regex'`

- [ ] **Step 3: Add functions to `app/classifier/pattern_gen.py`**

After the `_pattern_matches_text` function (around line 78), add:

```python
def _is_valid_regex(pattern: str) -> bool:
    """
    Safety gate before saving an LLM-written regex.
    Rejects patterns that are too short, too broad, or syntactically invalid.
    """
    if not pattern or len(pattern) < 10:
        return False
    try:
        re.compile(pattern)
    except re.error:
        return False
    # Must contain at least one two-character word literal (not just wildcards/metacharacters)
    if not re.search(r'[a-zA-Z0-9]{2,}', pattern):
        return False
    return True


async def generate_llm_regex(
    email_text: str,
    label: str,
    merchant: str,
) -> Optional[str]:
    """
    Ask llm_client to write a regex for this email.
    Validates result with _is_valid_regex before returning.
    Returns the pattern string or None.
    """
    from app.classifier.llm_client import llm_client
    try:
        raw = await llm_client.write_regex(email_text, label, merchant)
        if _is_valid_regex(raw):
            return raw
        log.info("pattern_gen: LLM regex rejected by validator: %r", raw)
        return None
    except Exception as exc:
        log.warning("pattern_gen: generate_llm_regex failed: %s", exc)
        return None


async def save_pattern_rule_with_llm_fallback(
    db,
    merchant: str,
    label: str,
    category: Optional[str],
    confidence: float,
    trigger_text: str,
) -> Optional[str]:
    """
    Two-step rule generation:
      Step 1: template regex — fast, no extra LLM call
      Step 2: LLM-written regex — fallback when template fails self-test

    Returns the saved pattern string, or None if no rule was saved.
    Caller must commit the session.
    """
    from sqlalchemy import select
    from app.models import PatternRule

    if not merchant or label not in ("expense", "income"):
        return None

    # ── Step 1: template regex ────────────────────────────────────────────────
    template_pattern = generate_pattern(merchant, label)
    if _pattern_matches_text(template_pattern, trigger_text):
        # Delegate to existing save logic (handles dedup + cache)
        return await save_pattern_rule(db, merchant, label, category, confidence, trigger_text)

    # ── Step 2: LLM writes regex ──────────────────────────────────────────────
    log.info("pattern_gen: template regex failed self-test for '%s', trying LLM", merchant)
    llm_pattern = await generate_llm_regex(trigger_text, label, merchant)
    if not llm_pattern:
        return None

    if not _pattern_matches_text(llm_pattern, trigger_text):
        log.info("pattern_gen: LLM regex also failed self-test for '%s', dropping", merchant)
        return None

    # Dedup
    existing = (await db.execute(
        select(PatternRule).where(PatternRule.regex_pattern == llm_pattern)
    )).scalar_one_or_none()
    if existing:
        existing.hit_count += 1
        log.debug("pattern_gen: LLM-written pattern already exists, hit_count++. merchant=%s", merchant)
        return None

    rule = PatternRule(
        regex_pattern=llm_pattern,
        label=label,
        merchant=merchant,
        category=category,
        confidence=confidence,
        hit_count=1,
        source="llm_written",
    )
    db.add(rule)
    _add_to_cache(llm_pattern, label, merchant, category, confidence)
    log.info("pattern_gen: LLM-written rule saved. merchant=%s label=%s", merchant, label)
    return llm_pattern
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec app pytest tests/test_pattern_gen_llm.py -v 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/classifier/pattern_gen.py tests/test_pattern_gen_llm.py
git commit -m "feat: add LLM-written regex fallback to pattern_gen with validity gate"
```

---

## Task 3: Wire `emails.py` to use `save_pattern_rule_with_llm_fallback`

**Files:**
- Modify: `app/api/emails.py:427-439`

One-line change. The existing `save_pattern_rule` call becomes `save_pattern_rule_with_llm_fallback`. No new tests needed — the existing emails API tests cover this code path.

- [ ] **Step 1: Update the import and call in `app/api/emails.py`**

Find the block around line 427:

```python
                        from app.classifier.pattern_gen import save_pattern_rule
                        trigger_text = f"{email.subject or ''} {effective_body_for_cls}"
                        saved_pattern = await save_pattern_rule(
                            db=db,
                            merchant=cls.merchant,
                            label=cls.label.value,
                            category=cls.category,
                            confidence=round(cls.confidence * 0.95, 2),
                            trigger_text=trigger_text,
                        )
```

Replace with:

```python
                        from app.classifier.pattern_gen import save_pattern_rule_with_llm_fallback
                        trigger_text = f"{email.subject or ''} {effective_body_for_cls}"
                        saved_pattern = await save_pattern_rule_with_llm_fallback(
                            db=db,
                            merchant=cls.merchant,
                            label=cls.label.value,
                            category=cls.category,
                            confidence=round(cls.confidence * 0.95, 2),
                            trigger_text=trigger_text,
                        )
```

- [ ] **Step 2: Verify app starts clean**

```bash
docker compose up --build -d 2>&1 | tail -4
docker compose logs app --tail=8 2>&1
```

Expected: `Application startup complete.` with no import errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/emails.py
git commit -m "feat: use save_pattern_rule_with_llm_fallback in reclassify endpoint"
```

---

## Task 4: Create `bootstrap.py` — pure functions

**Files:**
- Create: `app/classifier/bootstrap.py`
- Test: `tests/test_bootstrap.py`

Build and test the stateless helper functions before the async DB/LLM logic.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_bootstrap.py
import pytest
from unittest.mock import MagicMock


def make_email(domain: str, body: str) -> MagicMock:
    e = MagicMock()
    e.sender_domain = domain
    e.body_text = body
    e.subject = "Test subject"
    e.sender = f"noreply@{domain}"
    e.id = f"id-{domain}-{body[:8]}"
    return e


def test_body_fingerprint_top3_tokens():
    from app.classifier.bootstrap import _body_fingerprint
    text = "debited debited upi credited credited credited account account account"
    fp = _body_fingerprint(text)
    tokens = fp.split()
    assert len(tokens) == 3
    # "account", "credited", "debited" are top-3 (sorted)
    assert "account" in tokens
    assert "credited" in tokens


def test_body_fingerprint_excludes_stopwords():
    from app.classifier.bootstrap import _body_fingerprint
    text = "the a an is are was been have has"
    fp = _body_fingerprint(text)
    assert "the" not in fp
    assert "are" not in fp


def test_body_fingerprint_unknown_on_empty():
    from app.classifier.bootstrap import _body_fingerprint
    assert _body_fingerprint("") == "unknown"


def test_group_emails_by_domain_and_fingerprint():
    from app.classifier.bootstrap import group_emails
    e1 = make_email("hdfc.co.in", "Rs 500 debited via upi to swiggy your account")
    e2 = make_email("hdfc.co.in", "Rs 300 debited via upi to swiggy your account")
    e3 = make_email("hdfc.co.in", "salary credited to your account from employer")
    e4 = make_email("icici.com", "Rs 200 debited via upi to swiggy your account")

    groups = group_emails([e1, e2, e3, e4])
    # e1 and e2 share domain + fingerprint → same group
    # e3 has different fingerprint → separate group
    # e4 has different domain → separate group
    assert len(groups) == 3
    # Find the group containing e1 and e2
    big_group = [v for v in groups.values() if len(v) == 2][0]
    ids = {e.id for e in big_group}
    assert e1.id in ids
    assert e2.id in ids


def test_is_noise_group_detects_otp():
    from app.classifier.bootstrap import _is_noise_group
    assert _is_noise_group("otp account verified") is True


def test_is_noise_group_detects_password():
    from app.classifier.bootstrap import _is_noise_group
    assert _is_noise_group("password reset login") is True


def test_is_noise_group_passes_financial():
    from app.classifier.bootstrap import _is_noise_group
    assert _is_noise_group("debited upi account") is False


def test_group_emails_skips_empty_body():
    from app.classifier.bootstrap import group_emails
    e1 = make_email("hdfc.co.in", "")
    e2 = make_email("hdfc.co.in", "Rs 500 debited upi account")
    groups = group_emails([e1, e2])
    # e1 has empty body → skipped
    assert sum(len(v) for v in groups.values()) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec app pytest tests/test_bootstrap.py -v 2>&1 | tail -15
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.classifier.bootstrap'`

- [ ] **Step 3: Create `app/classifier/bootstrap.py` with pure functions**

```python
"""
Bootstrap service — seed the rule engine from all existing emails on first launch.

Groups emails by sender_domain + body fingerprint, sends one LLM call per group,
validates the generated rule against all group members, backfills transactions.
"""
import asyncio
import logging
import re
from collections import defaultdict, Counter
from typing import Dict, List, Optional

log = logging.getLogger(__name__)

# ── Noise detection ────────────────────────────────────────────────────────────

_NOISE_TOKENS = frozenset({
    "otp", "password", "login", "verify", "verification",
    "statement", "newsletter", "unsubscribe", "promotional",
    "offer", "sale", "delivery", "shipment", "tracking",
})

_STOPWORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can",
    "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "your", "you", "we", "our", "this", "that", "it", "its",
    "and", "or", "but", "not", "no", "any", "all", "as",
})

# ── Progress state ─────────────────────────────────────────────────────────────

_bootstrap_progress: dict = {
    "running": False,
    "phase": "idle",
    "groups_total": 0,
    "groups_done": 0,
    "rules_saved": 0,
    "rules_dropped": 0,
    "emails_covered": 0,
    "llm_calls": 0,
    "log": [],
    "error": None,
}


def get_bootstrap_progress() -> dict:
    return dict(_bootstrap_progress)


def _log_progress(msg: str) -> None:
    log.info("bootstrap: %s", msg)
    _bootstrap_progress["log"] = ([msg] + _bootstrap_progress["log"])[:20]


# ── Pure helpers ───────────────────────────────────────────────────────────────

def _body_fingerprint(text: str) -> str:
    """
    Top-3 most-frequent non-stopword tokens (≥3 chars) from body text, sorted
    and joined. Used as secondary grouping key alongside sender_domain.
    """
    tokens = re.findall(r"[a-z]{3,}", text.lower())
    filtered = [t for t in tokens if t not in _STOPWORDS]
    if not filtered:
        return "unknown"
    top3 = [tok for tok, _ in Counter(filtered).most_common(3)]
    return " ".join(sorted(top3))


def _is_noise_group(fingerprint: str) -> bool:
    """True if the group fingerprint suggests OTP/login/newsletter emails."""
    return any(noise in fingerprint for noise in _NOISE_TOKENS)


def group_emails(emails) -> Dict[str, list]:
    """
    Group Email objects by sender_domain + body fingerprint.
    Emails with empty body_text are silently skipped.
    Returns dict mapping group_key → list of Email objects.
    """
    groups: Dict[str, list] = defaultdict(list)
    for email in emails:
        body = (email.body_text or "").strip()
        if not body:
            continue
        domain = email.sender_domain or "unknown"
        fp = _body_fingerprint(body)
        key = f"{domain}::{fp}"
        groups[key].append(email)
    return dict(groups)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec app pytest tests/test_bootstrap.py -v 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/classifier/bootstrap.py tests/test_bootstrap.py
git commit -m "feat: bootstrap.py pure functions — grouping, fingerprinting, noise detection"
```

---

## Task 5: Add async functions to `bootstrap.py`

**Files:**
- Modify: `app/classifier/bootstrap.py`
- Test: `tests/test_bootstrap.py`

Adds `needs_bootstrap()` and `run_bootstrap()` — the async DB + LLM logic.

- [ ] **Step 1: Write failing tests**

Append to `tests/test_bootstrap.py`:

```python
@pytest.mark.asyncio
async def test_needs_bootstrap_true_when_no_rules_but_emails():
    from app.classifier.bootstrap import needs_bootstrap
    from unittest.mock import AsyncMock, MagicMock, patch

    async def fake_execute(stmt):
        # Return 0 for PatternRule count, 5 for Email count
        result = MagicMock()
        if "pattern_rules" in str(stmt).lower() or "patternrule" in str(type(stmt)):
            result.scalar_one.return_value = 0
        else:
            result.scalar_one.return_value = 5
        return result

    mock_db = MagicMock()
    mock_db.execute = AsyncMock(side_effect=fake_execute)

    # needs_bootstrap checks rule count then email count
    # We mock both checks via side_effect
    with patch("app.classifier.bootstrap.AsyncSessionLocal") as _:
        # Call directly with mock db
        from sqlalchemy import select, func
        from app.models import PatternRule, Email as EmailModel

        # Directly test the logic by patching execute
        mock_db2 = AsyncMock()
        mock_db2.execute = AsyncMock(side_effect=[
            MagicMock(scalar_one=MagicMock(return_value=0)),  # PatternRule count
            MagicMock(scalar_one=MagicMock(return_value=5)),  # Email count
        ])
        result = await needs_bootstrap(mock_db2)
        assert result is True


@pytest.mark.asyncio
async def test_needs_bootstrap_false_when_rules_exist():
    from app.classifier.bootstrap import needs_bootstrap
    from unittest.mock import AsyncMock, MagicMock

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=MagicMock(scalar_one=MagicMock(return_value=3)))
    result = await needs_bootstrap(mock_db)
    assert result is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec app pytest tests/test_bootstrap.py::test_needs_bootstrap_true_when_no_rules_but_emails tests/test_bootstrap.py::test_needs_bootstrap_false_when_rules_exist -v 2>&1 | tail -15
```

Expected: FAIL with `ImportError: cannot import name 'needs_bootstrap'`

- [ ] **Step 3: Add `needs_bootstrap` and `run_bootstrap` to `app/classifier/bootstrap.py`**

Append to `app/classifier/bootstrap.py`:

```python
# ── Async DB + LLM functions ───────────────────────────────────────────────────

async def needs_bootstrap(db) -> bool:
    """
    Returns True when there are 0 pattern rules but emails exist in DB.
    Called at startup to decide whether to auto-trigger bootstrap.
    """
    from sqlalchemy import select, func
    from app.models import PatternRule, Email as EmailModel

    rule_count = (
        await db.execute(select(func.count()).select_from(PatternRule))
    ).scalar_one()
    if rule_count > 0:
        return False
    email_count = (
        await db.execute(select(func.count()).select_from(EmailModel))
    ).scalar_one()
    return email_count > 0


async def _handle_group(
    db,
    group_key: str,
    group_email_list: list,
    llm_client,
    save_fn,
    clean_body,
) -> None:
    """Process one email group: LLM classify → generate rule → backfill transactions."""
    from sqlalchemy import select, delete
    from app.models import Transaction, PatternRule, TransactionStatus, ClassifierMethod
    from app.classifier.pattern_gen import _pattern_cache

    # Pick representative: email with longest body_text
    rep = max(group_email_list, key=lambda e: len(e.body_text or ""))
    body = clean_body(rep.body_text or "")

    try:
        _bootstrap_progress["llm_calls"] += 1
        result = await llm_client.classify(
            sender=rep.sender or "",
            subject=rep.subject or "",
            body_snippet=body,
        )
    except Exception as exc:
        log.warning("bootstrap: LLM failed for group '%s': %s", group_key, exc)
        _bootstrap_progress["rules_dropped"] += 1
        _bootstrap_progress["groups_done"] += 1
        _log_progress(f"✗ [{group_key.split('::')[0]}] LLM error: {exc}")
        return

    label_str = result.label
    domain_short = group_key.split("::")[0]

    if label_str not in ("expense", "income"):
        _bootstrap_progress["groups_done"] += 1
        _log_progress(f"→ [{domain_short}] label={label_str}, no rule generated")
        return

    # Generate + validate rule
    trigger_text = f"{rep.subject or ''} {body}"
    saved_pattern = await save_fn(
        db=db,
        merchant=result.merchant,
        label=label_str,
        category=result.category,
        confidence=result.confidence,
        trigger_text=trigger_text,
    )

    # Test rule against ALL emails in group (≥70% must match)
    matched_emails = []
    if saved_pattern:
        try:
            compiled = re.compile(saved_pattern, re.IGNORECASE)
            for email in group_email_list:
                text = f"{email.subject or ''} {clean_body(email.body_text or '')}".lower()
                if compiled.search(text):
                    matched_emails.append(email)
        except re.error:
            matched_emails = []

        match_rate = len(matched_emails) / max(len(group_email_list), 1)
        if match_rate < 0.70:
            # Remove under-performing rule from DB and cache
            await db.execute(
                delete(PatternRule).where(PatternRule.regex_pattern == saved_pattern)
            )
            _pattern_cache[:] = [
                p for p in _pattern_cache
                if p.regex.pattern != saved_pattern.lower()
            ]
            saved_pattern = None
            _log_progress(
                f"✗ [{domain_short}] rule dropped ({match_rate:.0%} match rate < 70%)"
            )

    if saved_pattern and matched_emails:
        # Backfill transactions for matched emails, skip confirmed ones
        backfilled = 0
        for email in matched_emails:
            confirmed = (await db.execute(
                select(Transaction).where(
                    Transaction.email_id == email.id,
                    Transaction.status.in_(["confirmed", "corrected"]),
                )
            )).scalar_one_or_none()
            if confirmed:
                continue
            # Remove stale auto/needs_review transaction if present
            await db.execute(
                delete(Transaction).where(
                    Transaction.email_id == email.id,
                    Transaction.status.notin_(["confirmed", "corrected"]),
                )
            )
            status = (
                TransactionStatus.auto.value
                if result.confidence >= 0.75
                else TransactionStatus.needs_review.value
            )
            db.add(Transaction(
                email_id=email.id,
                label=label_str,
                amount=result.amount,
                currency="INR",
                merchant=result.merchant,
                category=result.category,
                confidence=result.confidence,
                status=status,
                classifier_method=ClassifierMethod.llm.value,
            ))
            backfilled += 1

        await db.commit()
        _bootstrap_progress["rules_saved"] += 1
        _bootstrap_progress["emails_covered"] += len(matched_emails)
        _log_progress(
            f"✓ [{domain_short}] rule saved · "
            f"{len(matched_emails)} emails covered · {backfilled} txns backfilled"
        )
    else:
        _bootstrap_progress["rules_dropped"] += 1
        if not saved_pattern:
            _log_progress(f"✗ [{domain_short}] no valid rule generated")

    _bootstrap_progress["groups_done"] += 1


async def run_bootstrap() -> dict:
    """
    Main bootstrap loop. Creates its own DB session (same pattern as run_sync).
    Groups all emails, sends one LLM call per group, validates and saves rules,
    backfills transactions. Safe to re-run — rules are deduped by unique constraint.
    """
    from app.database import AsyncSessionLocal
    from app.classifier.llm_client import llm_client
    from app.classifier.pattern_gen import save_pattern_rule_with_llm_fallback
    from app.classifier.text_utils import clean_body
    from sqlalchemy import select
    from app.models import Email as EmailModel

    _bootstrap_progress.update({
        "running": True,
        "phase": "grouping",
        "groups_total": 0,
        "groups_done": 0,
        "rules_saved": 0,
        "rules_dropped": 0,
        "emails_covered": 0,
        "llm_calls": 0,
        "log": [],
        "error": None,
    })

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(EmailModel).where(
                    EmailModel.body_text.isnot(None),
                    EmailModel.body_text != "",
                )
            )
            emails = result.scalars().all()
            _log_progress(f"Loaded {len(emails)} emails with body text")

            groups = group_emails(emails)
            surviving = {
                k: v for k, v in groups.items()
                if not _is_noise_group(k.split("::", 1)[-1])
            }
            skipped_noise = len(groups) - len(surviving)

            _bootstrap_progress.update({
                "phase": "processing",
                "groups_total": len(surviving),
            })
            _log_progress(
                f"Groups: {len(surviving)} to process, {skipped_noise} noise groups skipped"
            )

            for group_key, group_email_list in surviving.items():
                await _handle_group(
                    db, group_key, group_email_list,
                    llm_client, save_pattern_rule_with_llm_fallback, clean_body,
                )

        _bootstrap_progress.update({"running": False, "phase": "done"})
        _log_progress(
            f"Bootstrap complete: {_bootstrap_progress['rules_saved']} rules, "
            f"{_bootstrap_progress['emails_covered']} emails covered, "
            f"{_bootstrap_progress['llm_calls']} LLM calls used"
        )

    except Exception as exc:
        log.error("bootstrap: crashed: %s", exc, exc_info=True)
        _bootstrap_progress.update({"running": False, "phase": "error", "error": str(exc)})
        raise

    return dict(_bootstrap_progress)
```

- [ ] **Step 4: Run all bootstrap tests**

```bash
docker compose exec app pytest tests/test_bootstrap.py -v 2>&1 | tail -20
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app/classifier/bootstrap.py tests/test_bootstrap.py
git commit -m "feat: bootstrap async functions — needs_bootstrap and run_bootstrap loop"
```

---

## Task 6: Add bootstrap API endpoints to `sync.py`

**Files:**
- Modify: `app/api/sync.py`

Two endpoints: status polling and manual trigger. Same pattern as existing `/sync/trigger`.

- [ ] **Step 1: Write failing test**

Append to `tests/test_api.py` (or create it if missing):

```python
def test_bootstrap_status_returns_dict(client):
    resp = client.get("/api/bootstrap/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "running" in data
    assert "phase" in data
    assert "rules_saved" in data


def test_bootstrap_start_returns_message(client):
    resp = client.post("/api/bootstrap/start")
    assert resp.status_code == 200
    assert "message" in resp.json()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
docker compose exec app pytest tests/test_api.py::test_bootstrap_status_returns_dict tests/test_api.py::test_bootstrap_start_returns_message -v 2>&1 | tail -15
```

Expected: FAIL with 404 or similar

- [ ] **Step 3: Add endpoints to `app/api/sync.py`**

Append before the final line of `app/api/sync.py`:

```python
@router.get("/bootstrap/status")
async def bootstrap_status():
    from app.classifier.bootstrap import get_bootstrap_progress, needs_bootstrap
    from app.database import AsyncSessionLocal
    progress = get_bootstrap_progress()
    async with AsyncSessionLocal() as db:
        needed = await needs_bootstrap(db)
    return {"needed": needed, **progress}


@router.post("/bootstrap/start")
async def bootstrap_start():
    from app.classifier.bootstrap import run_bootstrap, get_bootstrap_progress
    progress = get_bootstrap_progress()
    if progress.get("running"):
        return {"message": "Bootstrap already running", "running": True}
    task = asyncio.create_task(run_bootstrap())
    _background_tasks.add(task)
    task.add_done_callback(_log_task_result)
    return {"message": "Bootstrap started"}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
docker compose exec app pytest tests/test_api.py::test_bootstrap_status_returns_dict tests/test_api.py::test_bootstrap_start_returns_message -v 2>&1 | tail -15
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/sync.py
git commit -m "feat: add /api/bootstrap/status and /api/bootstrap/start endpoints"
```

---

## Task 7: Auto-trigger bootstrap on first launch in `main.py`

**Files:**
- Modify: `app/main.py:26-30`

Add the auto-trigger after startup caches load. Uses `asyncio.create_task` so it runs in the background without blocking startup.

- [ ] **Step 1: Update lifespan in `app/main.py`**

Find the lifespan block (around line 26-30):

```python
            from app.classifier.feature_classifier import bootstrap_model_from_db
            from app.classifier.pattern_gen import load_pattern_cache_from_db
            from app.classifier.merchant import load_alias_cache_from_db
            from app.classifier.learning import load_learning
            load_learning()
            async with AsyncSessionLocal() as db:
                await load_pattern_cache_from_db(db)
                await load_alias_cache_from_db(db)
                await bootstrap_model_from_db(db)
```

Replace with:

```python
            from app.classifier.feature_classifier import bootstrap_model_from_db
            from app.classifier.pattern_gen import load_pattern_cache_from_db
            from app.classifier.merchant import load_alias_cache_from_db
            from app.classifier.learning import load_learning
            from app.classifier.bootstrap import needs_bootstrap, run_bootstrap
            import asyncio as _asyncio
            load_learning()
            async with AsyncSessionLocal() as db:
                await load_pattern_cache_from_db(db)
                await load_alias_cache_from_db(db)
                await bootstrap_model_from_db(db)
                if await needs_bootstrap(db):
                    logging.getLogger(__name__).info(
                        "No pattern rules found — starting rule engine bootstrap in background"
                    )
                    _asyncio.create_task(run_bootstrap())
```

- [ ] **Step 2: Rebuild and verify startup log**

```bash
docker compose up --build -d 2>&1 | tail -4
docker compose logs app --tail=15 2>&1
```

Expected: `Application startup complete.` If emails exist and rules=0, also see: `No pattern rules found — starting rule engine bootstrap in background`

- [ ] **Step 3: Commit**

```bash
git add app/main.py
git commit -m "feat: auto-trigger bootstrap on first launch when no pattern rules exist"
```

---

## Task 8: Bootstrap progress UI in `settings.html`

**Files:**
- Modify: `templates/settings.html`

Add a "Rule Engine Bootstrap" card after the existing "ML Classifier" card. Polls `/api/bootstrap/status` every 2 seconds when running, shows progress bar, live log, stats, and a re-run button.

- [ ] **Step 1: Add the card and JS to `templates/settings.html`**

Find the closing `</div>` of the "ML Classifier" glass card (around line 58), and insert after it:

```html
<!-- Rule Engine Bootstrap -->
<div class="glass" style="margin-bottom:20px" id="bootstrap-card">
  <div class="glass-header">
    Rule Engine Bootstrap
    <span style="font-size:12px;color:#555">Groups similar emails and sends one to LLM per group</span>
  </div>
  <div style="padding:16px 20px">
    <div id="bootstrap-status-wrap">
      <p style="color:#444;font-size:13px">Loading…</p>
    </div>
  </div>
</div>
```

At the bottom of the file, inside the existing `<script>` block (or add one), append:

```javascript
// ── Bootstrap ─────────────────────────────────────────────────────────────────
let _bootstrapPoll = null;

async function loadBootstrapStatus() {
  try {
    const res = await fetch('/api/bootstrap/status');
    if (!res.ok) return;
    const d = await res.json();
    renderBootstrapStatus(d);
    if (d.running && !_bootstrapPoll) {
      _bootstrapPoll = setInterval(async () => {
        const r = await fetch('/api/bootstrap/status');
        if (!r.ok) return;
        const data = await r.json();
        renderBootstrapStatus(data);
        if (!data.running) {
          clearInterval(_bootstrapPoll);
          _bootstrapPoll = null;
        }
      }, 2000);
    }
  } catch (e) { /* silently ignore */ }
}

function renderBootstrapStatus(d) {
  const wrap = document.getElementById('bootstrap-status-wrap');
  if (!wrap) return;

  const pct = d.groups_total > 0
    ? Math.round((d.groups_done / d.groups_total) * 100)
    : (d.phase === 'done' ? 100 : 0);

  const phaseColor = { done: '#4ade80', error: '#f87171', idle: '#64748b' }[d.phase] || '#a78bfa';
  const phaseLabel = d.running ? `Processing… (${d.groups_done}/${d.groups_total} groups)` : d.phase;

  const logHtml = (d.log || []).map(l => {
    const color = l.startsWith('✓') ? '#4ade80' : l.startsWith('✗') ? '#f87171' : '#94a3b8';
    return `<div style="color:${color}">${l}</div>`;
  }).join('');

  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:12px;color:${phaseColor}">${phaseLabel}</div>
      <button onclick="triggerBootstrap()" style="background:rgba(99,102,241,0.15);color:#a78bfa;border:1px solid rgba(99,102,241,0.3);padding:4px 14px;border-radius:6px;font-size:12px;cursor:pointer"
        ${d.running ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>
        ${d.running ? 'Running…' : 'Re-run Bootstrap'}
      </button>
    </div>
    ${d.phase !== 'idle' ? `
    <div style="background:rgba(255,255,255,0.05);border-radius:6px;height:5px;margin-bottom:10px">
      <div style="background:linear-gradient(90deg,#6366f1,#a78bfa);width:${pct}%;height:100%;border-radius:6px;transition:width 0.4s"></div>
    </div>
    <div style="display:flex;gap:20px;margin-bottom:12px;font-size:12px">
      <div><span style="color:#4ade80;font-weight:600">${d.rules_saved}</span> <span style="color:#64748b">rules saved</span></div>
      <div><span style="color:#a78bfa;font-weight:600">${d.emails_covered}</span> <span style="color:#64748b">emails covered</span></div>
      <div><span style="color:#fbbf24;font-weight:600">${d.llm_calls}</span> <span style="color:#64748b">LLM calls</span></div>
      <div><span style="color:#f87171;font-weight:600">${d.rules_dropped}</span> <span style="color:#64748b">dropped</span></div>
    </div>
    ${logHtml ? `<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:10px;font-family:monospace;font-size:11px;max-height:110px;overflow-y:auto">${logHtml}</div>` : ''}
    ` : `<p style="color:#555;font-size:13px;margin:0">Bootstrap has not run yet. Click "Re-run Bootstrap" to seed the rule engine from your emails.</p>`}
    ${d.error ? `<p style="color:#f87171;font-size:12px;margin-top:8px">Error: ${d.error}</p>` : ''}
  `;
}

async function triggerBootstrap() {
  await fetch('/api/bootstrap/start', { method: 'POST' });
  if (_bootstrapPoll) clearInterval(_bootstrapPoll);
  _bootstrapPoll = null;
  await loadBootstrapStatus();
  // Start polling
  _bootstrapPoll = setInterval(async () => {
    const r = await fetch('/api/bootstrap/status');
    if (!r.ok) return;
    const data = await r.json();
    renderBootstrapStatus(data);
    if (!data.running) {
      clearInterval(_bootstrapPoll);
      _bootstrapPoll = null;
    }
  }, 2000);
}

// Load on page init (add to existing init block or call directly)
loadBootstrapStatus();
```

- [ ] **Step 2: Rebuild and verify UI renders**

```bash
docker compose up --build -d 2>&1 | tail -4
```

Open `http://localhost:8000/settings` in browser. Verify:
- "Rule Engine Bootstrap" card is visible
- Re-run Bootstrap button is present
- Status shows current phase (idle/done/running)

- [ ] **Step 3: Commit**

```bash
git add templates/settings.html
git commit -m "feat: bootstrap progress card in settings — live log, stats, re-run button"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| LLM as primary for novel emails | Tasks 1-3 (pattern cache fast-path already in apply_rules Layer 0.5) |
| Template regex → LLM regex fallback loop | Task 2 (`save_pattern_rule_with_llm_fallback`) |
| Rule validated against trigger email before saving | Task 2 (`_pattern_matches_text` gates both paths) |
| LLM writes regex directly | Task 1 (`write_regex`) |
| `_is_valid_regex` safety gate | Task 2 |
| Bootstrap: group by domain + fingerprint | Task 4 |
| Bootstrap: skip OTP/noise groups | Task 4 (`_is_noise_group`) |
| Bootstrap: pick longest body as representative | Task 5 (`_handle_group`) |
| Bootstrap: test rule against full group (≥70%) | Task 5 |
| Bootstrap: backfill transactions | Task 5 |
| Bootstrap: progress tracking | Task 5 (`_bootstrap_progress`) |
| Bootstrap: API endpoints | Task 6 |
| Bootstrap: auto-trigger on first launch | Task 7 |
| Bootstrap: UI in settings | Task 8 |
| No migration needed | ✓ `PatternRule.source` already exists |

**Type consistency check:** `save_pattern_rule_with_llm_fallback` signature matches calls in Task 3 (emails.py) and Task 5 (bootstrap `_handle_group`). `needs_bootstrap(db)` takes a session in Task 5 and Task 7. `run_bootstrap()` takes no args in Task 5 and Task 7. All consistent.

**No placeholders found.**
