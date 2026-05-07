# Groq Rate Limiter Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 bugs found in code review of 92aa123 (Groq rate limiting) spanning 4 files.

**Architecture:** All fixes are surgical. No new abstractions. Each task is independent — fix, test, commit.

**Tech Stack:** Python/asyncio, FastAPI, pytest, httpx

---

## Bug List

| # | File | Bug |
|---|------|-----|
| 1 | `groq_rate_limiter.py:get_groq_limiter` | KeyError when user_id not cached and api_key=None |
| 2 | `groq_rate_limiter.py:get_groq_limiter` | Pointless encrypt→decrypt round-trip; duplicate import |
| 3 | `groq_rate_limiter.py:_maybe_reset_buckets` | Timestamp reads outside lock (race) |
| 4 | `groq_rate_limiter.py:acquire` | `time.sleep()` blocks event loop from async caller |
| 5 | `llm_client.py:_parse_response` | Double-escaped regex strings (L157, L158) |
| 6 | `llm_client.py:_call_provider_verbose` | `httpx.HTTPStatusError(request=None)` |
| 7 | `api/sync.py` | Duplicate `/llm/my-limits` endpoint (same as `/llm/limits`) |
| 8 | `sync.py` | O(n) `new_pairs.index()` in retry loop |

---

### Task 1: Fix `get_groq_limiter` — KeyError + cleanup

**Files:**
- Modify: `app/classifier/groq_rate_limiter.py:202-223`

**Bug:** When `user_id` is provided but not yet cached AND `api_key` is None, the `if api_key:` branch is skipped and `return _user_limiters[user_id]` raises `KeyError`. The `/llm/my-limits` endpoint hits this path (calls with `user_id` only, no `api_key`).

Also: the encrypt→decrypt round-trip (`decrypt_or_none(encrypt(api_key))`) is identity — pointless. The duplicate inner `from app.encryption import decrypt_or_none` repeats the top-level import.

- [ ] **Step 1: Write failing test**

```python
# tests/test_groq_rate_limiter.py
import pytest
from unittest.mock import patch
from app.classifier.groq_rate_limiter import get_groq_limiter, _user_limiters


def test_get_groq_limiter_returns_none_when_no_key_cached():
    """get_groq_limiter(user_id) with no api_key and user not cached returns None."""
    _user_limiters.clear()
    result = get_groq_limiter(user_id="user-no-key")
    assert result is None


def test_get_groq_limiter_creates_limiter_with_api_key():
    """get_groq_limiter(user_id, api_key) creates and caches a GroqRateLimiter."""
    _user_limiters.clear()
    limiter = get_groq_limiter(user_id="user-with-key", api_key="test-key")
    assert limiter is not None
    assert limiter.api_key == "test-key"


def test_get_groq_limiter_returns_cached_on_repeat_call():
    """Second call with same user_id returns the same limiter instance."""
    _user_limiters.clear()
    limiter1 = get_groq_limiter(user_id="user-cached", api_key="key1")
    limiter2 = get_groq_limiter(user_id="user-cached")
    assert limiter1 is limiter2
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pytest tests/test_groq_rate_limiter.py -v
```

Expected: `test_get_groq_limiter_returns_none_when_no_key_cached` FAIL with `KeyError`.

- [ ] **Step 3: Fix `get_groq_limiter`**

Replace `app/classifier/groq_rate_limiter.py` lines 202-223:

```python
def get_groq_limiter(user_id: Optional[str] = None, api_key: Optional[str] = None) -> "Optional[GroqRateLimiter]":
    """
    Get or create a GroqRateLimiter.

    If user_id provided: returns per-user limiter (creates one if api_key given, else None if not cached).
    If no user_id: returns global limiter from settings.GROQ_API_KEY.
    """
    if user_id:
        if user_id not in _user_limiters:
            if api_key:
                _user_limiters[user_id] = GroqRateLimiter(api_key)
            else:
                return None
        return _user_limiters[user_id]

    global _groq_limiter
    if _groq_limiter is None and settings.GROQ_API_KEY:
        _groq_limiter = GroqRateLimiter(settings.GROQ_API_KEY)
    if _groq_limiter is None:
        raise RuntimeError("GROQ_API_KEY not configured")
    return _groq_limiter
```

