---
name: classifier-audit
description: Use when working on email classification, extraction, provider fallback, merchant normalization, pre-filtering, or rule-vs-LLM behavior in MoneyFlow. Covers `app/classifier/`, classifier-related API flows, and the matching tests. Prefer this skill for bugs, audits, refactors, and feature work involving expense parsing quality or LLM response handling.
---

# Classifier Audit

Use this skill for work in:

- `app/classifier/`
- classifier-driven paths in `app/sync.py` and `app/api/emails.py`
- tests such as `tests/test_classifier.py`, `tests/test_batch_classifier.py`, `tests/test_pre_filter.py`, `tests/test_llm_client.py`, `tests/test_parse_response.py`, and `tests/test_merchant.py`

## Workflow

1. Start with the graph if available. Find the exact entrypoint and blast radius before reading files broadly.
2. Separate the problem into one of these buckets:
   - label decision: expense/income/ignore classification
   - extraction: amount, merchant, category, date parsing
   - fallback/routing: rules, pre-filter, LLM provider choice, retry behavior
   - normalization: merchant/category cleanup and storage
3. Read the narrowest relevant code path only after identifying the bucket.
4. Check the paired tests before editing. Prefer extending existing classifier tests over adding brand-new test files.
5. When changing parsing or fallback behavior, verify failure modes explicitly:
   - malformed JSON
   - array-vs-object responses
   - partial batch responses
   - count mismatch
   - provider failure / timeout / rate limit
   - rule hit with extraction fallback

## Project-specific rules

- Preserve the rule-engine-first model unless the task explicitly changes product behavior.
- Treat silent padding/truncation and fallback defaults as high-risk areas; they can hide production misclassification.
- Prefer deterministic helper extraction over duplicating parsing logic across files.
- If a fix changes classifier semantics, update or add the closest targeted test first.

## Useful files

- `app/classifier/classifier.py`
- `app/classifier/llm_client.py`
- `app/classifier/pre_filter.py`
- `app/classifier/merchant.py`
- `app/classifier/transaction_extractor.py`
- `app/classifier/rules.py`
- `tests/test_batch_classifier.py`
- `tests/test_classifier.py`
- `tests/test_pre_filter.py`
- `tests/test_parse_response.py`
- `tests/test_llm_client.py`

## Output expectations

- State which classifier bucket was affected.
- Name the concrete failure mode.
- List the exact tests run or the test gap if you could not run them.
