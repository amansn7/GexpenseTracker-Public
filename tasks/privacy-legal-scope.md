# Privacy Policy / Terms of Service Scope

> Data inventory and legal scoping for MoneyFlow public release.
> GexpenseTracker/MoneyFlow — May 25, 2026

## 1. Data Inventory

### What the app collects

| Data Category | Source | Storage Location | Purpose |
|--------------|--------|-----------------|---------|
| **Email metadata** (sender, subject, date) | Gmail API (`gmail.readonly`) | `emails` table (PostgreSQL) | Display transaction context |
| **Email body/content** | Gmail API (`gmail.readonly`) | `emails.body` column (nullable) | Transaction extraction |
| **Transaction data** (amount, merchant, category, date) | Extracted from emails + user input | `transactions` table | Core app functionality |
| **Gmail OAuth tokens** (access + refresh) | Google OAuth callback | `connected_accounts` table (encrypted via `app/crypto.py`) | Email sync |
| **LLM API keys** (Groq, Google AI, Grok, etc.) | User-provided in Settings | `user_ai_services` table (encrypted via `encrypt_ai_secret()`) | Classification enhancement |
| **User profile** (name, email, avatar URL) | Google userinfo endpoint | `users` + `user_profiles` tables | Account management |
| **User settings** (theme, preferences, allowlist) | User interaction | `user_settings` table | Personalization |
| **Category overrides** | User edits | `user_categories`, `merchant_aliases` tables | Custom classification |
| **Classification logs** | System | `classification_log` table | Debugging audits |

### What is NOT collected
- No analytics or telemetry
- No advertising data
- No browsing history outside Gmail
- No location data
- No contacts/address book

## 2. Data Storage & Encryption

### Encryption at rest
| Secret type | Encryption method | Location |
|------------|------------------|----------|
| Gmail OAuth access token | Fernet (symmetric) via `encrypt_secret()` | `connected_accounts.access_token` |
| Gmail OAuth refresh token | Fernet via `encrypt_secret()` | `connected_accounts.refresh_token` |
| TOTP 2FA secret | Fernet via `encrypt_secret()` | `users.totp_secret` |
| LLM API keys | Fernet via `encrypt_ai_secret()` | `user_ai_services.*_api_key` |

Reference: `app/crypto.py` — uses `cryptography.fernet.Fernet` with key derived from `FERNET_KEY` env var.

### Key management
- All encryption keys come from environment variables (`FERNET_KEY`)
- `FERNET_KEY` is set by the deployer (must be 32-byte url-safe base64)
- If `FERNET_KEY` is not valid base64, `app/crypto.py` falls back to SHA-256 derivation (line 20-21)

### Database
- PostgreSQL (production) or SQLite (dev) — operator-managed
- No encryption at rest at the application level (relying on database/filesystem encryption)

## 3. Data Retention

| Data type | Retention | Mechanism |
|-----------|-----------|-----------|
| Emails | Indefinite (until user deletes account) | No automatic purge |
| Transactions | Indefinite | No automatic purge |
| OAuth tokens | Indefinite (until user disconnects/reconnects Gmail) | Refresh tokens live until revoked by user or Google |
| Sync metadata | Indefinite | `sync_state`, `sync_progress` tables |
| Synced auth tokens | Until replaced/re-authenticated | Stored in `gmail_token.json` (file) and `connected_accounts` (DB) |
| Sessions | 30 days (`SESSION_DAYS` in `app/api/auth.py:69`) | Cookie expires, DB row can be deleted |
| OAuth states | 10 minutes (`OAUTH_STATE_MINUTES` line 70) | Purged on use or expiry |
| Audit logs | Indefinite (deleted with account) | `audit_logs` table |

**Config**: `SYNC_INTERVAL_HOURS=2` in `.env.example` controls sync frequency, but not retention.

## 4. Account Deletion

Defined in `app/api/settings.py:_delete_user_data()` (line 652-715).