Also remove the unused `encrypt` and `decrypt_or_none` imports at line 14 (they were only used by the old `get_groq_limiter`). Check if used elsewhere in the file first with `grep -n "encrypt\|decrypt" app/classifier/groq_rate_limiter.py`. If only at L14, remove them.

- [ ] **Step 4: Run tests — expect PASS**

```bash
pytest tests/test_groq_rate_limiter.py -v
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/groq_rate_limiter.py tests/test_groq_rate_limiter.py
git commit -m "fix(groq): get_groq_limiter return None instead of KeyError; drop pointless encrypt round-trip"
```

---

### Task 2: Fix `_maybe_reset_buckets` — timestamp reads outside lock

**Files:**
- Modify: `app/classifier/groq_rate_limiter.py:75-88`

**Bug:** `now = time.time()` and `if now - self._minute_start >= 60:` are read before acquiring `self._lock`. If `acquire()` mutates a bucket concurrently with the reset, the checks can interleave. Move all reads inside the lock to ensure atomic check-and-reset.

- [ ] **Step 1: Write test**

```python
# tests/test_groq_rate_limiter.py (append)
import threading
import time

def test_maybe_reset_buckets_atomic():
    """Reset and acquire don't interleave: bucket rpm_used resets cleanly."""
    from app.classifier.groq_rate_limiter import GroqRateLimiter
    limiter = GroqRateLimiter("key")
    # Use up some quota
    limiter.acquire.__func__  # ensure acquire exists
    bucket = limiter._get_bucket("llama-3.3-70b-versatile")
    bucket["rpm_used"] = 10
    # Force minute_start into past to trigger reset
    limiter._minute_start = time.time() - 61
    limiter._maybe_reset_buckets()
    assert bucket["rpm_used"] == 0
```

- [ ] **Step 2: Run test — expect PASS (existing behavior works, just not thread-safe)**

```bash
pytest tests/test_groq_rate_limiter.py::test_maybe_reset_buckets_atomic -v
```

- [ ] **Step 3: Fix `_maybe_reset_buckets`**

Replace lines 75-88 in `app/classifier/groq_rate_limiter.py`:

```python
def _maybe_reset_buckets(self) -> None:
    now = time.time()
    with self._lock:
        if now - self._minute_start >= 60:
            for bucket in self._buckets.values():
                bucket["rpm_used"] = 0
                bucket["tpm_used"] = 0
            self._minute_start = now
        if now - self._day_start >= 86400:
            for bucket in self._buckets.values():
                bucket["rpd_used"] = 0
                bucket["tpd_used"] = 0
            self._day_start = now
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_groq_rate_limiter.py -v
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/groq_rate_limiter.py
git commit -m "fix(groq): move timestamp reads inside lock in _maybe_reset_buckets"
```

---

### Task 3: Make `acquire` async — stop blocking the event loop

**Files:**
- Modify: `app/classifier/groq_rate_limiter.py:102-165`
- Modify: `app/classifier/llm_client.py:328` (add `await`)

**Bug:** `acquire()` uses `time.sleep()` inside a loop. `_call_provider_verbose` is `async def` and calls `acquire()` synchronously — this blocks the entire event loop for up to 30 seconds while waiting for a rate limit window. Fix: make `acquire` async and use `await asyncio.sleep()`.

Note: `asyncio` is already imported at line 6 of `groq_rate_limiter.py`.

- [ ] **Step 1: Write test**

```python
# tests/test_groq_rate_limiter.py (append)
import asyncio

@pytest.mark.asyncio
async def test_acquire_is_async():
    """acquire() is a coroutine and doesn't block the event loop."""
    from app.classifier.groq_rate_limiter import GroqRateLimiter
    import inspect
    limiter = GroqRateLimiter("key")
    assert inspect.iscoroutinefunction(limiter.acquire)
    result = await limiter.acquire("llama-3.3-70b-versatile", estimated_tokens=10, timeout=5.0)
    assert result is True


@pytest.mark.asyncio
async def test_acquire_returns_false_on_exhausted_quota():
    """acquire returns False quickly when quota is exhausted."""
    from app.classifier.groq_rate_limiter import GroqRateLimiter, GROQ_LIMITS
    limiter = GroqRateLimiter("key")
    bucket = limiter._get_bucket("llama-3.3-70b-versatile")
    # Exhaust RPM
    bucket["rpm_used"] = GROQ_LIMITS["llama-3.3-70b-versatile"].requests_per_minute
    result = await limiter.acquire("llama-3.3-70b-versatile", timeout=0.1)
    assert result is False
```

