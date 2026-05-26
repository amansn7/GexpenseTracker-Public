# Data Export & Portability Review

> Review of what data MoneyFlow can export and what's missing.
> GexpenseTracker/MoneyFlow — May 25, 2026

## 1. Currently Exportable Data

### CSV Transaction Export

**Endpoint**: `GET /api/transactions/export`
**File**: `app/api/transactions.py:432-469`

**Export columns** (from `EXPORT_COLUMNS` at line 336):
```
id, label, amount, currency, merchant, category, txn_date,
confidence, status, classifier_method, user_notes, read, flagged,
email_subject, email_sender, email_received_at, gmail_link, created_at
```

**Filters available**:
- `date_from` / `date_to`: Date range filter
- `label`: Filter by transaction label (expense/income/ignore)

**Limits**:
- Max 10,000 rows without date range filter (returns HTTP 422)
- Streaming response (batches of 1,000 rows)
- X-Row-Count header with total count
- Warning header if > 5,000 rows

**What it exports**: Transaction records with associated email metadata (subject, sender, date, Gmail link). This covers the core financial data users care about.

## 2. What's Missing from Export

| Data type | Exportable? | Notes |
|-----------|-------------|-------|
| **Transactions** | ✅ Full CSV export | With email context |
| **Email content** | ❌ Not exported | Only subject/sender/date/Gmail link included |
| **Categories/user overrides** | ❌ Not exported | Custom categories and merchant aliases stay in DB |
| **User settings** | ❌ Not exported | Theme, preferences, allowlist, notification settings |
| **Budgets** | ❌ Not exported | Budget targets and progress |
| **Recurring expenses** | ❌ Not exported | Recurring transaction templates |
| **Debts** | ❌ Not exported | Debt tracking entries |
| **Goals** | ❌ Not exported | Savings goals and contributions |
| **User profile** | ❌ Not exported | Name, avatar, preferences |
| **Classification logs** | ❌ Not exported | Historical classification decisions |
| **Connected accounts** | ❌ Not exported | Gmail account connections |
| **All emails** | ❌ Not exported | Only the associated email metadata per transaction |
| **Sender rules** | ❌ Not exported | Custom classification rules |
| **Merchant aliases** | ❌ Not exported | User-defined merchant name overrides |

## 3. Account Deletion Coverage

From `app/api/settings.py:_delete_user_data()` (line 652-715), account deletion covers:

| Table | Deleted? | Notes |
|-------|----------|-------|
| `users` | ✅ | User row deleted |
| `emails` | ✅ | All associated emails deleted |
| `transactions` | ✅ | Cascade from emails |
| `classification_log` | ✅ | FK to emails |
| `connected_accounts` | ✅ | OAuth tokens deleted |
| `user_settings` | ✅ | |
| `user_profiles` | ✅ | |
| `user_categories` | ✅ | |
| `user_ai_services` | ✅ | LLM API keys deleted |
| `sessions` | ✅ | |
| `sync_state` | ✅ | |
| `sync_progress` | ✅ | |
| `send_rules` / `filter_rules` | ✅ | |
| `merchant_aliases` | ✅ | |
| `budgets` / `debts` / `recurring_expenses` | ✅ | |
| `goals` / `goal_contributions` | ✅ | |
| `audit_logs` | ✅ | |
| `llm_spend_tracker` | ✅ | |

**Gap**: `data/gmail_token.json` (file-based token) is NOT cleaned up by `_delete_user_data()`. If this file exists, it would persist after DB-level account deletion.

## 4. Recommendations for Data Portability

### High Priority
1. **Add full data export endpoint** — Create `GET /api/account/export-all` that returns a ZIP or JSON bundle containing:
   - Transactions (already done via CSV)
   - Emails (JSON: subject, body, sender, date for all emails)
   - User settings (JSON)
   - Budgets, recurring expenses, debts, goals
   - Categories and merchant aliases
   - Sender rules

2. **Clean up file-based token on deletion** — Extend `_delete_user_data()` to remove `data/gmail_token.json` if it exists:
   ```python
   token_file = Path("data/gmail_token.json")
   if token_file.exists():
       token_file.unlink()
   ```

### Medium Priority
3. **Add categorization overrides to export** — Include `user_categories`, `merchant_aliases`, and `merchant_entity_aliases` in a structured JSON export format to allow users to port their custom classification setup to a new instance.

4. **Add import endpoint** — Corresponding `POST /api/account/import` that can ingest the export bundle, allowing users to migrate between self-hosted instances.

### Low Priority
5. **Incremental/API-based export** — Paginated JSON API endpoints for each data type so third-party tools can programmatically access all user data.

6. **Scheduled automated export** — Periodic email or download-link delivery of export bundle.

## Summary

| Aspect | Status | Action Needed |
|--------|--------|---------------|
| Transaction CSV export | ✅ Implemented | Good; includes email context |
| Full data export | ❌ Missing | New endpoint needed |
| gmail_token.json cleanup | ⚠️ Missing | Add to `_delete_user_data()` |
| Data import | ❌ Missing | New endpoint needed (lower priority) |
| Export for all data types | ❌ Partial | Transaction only; settings, budgets, etc. missing |
| GDPR data portability compliance | ⚠️ Partial | Transaction export exists; full bundle needed |
