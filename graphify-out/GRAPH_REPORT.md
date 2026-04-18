# Graph Report - .  (2026-04-18)

## Corpus Check
- 78 files · ~137,211 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 577 nodes · 1088 edges · 54 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 304 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Models & Rules|Core Models & Rules]]
- [[_COMMUNITY_App Core & Frontend Sync|App Core & Frontend Sync]]
- [[_COMMUNITY_Email Classification Engine|Email Classification Engine]]
- [[_COMMUNITY_Sync Pipeline & Scheduler|Sync Pipeline & Scheduler]]
- [[_COMMUNITY_Alert System|Alert System]]
- [[_COMMUNITY_Merchant Normalization|Merchant Normalization]]
- [[_COMMUNITY_Architecture & Bug History|Architecture & Bug History]]
- [[_COMMUNITY_Gmail Client|Gmail Client]]
- [[_COMMUNITY_Database Migrations|Database Migrations]]
- [[_COMMUNITY_Rule Engine|Rule Engine]]
- [[_COMMUNITY_Transaction UI Components|Transaction UI Components]]
- [[_COMMUNITY_ML Learning & Intelligence|ML Learning & Intelligence]]
- [[_COMMUNITY_Pattern Rule Engine|Pattern Rule Engine]]
- [[_COMMUNITY_Email API & Text Utils|Email API & Text Utils]]
- [[_COMMUNITY_OAuth Authentication|OAuth Authentication]]
- [[_COMMUNITY_Dashboard Analytics & Finance|Dashboard Analytics & Finance]]
- [[_COMMUNITY_Budget Management|Budget Management]]
- [[_COMMUNITY_Auth Service Core|Auth Service Core]]
- [[_COMMUNITY_Transaction API|Transaction API]]
- [[_COMMUNITY_Pattern Rules Migration|Pattern Rules Migration]]
- [[_COMMUNITY_Merchant Aliases Migration|Merchant Aliases Migration]]
- [[_COMMUNITY_Email Body Migration|Email Body Migration]]
- [[_COMMUNITY_Recurring Expenses Migration|Recurring Expenses Migration]]
- [[_COMMUNITY_Nullable Email ID Migration|Nullable Email ID Migration]]
- [[_COMMUNITY_Budgets Migration|Budgets Migration]]
- [[_COMMUNITY_Initial Schema|Initial Schema]]
- [[_COMMUNITY_Email Filter Migration|Email Filter Migration]]
- [[_COMMUNITY_Dev Tooling Config|Dev Tooling Config]]
- [[_COMMUNITY_LLM Client Status|LLM Client Status]]
- [[_COMMUNITY_Domain Extraction Test|Domain Extraction Test]]
- [[_COMMUNITY_Feature Classifier Tests|Feature Classifier Tests]]
- [[_COMMUNITY_Stats Month Helper|Stats Month Helper]]
- [[_COMMUNITY_Module Init|Module Init]]
- [[_COMMUNITY_Module Init|Module Init]]
- [[_COMMUNITY_LLM Priority Scoring|LLM Priority Scoring]]
- [[_COMMUNITY_Module Init|Module Init]]
- [[_COMMUNITY_Module Init|Module Init]]
- [[_COMMUNITY_Module Init|Module Init]]
- [[_COMMUNITY_Scheduler|Scheduler]]
- [[_COMMUNITY_Verbose Classifier|Verbose Classifier]]
- [[_COMMUNITY_Verbose Extractor|Verbose Extractor]]
- [[_COMMUNITY_Auth Start|Auth Start]]
- [[_COMMUNITY_Auth Callback|Auth Callback]]
- [[_COMMUNITY_Auth Status|Auth Status]]
- [[_COMMUNITY_OAuth Flow|OAuth Flow]]
- [[_COMMUNITY_Gmail Link|Gmail Link]]
- [[_COMMUNITY_HTML Stripper|HTML Stripper]]
- [[_COMMUNITY_Email Filter Check|Email Filter Check]]
- [[_COMMUNITY_Generic Text Classifier Test|Generic Text Classifier Test]]
- [[_COMMUNITY_WWW Prefix Test|WWW Prefix Test]]
- [[_COMMUNITY_LLM Compat Alias Test|LLM Compat Alias Test]]
- [[_COMMUNITY_Config Defaults Test|Config Defaults Test]]
- [[_COMMUNITY_Gemini Agent Config|Gemini Agent Config]]
- [[_COMMUNITY_UI Redesign Plan|UI Redesign Plan]]

