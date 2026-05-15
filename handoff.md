# Session Handoff — 2026-05-14

## Summary
Continued UI polish, LLM prompt improvements, and feature additions across MoneyFlow.

## What We Did

### UI Fixes
- **Mobile sidebar scroll**: Added `overflowY: "auto"` to sidebar (`shell.jsx`) so theme options are reachable on short screens
- **Bulk reclassify amount fix**: `bulkAccept` in `inbox.jsx` was missing `amount` in `setTransactions` — fixed
- **Dead Filter button removed**: Static button with no `onClick` in topbar (`app.jsx`)
- **Sidebar filter counts fix**: Removed `label` filter from `loadData`/`loadMore` API calls — counts now computed from full set instead of collapsing to zero on tab switch

### LLM Prompt Improvements (`app/classifier/llm_client.py`)
- Added investment/SIP detection (INVESTMENT section)
- Added insurance premium detection (INSURANCE section)
- Added merchant mappings: BUNDL TECHNOLOGIES → Swiggy, ZOMATO ONLINE → Zomato
- Added payment gateway warning (Razorpay, Billdesk are NOT merchants)
- Added parent-company body-scan instruction
- Food delivery additions tried then **reverted** — delivery notifications are IGNORE
- **Structural merge**: Replaced `_SYSTEM`, `_USER_TEMPLATE`, `_BATCH_USER_TEMPLATE` with merged version combining step-based priority/safety/confidence from external prompt + retained full Indian patterns

### Find Recurring Feature
- `chat()` method on `MultiLLMClient` (generic LLM call, `system_override` param)
- `POST /api/recurring/find-from-transactions` endpoint in `app/api/recurring.py`
- "Find Recurring" button + suggestions modal in `recurring.jsx`

### Asked & Verified
- **Duplicate detection on re-scan**: Already running at `sync.py:295-302` — `detect_and_record_duplicates` called for every new transaction in Phase 4b. No change needed.

## Key Decisions
- Delivery notifications → always IGNORE (actual payment captured by separate bank/UPI debit email)
- Savings/discount numbers ("₹145 saved") → promotional, NOT amounts
- Payment gateways (Razorpay, Billdesk etc.) → NOT merchants
- Merged prompt: new structure (steps, priority rules, safety rules, confidence table) + retained Indian patterns (UPI, IMPS/NEFT, CC, SIP, insurance, ATM, e-commerce)
- `chat()` uses `system_override` param; classify methods continue using `_SYSTEM` constant

## Relevant Files
| File | What changed |
|------|-------------|
| `static/src/shell.jsx` | Sidebar `overflowY: "auto"` |
| `static/src/inbox.jsx` | `bulkAccept` amount fix |
| `static/src/app.jsx` | Filter counts fix, dead Filter button removed |
| `static/src/recurring.jsx` | Find Recurring button + modal |
| `app/classifier/llm_client.py` | Merged prompt, `chat()` method, `system_override` |
| `app/api/recurring.py` | `POST /recurring/find-from-transactions` |
| `app/sync.py` | Dedup already wired at Phase 4b (295-302) |

## Next Steps
- Verify dedup runs on re-scan path in case of `run_sync_range` as well (it does — lines 475-480)
- Consider `e` (edit amount) and `c` (classify) keyboard shortcuts
- Consider orphaned `DuplicatePair` cleanup on bulk delete
- Monitor prompt accuracy with new merged templates after production runs

## Known Issues / Concerns
- None blocking
