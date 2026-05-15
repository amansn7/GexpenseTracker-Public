# MoneyFlow — Product Requirements Document

## 1. Vision

**Inbox for your money.** MoneyFlow turns Gmail purchase receipts into an organized expense dashboard — automatically, without manual data entry.

### Problem

Tracking personal expenses is tedious and error-prone. People receive dozens of financial emails per month (bank alerts, invoices, receipts, UPI confirmations, credit card bills) but have no systematic way to extract, categorize, and review this data. Existing solutions require manual entry or bank API access that excludes cash/UPI transactions.

### Solution

MoneyFlow connects to Gmail via OAuth, fetches transaction emails, classifies them using a two-stage rule engine + LLM pipeline, and presents a clear inbox-to-dashboard experience. Users get organized spending data without entering a single transaction.

### Target Audience

- Indian consumers managing personal finances
- Users who receive 10+ financial emails/month (bank alerts, UPI, e-commerce)
- Freelancers and self-employed tracking income from payment notifications
- Budget-conscious individuals who want a monthly spending overview in under 30 seconds

---

## 2. User Personas

### Persona A — The Salary Spender (Primary)

- **Name:** Priya, 31, Product Manager in Bangalore
- **Pain:** Has 50+ expense emails/month from Swiggy, Zomato, Amazon, Uber, ICICI alerts. Knows she spends too much but has no aggregated view.
- **Goal:** See where money goes each month without manual tracking.
- **Flow:** Sign up → connect Gmail → sync runs automatically → checks dashboard once a week → occasionally corrects a misclassified transaction.
- **Key metric:** "I understand my spending in 30 seconds."

### Persona B — The Freelancer

- **Name:** Ravi, 28, Freelance Designer in Mumbai
- **Pain:** Mix of business income (Razorpay, PayPal) and personal expenses in the same inbox. Needs income tracking for tax purposes.
- **Goal:** Separately track income and expenses, export data.
- **Flow:** Connects Gmail, flags income from client payment emails, uses Reports view for monthly summaries. Reviews the review queue for low-confidence items.
- **Key metric:** "I can export my annual income/expense breakdown."

### Persona C — The Budgeter

- **Name:** Anjali, 35, Operations Manager in Delhi
- **Pain:** Tries to stay within category budgets (food, shopping, subs) but has no live tracking.
- **Goal:** Set monthly budgets per category and get alerts when approaching limits.
- **Flow:** Sets up budgets in Settings → reviews Inbox daily → checks Dashboard for burn rate → adjusts spending.
- **Key metric:** "I stay within budget 3+ months in a row."

---

## 3. Core Workflows

### 3.1 Onboarding

```
Landing → Google OAuth → Scan inbox (first sync) → Dashboard
                                         │
                                    [Progress bar with email count]
```

- First-time user authenticates via Google
- Backend creates User, UserProfile, UserSettings, default categories
- Frontend shows scanning progress (emails found → analyzing → done)
- On completion, lands on Inbox view with parsed transactions

### 3.2 Daily Sync

```
Scheduler (every N hours) → Gmail API (incremental history)
    → Pre-filter (allowlist/blocklist/keyword)
    → Rule engine (domain lookup + keyword scoring)
    → [if uncertain] LLM fallback (multi-provider queue)
    → Write Transaction rows → Duplicate detection → Merchant alias update
```

- Runs automatically based on `SYNC_INTERVAL_HOURS` (default: 2h)
- Can be triggered manually via "Re-scan" button in topbar
- Progress is polled by frontend via `/api/sync/progress`

### 3.3 Review & Correct

```
Inbox → Find low-confidence or needs-review item
    → Expand row → View email body + AI reasoning
    → Correct label/amount/merchant/category
    → Auto-learns: creates SenderRule + MerchantOverride
```

- Low-confidence transactions (status: `needs_review`) surface in a dedicated filter
- Single-click confirmation using keyboard shortcuts (E/I/S/Enter)
- Corrections train the system: domain → label mapping is persisted immediately

### 3.4 Monthly Check-in

```
Dashboard (first of month or weekly)
    → Hero: net position (income - expense)
    → Cumulative balance chart
    → Category breakdown (where did it go?)
    → Top merchants (who got my money?)
    → Budget progress (am I on track?)
```

- Monthly snapshot computed from transaction data
- Budget bars show overspent categories in red
- Health view shows savings rate and runway

---

## 4. Feature Inventory

### 4.1 Views (7 main screens)

| View | Route | Purpose | Key Components |
|---|---|---|---|
| **Inbox** | / (default) | Gmail-style transaction list with date grouping, detail panel, inline editing, bulk actions | `InboxView`, `TransactionRow`, `DetailPanel`, `CategoryChip`, `DateRangeControl`, filter chip bar, search |
| **Money Flow** | /flow | Sankey-style income→expense flow diagram, weekly burn, KPIs | `FlowView`, SVG flow chart, bar chart |
| **Dashboard** | /dashboard | Monthly snapshot, cumulative balance chart, KPIs, category breakdown, top merchants, budgets | `DashboardView`, line chart, KPI cards, bar chart, budget bars |
| **Health** | /health | Savings rate, runway months, monthly net bar chart | `HealthView`, bar chart (3/6/12m toggle) |
| **Reports** | /reports | 12-month monthly summary table with income/expense/net/savings-rate | `ReportsView`, table with colored badges |
| **Recurring** | /recurring | CRUD for subscriptions/fixed expenses, AI-powered suggestion | `RecurringView`, CRUD form, suggestion panel |
| **Debt** | /debt | CRUD for loans/EMIs/cards, progress bars, payoff goals | `DebtView`, progress bars, summary stats |