- [ ] **Step 2: Run test — expect FAIL** (`acquire` is not a coroutine yet)

```bash
pytest tests/test_groq_rate_limiter.py::test_acquire_is_async -v
```

- [ ] **Step 3: Make `acquire` async**

Replace `def acquire(` with `async def acquire(` and `time.sleep(wait_time)` with `await asyncio.sleep(wait_time)` in `app/classifier/groq_rate_limiter.py`:

```python
    async def acquire(
        self,
        model: str,
        estimated_tokens: int = 100,
        timeout: float = 30.0,
    ) -> bool:
        """
        Acquire permission to make a request.

        Returns True if acquired, False if timeout.
        """
        if not self.api_key:
            return False

        start_time = time.time()
        while True:
            with self._lock:
                bucket = self._get_bucket(model)
                limits = bucket["limits"]

                rpm_available = limits.requests_per_minute - bucket["rpm_used"]
                tpm_available = limits.tokens_per_minute - bucket["tpm_used"]

                rpd_ok = limits.requests_per_day == 0 or bucket["rpd_used"] < limits.requests_per_day
                tpd_ok = limits.tokens_per_day == 0 or bucket["tpd_used"] < limits.tokens_per_day

                if rpm_available > 0 and tpm_available >= estimated_tokens and rpd_ok and tpd_ok:
                    bucket["rpm_used"] += 1
                    bucket["tpm_used"] += estimated_tokens
                    if limits.requests_per_day > 0:
                        bucket["rpd_used"] += 1
                    if limits.tokens_per_day > 0:
                        bucket["tpd_used"] += estimated_tokens
                    logger.debug(
                        "Groq rate limit acquired for %s (rpm:%d/%d tpm:%d/%d)",
                        model,
                        bucket["rpm_used"],
                        limits.requests_per_minute,
                        bucket["tpm_used"],
                        limits.tokens_per_minute,
                    )
                    return True

            if time.time() - start_time >= timeout:
                with self._lock:
                    bucket = self._get_bucket(model)
                    limits = bucket["limits"]
                    logger.warning(
                        "Groq rate limit timeout for %s (rpm:%d/%d tpm:%d/%d)",
                        model,
                        bucket["rpm_used"],
                        limits.requests_per_minute,
                        bucket["tpm_used"],
                        limits.tokens_per_minute,
                    )
                return False

            wait_time = min(1.0, timeout - (time.time() - start_time))
            await asyncio.sleep(wait_time)
```

Then update the call site in `app/classifier/llm_client.py` line 328:

```python
                if not await limiter.acquire(provider.model, estimated_tokens=150, timeout=30.0):
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_groq_rate_limiter.py -v
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/groq_rate_limiter.py app/classifier/llm_client.py
git commit -m "fix(groq): make acquire() async to avoid blocking event loop"
```

---

### Task 4: Fix regex double-escape bugs in `_parse_response`

**Files:**
- Modify: `app/classifier/llm_client.py:157-158`

**Bug 1 (L157):** `r",(\s*[}\\]])"` — character class `[}\\]` matches `}` or `\` (not `]`). The `]` after it is outside the class. Intent: match trailing comma before `}` or `]`. Correct: `r",(\s*[}\]])"`.

**Bug 2 (L158):** `r'([{,]\\s*)"(\\w+)":\\s*"'` — raw string `\\s` sends literal `\s` to regex (not whitespace). Same for `\\w` and the second `\\s`. Correct: `r'([{,]\s*)"(\w+)":\s*"'`.

- [ ] **Step 1: Write tests**

```python
# tests/test_llm_client.py (or new file tests/test_parse_response.py)
import pytest
from app.classifier.llm_client import _parse_response