## God Nodes (most connected - your core abstractions)
1. `Label` - 37 edges
2. `app/models.py (ORM models)` - 33 edges
3. `Email` - 29 edges
4. `Transaction` - 28 edges
5. `SenderRule` - 26 edges
6. `classify_email()` - 26 edges
7. `RuleSource` - 20 edges
8. `TransactionStatus` - 17 edges
9. `classify_with_features()` - 17 edges
10. `normalize_merchant()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Screenshot: Edit modal open — Swiggy transaction, label toggle (Expense/Income/Ignore), amount input, category chip selector, notes textarea, Save Changes button` --references--> `Hybrid Classifier (Rule Engine + LLM Fallback)`  [INFERRED]
  test-edit-modal-open.png → docs/superpowers/specs/2026-04-11-expense-tracker-design.md
- `Screenshot: Transactions page viewport — filter bar (labels/categories/statuses/dates), table with 530 rows, hover email preview tooltip` --references--> `body_text column on emails table (plain-text MIME extraction at sync)`  [INFERRED]
  test-transactions-viewport.png → docs/superpowers/plans/2026-04-12-transactions-redesign.md
- `GExpense Tracker (project README)` --references--> `app/classifier/classifier.py (classify_email)`  [EXTRACTED]
  README.md → app/classifier/classifier.py
- `GExpense Tracker (project README)` --references--> `app/classifier/rules.py (apply_rules)`  [EXTRACTED]
  README.md → app/classifier/rules.py
- `Screenshot: Dashboard — stat strip, period picker, 5 analytics widgets, dark theme` --references--> `Stats API (/api/stats/summary, category-breakdown, monthly-trend, top-merchants)`  [INFERRED]
  test-dashboard.png → docs/superpowers/plans/2026-04-11-dashboard-analytics.md

## Hyperedges (group relationships)
- **LLM-First pipeline: pattern_cache + rule_generation_loop + bootstrap_service together implement self-growing classification** — pattern_cache, rule_generation_loop, bootstrap_service [EXTRACTED 0.95]
- **Dashboard analytics core: period_picker + dashboard_analytics_widgets + stats_api together form the analytics experience** — period_picker, dashboard_analytics_widgets, stats_api [EXTRACTED 0.95]
- **Classification pipeline: hybrid_classifier + rule_engine + llm_client participate in classifying every email** — hybrid_classifier, rule_engine, llm_client [EXTRACTED 0.95]

## Communities