### 4.2 Global Features

| Feature | Description |
|---|---|
| **Search** | Cmd+K global search across merchants, categories, amounts, subjects. Results show transaction context inline. |
| **Date Range** | Preset buttons (7d/30d/90d/1y/All) + custom date pickers for all list views |
| **Category Filter** | Topbar dropdown filters every view by category. Also available in sidebar as nav items. |
| **Theme** | 3 themes: Paper (warm cream), Cool (gray-blue), Midnight (dark charcoal). Persisted in localStorage. |
| **Sync Indicator** | Green dot pill in topbar showing sync status ("Gmail · just now"). Animated cycling ping/bounce/glow. |
| **Keyboard Shortcuts** | Cmd+K (search), E/I/S (classify selected), Escape (close panel) |

### 4.3 Sync & Classification

| Feature | Details |
|---|---|
| **Gmail Sync** | Incremental via history IDs, 90-day fallback, paginated (500/page). Configurable filter: all/unread/read/financial. |
| **Pre-filter** | 3-tier: domain allowlist/blocklist → regex keyword scoring → LLM binary for ambiguous. Skips non-financial before classification. |
| **Rule Engine** | 18+ built-in domain rules (Zomato, Swiggy, Amazon, Uber, HDFC, ICICI, etc.) + DB-learned + keyword scoring across expense/income/ignore/CC-payment + delivery-only detection. |
| **LLM Classification** | Multi-provider priority queue with auto-fallback on 429. Batch classification (N emails per call). 7 repair strategies for malformed JSON. |
| **Merchant Normalization** | Regex clean → exact alias → fuzzy match (rapidfuzz WRatio). Persists learned aliases. |
| **Learning Loop** | User correction → SenderRule upsert + MerchantOverride. Bulk retrain from selected emails. Domain-level batch actions. |
| **Duplicate Detection** | 3 strategies: same-domain (same sender ±3d), cross-domain (different sender ±1d), investment flow (order+confirmation pair). |
| **Classification Audit** | Every LLM call logged with full raw response, provider, latency, model. Viewable in classification log. |

### 4.4 Account & Settings

| Feature | Details |
|---|---|
| **Authentication** | Google OAuth 2.0 with session cookies (30-day expiry). 2FA via TOTP (optional). |
| **Multi-user** | Owner allowlists emails → members join. Shared transaction data. |
| **Profile** | Name, phone, avatar, location, currency, timezone. Year-to-date stats. |
| **Settings** | Daily digest toggle, confidence thresholds, rule engine toggles, monthly AI budget, connected accounts, AI service configuration. |
| **Categories** | 8 built-in + unlimited user-defined. Color-coded. Auto-generate from transaction data. |
| **AI Services** | Per-user LLM provider config (provider, model, base URL, API key). Stored encrypted. Multiple providers with priority. |
| **Account Deletion** | Soft delete (24-48h delay with cancel). Hard delete immediate. Scheduled via settings. |
| **Admin (owner)** | Gmail fetch preview, classification test pipeline, LLM provider test, data reset, domain/sender rule inspection. |

### 4.5 Budgets

| Feature | Details |
|---|---|
| **Per-category monthly budgets** | CRUD via Settings. Spend tracking against current month. |
| **Progress bars** | Animated (scaleX transform) in Dashboard view and Inbox sidebar. |
| **Overspend indicators** | Red color when spent > limit. |

### 4.6 Duplicate Resolution

| Feature | Details |
|---|---|
| **Duplicate pairs** | Detected pairs surfaced in Inbox with dedicated filter. |
| **Resolution** | Keep one, discard other. Decision trains DomainPairRule learning loop. |
| **Auto-resolve** | At ≥85% confidence after ≥3 confirmations for a domain pair. |

---

## 5. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Classification accuracy | >90% auto-confirmed | `confirmed / total` API |
| Time to first transaction | <2 min after Gmail connect | Onboarding flow timing |
| Weekly active usage | >2 logins/week | Session activity |
| Correction rate | <10% of transactions | `corrected / total` |
| Sync reliability | >99% runs without error | Sync log analysis |
| Dashboard load time | <500ms | Browser DevTools |

---

## 6. Future Opportunities

| Opportunity | Description | Priority |
|---|---|---|
| **Mobile app** | React Native wrapper around API | High |
| **Bank API sync** | Direct via Yodlee/Finvu/FIU for accounts without email | Medium |
| **Multi-currency** | Auto-detect and convert to base currency | Medium |
| **Receipt scanning** | Camera OCR for paper receipts | Low |
| **Shared budgets** | Household/trip split with multiple users | Low |
| **SIP/investment tracking** | Integrate with CAS statements | Low |
| **Goal tracking** | Save towards specific targets (vacation, down payment) | Low |
| **Rule engine UI** | Visual rule builder instead of raw domain→label mapping | Low |