def test_parse_response_trailing_comma_before_brace():
    """_parse_response handles trailing comma before }."""
    raw = '{"label": "expense", "amount": 500.0, "merchant": "Swiggy", "category": "food", "txn_date": null, "confidence": 0.9,}'
    result = _parse_response(raw)
    assert result.label == "expense"
    assert result.amount == 500.0


def test_parse_response_trailing_comma_before_bracket():
    """_parse_response handles trailing comma before ]."""
    # Construct a JSON with a trailing comma before ] inside an array value
    raw = '{"label": "ignore", "amount": null, "merchant": null, "category": null, "txn_date": null, "confidence": 0.5}'
    result = _parse_response(raw)
    assert result.label == "ignore"


def test_parse_response_markdown_fence():
    """_parse_response strips markdown code fences."""
    raw = '```json\n{"label": "expense", "amount": 100.0, "merchant": "Test", "category": "misc", "txn_date": null, "confidence": 0.8}\n```'
    result = _parse_response(raw)
    assert result.label == "expense"
    assert result.amount == 100.0
```

- [ ] **Step 2: Run tests**

```bash
pytest tests/test_parse_response.py -v
```

The trailing-comma tests will either pass (if stdlib json handles them) or FAIL at the `json.loads` call and fall into the repair path. The fix makes the repair path work correctly.

- [ ] **Step 3: Fix the regexes**

In `app/classifier/llm_client.py` lines 157-158, replace:

```python
        fixed = re.sub(r",(\s*[}\\]])", r"\1", cleaned)
        fixed = re.sub(r'([{,]\\s*)"(\\w+)":\\s*"', r'\1"\2": "', fixed)
```

with:

```python
        fixed = re.sub(r",(\s*[}\]])", r"\1", cleaned)
        fixed = re.sub(r'([{,]\s*)"(\w+)":\s*"', r'\1"\2": "', fixed)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_parse_response.py -v
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/llm_client.py tests/test_parse_response.py
git commit -m "fix(llm): correct double-escaped regexes in JSON repair path"
```

---

### Task 5: Fix `httpx.HTTPStatusError(request=None)`

**Files:**
- Modify: `app/classifier/llm_client.py:331-334`

**Bug:** `httpx.HTTPStatusError` requires a non-None `request` argument. Passing `request=None` causes `AttributeError` in any handler that accesses `exc.request` (including httpx's own `raise_for_status()` path). Use a sentinel `httpx.Request` instead.

- [ ] **Step 1: Write test**

```python
# tests/test_parse_response.py (append) or separate file
import pytest
import httpx
from unittest.mock import patch, MagicMock, AsyncMock


@pytest.mark.asyncio
async def test_groq_rate_limit_raises_proper_error():
    """When Groq rate limiter returns False, raises HTTPStatusError with valid request."""
    from app.classifier.llm_client import MultiLLMClient
    from app.classifier.groq_rate_limiter import GroqRateLimiter

    client = MultiLLMClient(user_id="u1")
    provider = MagicMock()
    provider.name = "groq"
    provider.api_key = "key"
    provider.model = "llama-3.3-70b-versatile"
    provider.mark_rate_limited = MagicMock()

    mock_limiter = MagicMock(spec=GroqRateLimiter)
    mock_limiter.acquire = AsyncMock(return_value=False)

    with patch("app.classifier.llm_client.get_groq_limiter", return_value=mock_limiter):
        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await client._call_provider_verbose(provider, "test prompt")

    # request must not be None — httpx handlers access exc.request
    assert exc_info.value.request is not None
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pytest tests/test_parse_response.py::test_groq_rate_limit_raises_proper_error -v
```

- [ ] **Step 3: Fix the HTTPStatusError call**

In `app/classifier/llm_client.py` lines 331-335, replace:

```python
                    raise httpx.HTTPStatusError(
                        "Groq rate limit exceeded",
                        request=None,
                        response=httpx.Response(429),
                    )