### Community 0 - "Core Models & Rules"
Cohesion: 0.08
Nodes (64): backfill_bodies, BaseModel, Parse Excel cashbook → list of row dicts., Return (domain, category) for a known merchant note, else None., DeclarativeBase, Return cleaned body text for classification.      Prefers body_text (full MIME p, For each selected email, upsert a SenderRule from its current transaction label., ReclassifyPayload (+56 more)

### Community 1 - "App Core & Frontend Sync"
Cohesion: 0.08
Nodes (33): app/database.py (get_db), app/main.py (FastAPI app), _poll (sync progress polling), _refreshDashboardIfPresent, refreshReviewBadge, _renderProgress (sync UI renderer), showToast, triggerSync (frontend sync trigger) (+25 more)

### Community 2 - "Email Classification Engine"
Cohesion: 0.1
Nodes (36): app/classifier/classifier.py (classify_email), app/classifier/feature_classifier.py, app/classifier/learning.py, BaseSettings, _build_pipeline_trace(), ClassificationResult, classify_email(), _parse_date() (+28 more)

### Community 3 - "Sync Pipeline & Scheduler"
Cohesion: 0.06
Nodes (23): ml_status, sync_progress_endpoint, trigger_sync, db_session(), AsyncSessionLocal, get_model_status(), lifespan(), setup_scheduler() (+15 more)

### Community 4 - "Alert System"
Cohesion: 0.08
Nodes (21): add_alert(), clear_alerts(), get_alerts(), In-memory alert store — surfaced on the dashboard to notify the user of service, level: info | warning | error, router, router, MultiLLMClient (+13 more)

### Community 5 - "Merchant Normalization"
Cohesion: 0.1
Nodes (34): extract_raw_merchant(), learn_pending_aliases(), load_alias_cache_from_db(), normalize_merchant(), SP4: Advanced Merchant Normalization  Single source of truth for merchant name c, Extract a raw merchant candidate string from email/SMS body text.     Tries stru, Return (canonical_name, confidence).      confidence=1.0  — exact alias hit (har, Persist all queued fuzzy-learned aliases to DB and update runtime cache.     Cal (+26 more)

### Community 6 - "Architecture & Bug History"
Cohesion: 0.09
Nodes (36): APScheduler 2-hour Gmail Sync Job, Body Fingerprint (top-3 most-frequent non-stopword tokens for email grouping), body_text column on emails table (plain-text MIME extraction at sync), Bootstrap Service (seed rule engine from all existing emails on first launch), Regression: LLMClient → MultiLLMClient import break, Regression: merchant data dropped on high-confidence rule path, Docker Compose Deployment (app + Postgres containers), FastAPI Single-Process Monolith Architecture (+28 more)

### Community 7 - "Gmail Client"
Cohesion: 0.1
Nodes (32): _build_service(), _decode_part(), _extract_body_text(), extract_domain(), fetch_new_messages(), get_gmail_link(), _passes_filter(), Base64-decode a Gmail MIME part body. (+24 more)

### Community 8 - "Database Migrations"
Cohesion: 0.1
Nodes (24): 0001_initial (emails, transactions, sync_state, sender_rules), 0002_email_filter (sync_state.email_filter), 0003_recurring (recurring_expenses table), 0004_budgets (budgets table), 0005_email_body_text (emails.body_text column), 0006_nullable_email_id (transactions.email_id nullable), 0007_pattern_rules (pattern_rules table), 0008_merchant_alias (merchant_aliases table) (+16 more)

### Community 9 - "Rule Engine"
Cohesion: 0.13
Nodes (25): app/classifier/rules.py (apply_rules), apply_rules(), BUILTIN_SENDER_RULES, classify_transaction(), detect_merchant(), diagnose_email(), extract_amount(), extract_upi_merchant() (+17 more)

### Community 10 - "Transaction UI Components"
Cohesion: 0.13
Nodes (16): closeEditModal(), _emSave(), _emSelectCat(), _emSelectLabel(), _escTip(), _hideSyncPanel(), openEditModal(), _poll() (+8 more)

### Community 11 - "ML Learning & Intelligence"
Cohesion: 0.14
Nodes (17): get_all_learning(), get_learned_rule(), load_learning(), Clear all learned data (useful for testing)., Debug: get all learning stats., Load persisted merchant stats from disk into memory. Safe to call at startup., Flush current merchant_stats to disk., Update learning stats for a merchant.     Returns learned rule if threshold reac (+9 more)

### Community 12 - "Pattern Rule Engine"
Cohesion: 0.23
Nodes (14): PatternRule, _add_to_cache(), CachedPattern, clear_cache(), generate_pattern(), load_pattern_cache_from_db(), match_pattern_cache(), _pattern_matches_text() (+6 more)

### Community 13 - "Email API & Text Utils"
Cohesion: 0.17
Nodes (9): _body(), list_emails(), _decode_part, _extract_body_text, _classify_one, test_extract_body_simple_payload, clean_body(), Email body cleaning utilities.  Strips HTML, decodes entities, removes noise so (+1 more)

### Community 14 - "OAuth Authentication"
Cohesion: 0.24
Nodes (9): auth_callback(), auth_status(), get_credentials(), get_oauth_flow(), is_authenticated(), save_credentials(), start_auth(), test_is_authenticated_false_when_no_token() (+1 more)

### Community 15 - "Dashboard Analytics & Finance"
Cohesion: 0.42
Nodes (9): Axis Bank Salary Shift Rule (income day>=25 shifts to next month), Budget Model (category + monthly_limit, CRUD page), Dashboard Analytics Widgets (donut, trend, merchants, budget, income-vs-expense), Screenshot: Dashboard — stat strip, period picker, 5 analytics widgets, dark theme, Period Picker (1m/3m/6m/1y) — shared control for all widgets, Dashboard Analytics Redesign Implementation Plan, Rationale: Axis Bank credits salary in last week — shifting gives accurate month-over-month figures, Dashboard Analytics Redesign Design Spec (+1 more)

### Community 16 - "Budget Management"
Cohesion: 0.43
Nodes (6): BudgetBody, BudgetPatch, create_budget(), list_budgets(), update_budget(), Budget

### Community 17 - "Auth Service Core"
Cohesion: 0.33
Nodes (6): get_credentials, is_authenticated, save_credentials, _build_service, test_is_authenticated_false_when_no_token, test_save_credentials_creates_file

### Community 18 - "Transaction API"
Cohesion: 0.8
Nodes (4): find_duplicates(), _fmt(), get_transaction(), list_transactions()

### Community 19 - "Pattern Rules Migration"
Cohesion: 0.5
Nodes (1): add pattern_rules table  Revision ID: 0007 Revises: 0006 Create Date: 2026-04-13

### Community 20 - "Merchant Aliases Migration"
Cohesion: 0.5
Nodes (1): add merchant_aliases table  Revision ID: 0008 Revises: 0007 Create Date: 2026-04

### Community 21 - "Email Body Migration"
Cohesion: 0.5
Nodes (1): add body_text to emails  Revision ID: 0005 Revises: 0004 Create Date: 2026-04-12

### Community 22 - "Recurring Expenses Migration"
Cohesion: 0.5
Nodes (1): add recurring_expenses table  Revision ID: 0003 Revises: 0002 Create Date: 2026-

### Community 23 - "Nullable Email ID Migration"
Cohesion: 0.5
Nodes (1): make email_id nullable on transactions  Revision ID: 0006 Revises: 0005 Create D

### Community 24 - "Budgets Migration"
Cohesion: 0.5
Nodes (1): add budgets table  Revision ID: 0004 Revises: 0003 Create Date: 2026-04-11 00:04

### Community 25 - "Initial Schema"
Cohesion: 0.5
Nodes (1): initial  Revision ID: 0001 Revises: Create Date: 2026-04-11 00:00:00.000000

### Community 26 - "Email Filter Migration"
Cohesion: 0.5
Nodes (1): add email_filter to sync_state  Revision ID: 0002 Revises: 0001 Create Date: 202

### Community 27 - "Dev Tooling Config"
Cohesion: 0.67
Nodes (3): CLAUDE.md — Project Instructions (code-review-graph + graphify), code-review-graph MCP Tools, Graphify Knowledge Graph (graphify-out/)

### Community 28 - "LLM Client Status"
Cohesion: 1.0
Nodes (2): llm_status, llm_client

### Community 29 - "Domain Extraction Test"
Cohesion: 1.0
Nodes (2): extract_domain, test_extract_domain_standard

### Community 30 - "Feature Classifier Tests"
Cohesion: 1.0
Nodes (2): test_feature_classifier_flags_expense, test_feature_classifier_flags_income

### Community 31 - "Stats Month Helper"
Cohesion: 1.0
Nodes (2): app/api/stats.py (_effective_month), test_effective_month (stats helper tests)

### Community 32 - "Module Init"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Module Init"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "LLM Priority Scoring"
Cohesion: 1.0
Nodes (1): Lower score = higher priority.         Each rate-limit hit adds 0.25 to the scor

### Community 35 - "Module Init"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Module Init"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Module Init"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Scheduler"
Cohesion: 1.0
Nodes (1): scheduler

### Community 39 - "Verbose Classifier"
Cohesion: 1.0
Nodes (1): classify_verbose

### Community 40 - "Verbose Extractor"
Cohesion: 1.0
Nodes (1): extract_verbose

### Community 41 - "Auth Start"
Cohesion: 1.0
Nodes (1): start_auth

### Community 42 - "Auth Callback"
Cohesion: 1.0
Nodes (1): auth_callback

### Community 43 - "Auth Status"
Cohesion: 1.0
Nodes (1): auth_status

### Community 44 - "OAuth Flow"
Cohesion: 1.0
Nodes (1): get_oauth_flow

### Community 45 - "Gmail Link"
Cohesion: 1.0
Nodes (1): get_gmail_link

### Community 46 - "HTML Stripper"
Cohesion: 1.0
Nodes (1): _strip_html

### Community 47 - "Email Filter Check"
Cohesion: 1.0
Nodes (1): _passes_filter

### Community 48 - "Generic Text Classifier Test"
Cohesion: 1.0
Nodes (1): test_feature_classifier_returns_uncertain_for_generic_text

### Community 49 - "WWW Prefix Test"
Cohesion: 1.0
Nodes (1): test_clean_www_prefix

### Community 50 - "LLM Compat Alias Test"
Cohesion: 1.0
Nodes (1): test_llm_client_compat_alias

### Community 51 - "Config Defaults Test"
Cohesion: 1.0
Nodes (1): test_defaults_set

### Community 52 - "Gemini Agent Config"
Cohesion: 1.0
Nodes (1): GEMINI.md (LLM agent instructions for graph tools)

### Community 53 - "UI Redesign Plan"
Cohesion: 1.0
Nodes (1): UI Redesign Implementation Plan

## Knowledge Gaps
- **91 isolated node(s):** `In-memory alert store — surfaced on the dashboard to notify the user of service`, `level: info | warning | error`, `Email body cleaning utilities.  Strips HTML, decodes entities, removes noise so`, `Return a clean, plain-text version of an email body.      Steps (in order):`, `Multi-provider LLM client with automatic rate-limit fallback.  Priority order (b` (+86 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `LLM Client Status`** (2 nodes): `llm_status`, `llm_client`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Domain Extraction Test`** (2 nodes): `extract_domain`, `test_extract_domain_standard`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Feature Classifier Tests`** (2 nodes): `test_feature_classifier_flags_expense`, `test_feature_classifier_flags_income`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Stats Month Helper`** (2 nodes): `app/api/stats.py (_effective_month)`, `test_effective_month (stats helper tests)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `LLM Priority Scoring`** (1 nodes): `Lower score = higher priority.         Each rate-limit hit adds 0.25 to the scor`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Init`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scheduler`** (1 nodes): `scheduler`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Verbose Classifier`** (1 nodes): `classify_verbose`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Verbose Extractor`** (1 nodes): `extract_verbose`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Start`** (1 nodes): `start_auth`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Callback`** (1 nodes): `auth_callback`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Status`** (1 nodes): `auth_status`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `OAuth Flow`** (1 nodes): `get_oauth_flow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gmail Link`** (1 nodes): `get_gmail_link`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTML Stripper`** (1 nodes): `_strip_html`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Email Filter Check`** (1 nodes): `_passes_filter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Generic Text Classifier Test`** (1 nodes): `test_feature_classifier_returns_uncertain_for_generic_text`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `WWW Prefix Test`** (1 nodes): `test_clean_www_prefix`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `LLM Compat Alias Test`** (1 nodes): `test_llm_client_compat_alias`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Config Defaults Test`** (1 nodes): `test_defaults_set`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gemini Agent Config`** (1 nodes): `GEMINI.md (LLM agent instructions for graph tools)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Redesign Plan`** (1 nodes): `UI Redesign Implementation Plan`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `app/models.py (ORM models)` connect `Database Migrations` to `Core Models & Rules`, `App Core & Frontend Sync`, `Email Classification Engine`, `Sync Pipeline & Scheduler`, `Rule Engine`, `ML Learning & Intelligence`, `Email API & Text Utils`, `Budget Management`, `Transaction API`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Why does `Label` connect `Core Models & Rules` to `App Core & Frontend Sync`, `Email Classification Engine`, `Sync Pipeline & Scheduler`, `Database Migrations`, `Rule Engine`, `ML Learning & Intelligence`, `Budget Management`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `classify_email()` connect `Email Classification Engine` to `Core Models & Rules`, `ML Learning & Intelligence`, `Alert System`, `Email API & Text Utils`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `Label` (e.g. with `ClassificationResult` and `_PipelineSignal`) actually correct?**
  _`Label` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `app/models.py (ORM models)` (e.g. with `0007_pattern_rules (pattern_rules table)` and `0008_merchant_alias (merchant_aliases table)`) actually correct?**
  _`app/models.py (ORM models)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `Email` (e.g. with `FeatureClassification` and `SyncSettingsBody`) actually correct?**
  _`Email` has 24 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `Transaction` (e.g. with `FeatureClassification` and `TransactionPatch`) actually correct?**
  _`Transaction` has 24 INFERRED edges - model-reasoned connections that need verification._