### Deletion flow
1. **Schedule deletion** (`PATCH /account/schedule-deletion`): 24-48 hour grace period, user signed out
2. **Cancel deletion** (`POST /account/cancel-deletion`): Available during grace period
3. **Immediate deletion** (`DELETE /account`): No grace period (admin/compat)

### What gets deleted (complete list)

| Category | Tables cleared |
|----------|---------------|
| Auth & sessions | `connected_accounts`, `sessions`, `refresh_token_blacklist`, `device_tokens`, `oauth_states` |
| User data | `users`, `user_profiles`, `user_settings`, `user_categories` |
| Financial data | `transactions`, `transaction_corrections`, `budgets`, `debts`, `recurring_expenses` |
| Email data | `emails`, `classification_log`, `duplicate_pairs` |
| Settings & rules | `user_ai_services`, `sender_rules`, `filter_rules`, `merchant_aliases`, `merchant_entity_aliases`, `user_merchant_overrides` |
| Sync state | `sync_state`, `sync_progress` |
| Goals | `goals`, `goal_contributions` |
| Analytics | `audit_logs`, `llm_spend_tracker` |

**Gmail token file**: `data/gmail_token.json` is NOT deleted by the application-level deletion. The operator must clean this up or the `_delete_user_data()` should be extended to remove it.

## 5. Third-Party Data Sharing

### Gmail API (Google)
- **Data shared**: Email metadata and content from the user's Gmail inbox
- **Legal basis**: User initiates OAuth flow and grants consent
- **Scope**: `gmail.readonly` — read-only access
- **Google's policy**: Subject to Google's Limited Use requirements
- **Data use**: Transaction extraction only; no AI training on email data

### LLM Providers (user-configured)
- **Data shared**: Email content (subject, body, sender) for transaction classification
- **Providers**: Groq, Google AI, Gemini, xAI Grok, Scaleway, OpenRouter (user's choice)
- **User control**: Provider selection, model selection, API key management in Settings
- **No default provider**: User must configure at least one LLM key for AI classification
- **Fallback**: Rule-based classification works without any LLM provider

### Not shared
- No third-party analytics trackers
- No advertising networks
- No data brokers
- No social media platforms

## 6. Draft Outline — Privacy Policy

```
1. Introduction
   - App name: MoneyFlow
   - Self-hosted nature
   - This policy describes data practices for your instance

2. Information We Collect
   2.1 Email and Transaction Data (via Gmail API)
   2.2 Account Information (name, email, avatar)
   2.3 User-Provided API Keys (LLM providers)
   2.4 User Preferences and Settings

3. How We Use Data
   3.1 Transaction Extraction and Classification
   3.2 Account Management
   3.3 LLM-Assisted Categorization (only with user-provided keys)

4. Data Storage and Security
   4.1 Encryption Practices
   4.2 Database Storage
   4.3 Key Management

5. Data Sharing and Disclosure
   5.1 Google (Gmail API — read-only)
   5.2 LLM Providers (optional, user-configured)
   5.3 No Third-Party Analytics or Advertising

6. Data Retention
   6.1 Retention Periods
   6.2 Account Deletion Process

7. Your Rights
   7.1 Access and Export
   7.2 Deletion
   7.3 Revoking Google Access

8. Changes to This Policy

9. Contact Information
```

## Draft Outline — Terms of Service

```
1. Acceptance of Terms
2. Description of Service
   - Self-hosted expense tracking
   - Gmail integration
   - LLM classification
3. User Responsibilities
   - API key security
   - Compliance with laws
   - Acceptable use
4. Account Terms
   - Registration
   - Account deletion
5. Data Privacy (cross-reference Privacy Policy)
6. Limitation of Liability
7. Disclaimer of Warranties
8. Open Source License
9. Changes to Terms
10. Contact
```

## Next Steps

- [ ] Draft full Privacy Policy from outline above
- [ ] Draft full Terms of Service from outline above
- [ ] Add `data/gmail_token.json` cleanup to `_delete_user_data()`
- [ ] Host policies at `/privacy` and `/terms` endpoints (static or template-rendered)
- [ ] Link policies from login page and OAuth consent screen configuration