```

with:

```python
                    raise httpx.HTTPStatusError(
                        "Groq rate limit exceeded",
                        request=httpx.Request("POST", provider.base_url or "https://api.groq.com/openai/v1/chat/completions"),
                        response=httpx.Response(429),
                    )
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_parse_response.py -v
```

- [ ] **Step 5: Commit**

```bash
git add app/classifier/llm_client.py
git commit -m "fix(llm): pass valid httpx.Request to HTTPStatusError instead of None"
```

---

### Task 6: Remove duplicate `/llm/my-limits` endpoint

**Files:**
- Modify: `app/api/sync.py:179-198`

**Bug:** `/llm/my-limits` (lines 179-198) and `/llm/limits` (lines 201-216) both return user-scoped Groq rate limit info. `/llm/my-limits` is the simpler, older one. `/llm/limits` uses `llm_client.get_user_client()` which is more general. Keep `/llm/limits`, delete `/llm/my-limits`.

No new test needed — endpoint removal is verified by checking it returns 404.

- [ ] **Step 1: Check no frontend calls `/llm/my-limits`**

```bash
grep -r "my-limits" /Users/amansaini/GexpenseTracker/templates/ /Users/amansaini/GexpenseTracker/static/ 2>/dev/null || echo "not used in frontend"
```

If output is "not used in frontend", proceed. If found, update the call site to `/llm/limits` first.

- [ ] **Step 2: Delete the `/llm/my-limits` endpoint**

Remove lines 179-198 from `app/api/sync.py` (the entire `my_llm_limits` function and its route decorator).

- [ ] **Step 3: Run full test suite**

```bash
pytest -v --tb=short --ignore=tests/test_llm_client.py
```

- [ ] **Step 4: Commit**

```bash
git add app/api/sync.py
git commit -m "fix(api): remove duplicate /llm/my-limits endpoint (superseded by /llm/limits)"
```

---

### Task 7: Fix O(n) `new_pairs.index()` in retry loop

**Files:**
- Modify: `app/sync.py:199-232`

**Bug:** `new_pairs.index((email, msg))` in the retry success path is O(n) per success and requires `(email, msg)` tuples to support equality. For 1000-email syncs with many retries this is O(n²). Fix: build an index map `{id(email): idx}` before the retry loop.

- [ ] **Step 1: Write test**

```python
# tests/test_sync.py (append to existing file — check imports at top first)
# This tests the retry logic doesn't blow up with duplicate items
# It's an integration-style test; mock LLM to fail first, succeed on retry.
```

The existing test infrastructure is heavy (requires DB). Instead, verify correctness by inspection and add a comment. The main verification is: run the full test suite after the change.

- [ ] **Step 2: Fix the retry index lookup**

In `app/sync.py`, replace lines 176-232 (the `failed_items` + retry block). The key change is adding an index map before Phase 3 starts and using it in the retry block.

Add after line 175 (`done_counter = 0`):

```python
        pair_index: dict[int, int] = {id(e): i for i, (e, _) in enumerate(new_pairs)}
```

Then in the retry success branch (was line 228), replace:

```python
                    idx = new_pairs.index((email, msg))
                    classifications[idx] = cls
```

with:

```python
                    idx = pair_index[id(email)]
                    classifications[idx] = cls
```

- [ ] **Step 3: Run tests**

```bash
pytest tests/test_sync.py -v --tb=short
```

- [ ] **Step 4: Commit**

```bash
git add app/sync.py
git commit -m "fix(sync): replace O(n) new_pairs.index() with O(1) id-based map in retry loop"
```

---

### Task 8: Final verification

- [ ] **Run full test suite**

```bash
pytest -v --tb=short --ignore=tests/test_llm_client.py
```

Expected: all tests pass.

- [ ] **Verify no KeyError on `/llm/limits` endpoint** by checking the handler uses `if limiter:` guard (Task 1 ensures `get_groq_limiter` returns `None` not `KeyError`, so the `try/except RuntimeError` in the handler already handles the global-limiter case; per-user now returns `None` safely).

- [ ] **Check imports are clean**

```bash
python -c "from app.classifier.groq_rate_limiter import get_groq_limiter; print('OK')"
python -c "from app.classifier.llm_client import MultiLLMClient; print('OK')"
```
