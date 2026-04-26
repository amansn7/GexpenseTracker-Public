# Graph Report - /Users/amansaini/Desktop/Vibe/GexpenseTracker  (2026-04-26)

## Corpus Check
- 79 files · ~509,989 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3032 nodes · 8973 edges · 81 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 1310 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]

## God Nodes (most connected - your core abstractions)
1. `push()` - 162 edges
2. `get()` - 156 edges
3. `As()` - 129 edges
4. `error()` - 128 edges
5. `K()` - 106 edges
6. `i()` - 105 edges
7. `a()` - 95 edges
8. `map()` - 84 edges
9. `b()` - 82 edges
10. `R()` - 82 edges

## Surprising Connections (you probably didn't know these)
- `body_text column on emails table (plain-text MIME extraction at sync)` --references--> `Screenshot: Transactions page viewport — filter bar (labels/categories/statuses/dates), table with 530 rows, hover email preview tooltip`  [INFERRED]
  docs/superpowers/plans/2026-04-12-transactions-redesign.md → test-transactions-viewport.png
- `Hybrid Classifier (Rule Engine + LLM Fallback)` --references--> `Screenshot: Edit modal open — Swiggy transaction, label toggle (Expense/Income/Ignore), amount input, category chip selector, notes textarea, Save Changes button`  [INFERRED]
  docs/superpowers/specs/2026-04-11-expense-tracker-design.md → test-edit-modal-open.png
- `_add_preview()` --calls--> `get()`  [INFERRED]
  /Users/amansaini/Desktop/Vibe/GexpenseTracker/app/sync.py → static/vendor/react-dom.development.js
- `LLMClassification` --uses--> `test_llm_client_compat_alias`  [INFERRED]
  /Users/amansaini/Desktop/Vibe/GexpenseTracker/app/classifier/llm_client.py → tests/test_llm_client.py
- `_log_task_result()` --calls--> `error()`  [INFERRED]
  /Users/amansaini/Desktop/Vibe/GexpenseTracker/app/api/sync.py → static/vendor/react-dom.development.js

## Hyperedges (group relationships)
- **Dashboard analytics core: period_picker + dashboard_analytics_widgets + stats_api together form the analytics experience** — period_picker, dashboard_analytics_widgets, stats_api [EXTRACTED 0.95]
- **Classification pipeline: hybrid_classifier + rule_engine + llm_client participate in classifying every email** — hybrid_classifier, rule_engine, llm_client [EXTRACTED 0.95]
- **LLM-First pipeline: pattern_cache + rule_generation_loop + bootstrap_service together implement self-growing classification** — pattern_cache, rule_generation_loop, bootstrap_service [EXTRACTED 0.95]
- **Email Classification Pipeline — rules gate, LLM classify, log results** — readme_rule_engine, readme_llm_fallback, plan_llm_classify_verbose, plan_classification_log_model [EXTRACTED 1.00]
- **Duplicate Detection & Learning Loop — detect at sync time, update DomainPairRule confidence** — plan_dedup_service, plan_dedup_models, plan_dedup_learning_loop, readme_app_sync [EXTRACTED 1.00]
- **UI Spec Compliance Gap — both income table view and payments filter from spec are unimplemented** — uireview_income_table_missing, uireview_payments_filter_missing, spec_income_payments_views [EXTRACTED 1.00]
- **Frontend UI Redesign: glassmorphism + sidebar layout + design tokens together form the new visual system** — 2026_04_12_ui_redesign_glassmorphism, 2026_04_12_ui_redesign_sidebar_layout, 2026_04_12_ui_redesign_design_tokens [EXTRACTED 0.95]
- **Duplicate Detection: dedup_service + DuplicatePair + DomainPairRule + learning_loop together implement the dedup pipeline** — 2026_04_19_dedup_service, 2026_04_19_duplicate_pair_model, 2026_04_19_domain_pair_rule_model, 2026_04_19_dedup_learning_loop [EXTRACTED 0.95]
- **LLM-First Pipeline: single_path + classification_log + future_rule_engine together implement the streamlined classifier** — 2026_04_18_llm_first_single_path, 2026_04_18_llm_first_classification_log, 2026_04_18_llm_first_future_rule_engine [EXTRACTED 0.90]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.0
Nodes (260): aa(), ac(), ad(), ai(), aN(), ao(), AP(), As() (+252 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (411): $(), a(), ab(), abe(), ae(), AF(), age(), ah() (+403 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (231): _account_dict(), _ai_service_dict(), AIServiceBody, AIServicePatch, _api_key_hint(), _category_dict(), CategoryBody, CategoryPatch (+223 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (199): accumulateEnterLeaveListenersForEvent(), accumulateEnterLeaveTwoPhaseListeners(), accumulateOrCreateContinuousQueuedReplayableEvent(), accumulateSinglePhaseListeners(), accumulateTwoPhaseListeners(), addEventBubbleListener(), addEventBubbleListenerWithPassiveFlag(), addEventCaptureListener() (+191 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (136): OnboardingView(), ProfileView(), SettingsView(), AlertsSection(), ClassifyTestSection(), confColor(), FetchPreviewSection(), labelColor() (+128 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (96): captureCommitPhaseError(), clearContainer(), clearSuspenseBoundary(), clearSuspenseBoundaryFromContainer(), commitAttachRef(), commitBeforeMutationEffects_begin(), commitBeforeMutationEffects_complete(), commitBeforeMutationEffectsOnFiber() (+88 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (79): attachRetryListener(), attemptContinuousHydration$1(), attemptHydrationAtCurrentPriority$1(), attemptSynchronousHydration$1(), captureCommitPhaseErrorOnRoot(), checkForNestedUpdates(), checkIfSnapshotChanged(), claimNextTransitionLane() (+71 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (74): adoptClassInstance(), applyDerivedStateFromProps(), bailoutHooks(), bailoutOnAlreadyFinishedWork(), beginWork(), cacheContext(), callComponentWillReceiveProps(), checkClassInstance() (+66 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (74): addSubtreeSuspenseContext(), attemptEarlyBailoutIfNoScheduledUpdate(), cloneChildFibers(), completeWork(), createCapturedValue(), createFiberFromElement(), createFiberFromFragment(), createFiberFromOffscreen() (+66 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (70): callComponentWillMount(), checkAttributeStringCoercion(), checkCSSPropertyStringCoercion(), checkDepsAreArrayDev(), checkFormFieldValueStringCoercion(), checkHtmlStringCoercion(), checkKeyStringCoercion(), checkPropStringCoercion() (+62 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (59): addFiberToLanesMap(), attachPingListener(), attachSuspenseRetryListeners(), cancelCallback$1(), computeExpirationTime(), ensureRootIsScheduled(), errorHydratingContainer(), finishConcurrentRender() (+51 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (51): pop(), popContext(), popHostContainer(), popHostContext(), popProvider(), popRenderLanes(), popSuspenseContext(), popTopLevelContextObject() (+43 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (58): assertValidProps(), checkControlledValueProps(), checkSelectPropTypes(), createDangerousStringForStyles(), dangerousStyleValue(), diffHydratedProperties(), diffProperties(), expandShorthandMap() (+50 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (55): ClassificationLog ORM Model, Dashboard Date Range Control (self-fetching), DateRangeControl Shared Component, Duplicates API Endpoints (GET/PATCH /duplicates), Dedup Learning Loop (DomainPairRule confidence update), DuplicatePair + DomainPairRule ORM Models, Duplicate Detection Service (app/dedup/service.py), Delete Rule Engine + ML Classifier Files (+47 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (45): fetch_preview(), Fetch N emails from Gmail for inspection — no DB writes., auth_callback, auth_status, router, start_auth, _build_service(), _decode_part() (+37 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (45): APScheduler 2-hour Gmail Sync Job, Axis Bank Salary Shift Rule (income day>=25 shifts to next month), Body Fingerprint (top-3 most-frequent non-stopword tokens for email grouping), body_text column on emails table (plain-text MIME extraction at sync), Bootstrap Service (seed rule engine from all existing emails on first launch), Budget Model (category + monthly_limit, CRUD page), Regression: LLMClient → MultiLLMClient import break, Regression: merchant data dropped on high-confidence rule path (+37 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (43): areHookInputsEqual(), createFunctionComponentUpdateQueue(), getWorkInProgressRoot(), includesBlockingLane(), includesOnlyNonUrgentLanes(), markSkippedUpdateLanes(), markWorkInProgressReceivedUpdate(), mountCallback() (+35 more)

### Community 17 - "Community 17"
Cohesion: 0.06
Nodes (39): Check and Drop Action Badge on Transaction Rows, Filter Tab Bar in App Initial State, Inbox Transaction List (App Initial State), Left Navigation Sidebar in App Initial State, MoneyFlow Logo / Brand Header, Paytm Transaction Row in Initial State, Samsung Parts Transaction Row in Initial State, App Initial State Screen (+31 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (37): bubbleProperties(), completeDehydratedSuspenseBoundary(), createFiberFromHostInstanceForDeletion(), deleteHydratableInstance(), didNotFindHydratableInstance(), didNotFindHydratableInstanceWithinContainer(), didNotFindHydratableInstanceWithinSuspenseInstance(), didNotFindHydratableTextInstance() (+29 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (13): add_alert, MultiLLMClient, _parse_response(), _Provider, Multi-provider LLM client with automatic rate-limit fallback.  Priority order (b, Lower score = higher priority.         Each rate-limit hit adds 0.25 to the scor, Register providers in default priority order (lowest score = tried first)., Available providers sorted by priority_score ascending (best first).         pri (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (34): Dashboard Page Redesign (activity-led hero, 4-card stats), classification_log Table (full LLM input/output per call), LLM-First Classification Pipeline Design Spec, Deleted Classifier Modules (rules.py, feature_classifier.py, merchant_intelligence.py, learning.py, pattern_gen.py, text_utils.py), Future Rule Engine (data-driven, built from classification_log), Rationale: Rule/ML Layers Add Complexity With No Benefit — 99.9% Reach LLM Anyway, Rationale: classification_log Enables Future Data-Driven Rule Engine, Single-Path Classification (no rule/ML branching, LLM only) (+26 more)

### Community 21 - "Community 21"
Cohesion: 0.08
Nodes (34): Balance Over Time Chart, Daily Burn Rate Widget, Filter Bar / Date Range Control (Dashboard), Dashboard Hero Summary — You're ahead message, Needs Attention Widget, Net Position This Month Widget, Dashboard View Screen, Sidebar Navigation (Dashboard) (+26 more)

### Community 22 - "Community 22"
Cohesion: 0.1
Nodes (32): fN(), requestPaint(), batchedUpdates$1(), commitRoot(), commitRootImpl(), discreteUpdates(), dispatchContinuousEvent(), dispatchDiscreteEvent() (+24 more)

### Community 23 - "Community 23"
Cohesion: 0.11
Nodes (20): closeEditModal(), _emSave(), _emSelectCat(), _emSelectLabel(), _escTip(), _hideSyncPanel(), openEditModal(), _poll() (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (22): Inbox View Feature, Transaction Amount Display - 20 INR, Inbox Email List (After Wait), No Re-classification Badge (After Wait), Reclassify & Update Button (After Wait), Right Panel - Transaction Detail (After Wait), Reclassify After Wait Screen, Email Snippet with Amount Highlighted (+14 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (19): AU(), BU(), cG(), CU(), EU(), FU(), fw(), gt() (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (19): Axis Bank Alerts Income Source Node, Daily Burn Stat - 6,120 INR over 18 days, Food & Dining Category Node in Sankey, Money Flow Page Header with Tagline, Income Sources Column in Sankey, Income Stat - 3.20L INR, Left Sidebar with Filters and Categories, Other Category Node - 1,87,584 INR (+11 more)

### Community 27 - "Community 27"
Cohesion: 0.17
Nodes (15): ki(), extractBeforeInputEvent(), extractCompositionEvent(), getCompositionEventType(), getData(), getDataFromCustomEvent(), getFallbackBeforeInputChars(), getNativeBeforeInputChars() (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.19
Nodes (13): AI Category Suggestion Banner in Side Panel, Category Dropdown in Side Panel (Expenses selected), Note/Memo Field in Side Panel, Inbox Screen - Needs Review with Side Panel Open, Transaction Detail Side Panel (Paytm ₹50), Transaction List with Paytm ₹50 Selected, AI Suggestion Panel in Transaction Detail, Category Dropdown in Side Panel (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (11): Balance Over Time Chart, Daily Burn Stat Card (₹6,120), Dashboard Header with MoneyFlow Branding, Needs Attention Stat Card (700), Net Position This Month Card (₹2,03,802), Re-scan Button (Active/Clicked State), Dashboard Screen - Rescan Clicked State, Left Navigation Sidebar (+3 more)

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (10): describeBuiltInComponentFrame(), describeClassComponentFrame(), describeFiber(), describeFunctionComponentFrame(), describeNativeComponentFrame(), describeUnknownElementTypeFrameInDEV(), disableLogs(), reenableLogs() (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.25
Nodes (9): Inbox Filter Tabs - Same as V2, Inbox Screen - Needs Review Fixed State, Resolved/Fixed Transaction List, Category Chips on Transactions (View, Flag buttons), Inbox Filter Tabs (All, Expenses, Income, Subscriptions, Flagged, Needs Review), Re-scan Action Button in Inbox Header, Inbox Screen - Needs Review V2 (Filtered View), Show All Button in Inbox Header (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (8): 0001_initial (emails, transactions, sync_state, sender_rules), 0002_email_filter (sync_state.email_filter), 0003_recurring (recurring_expenses table), 0004_budgets (budgets table), 0005_email_body_text (emails.body_text column), 0006_nullable_email_id (transactions.email_id nullable), 0007_pattern_rules (pattern_rules table), 0008_merchant_alias (merchant_aliases table)

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (7): Email.body_text Column (plain-text MIME extraction at sync), Transaction Edit Modal (label/amount/category/notes), Hover Email Preview Tooltip (3s mouseenter), Table Left-Border Label Color Coding, Rationale: Body Storage Path B (fetch at sync, store in body_text), Rationale: Income Transactions Invisible — Design Decision to Fix, Transactions Page Redesign Spec

### Community 34 - "Community 34"
Cohesion: 0.7
Nodes (4): read(), test_base_template_has_mobile_navigation_controls(), test_legacy_css_keeps_sidebar_off_canvas_on_small_screens(), test_react_shell_exposes_responsive_drawer_behaviour()

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (5): app/api/debt.py CRUD Router (GET/POST/PATCH/DELETE /debts), Debt SQLAlchemy Model (debts table), Debt pct_paid and remaining Computed Fields, Debt Reduction Feature Design Spec, DebtView Component (card grid, progress bar, add/edit modal)

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (1): add read and flagged columns to transactions  Revision ID: 0011 Revises: 0010b C

### Community 37 - "Community 37"
Cohesion: 0.5
Nodes (1): add users onboarding profile and settings tables  Revision ID: 0012 Revises: 001

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (1): add unique constraint to duplicate_pairs  Revision ID: 0010b Revises: 0010 Creat

### Community 39 - "Community 39"
Cohesion: 0.5
Nodes (1): add use_rule_engine to user_settings  Revision ID: 0013 Revises: 0012 Create Dat

### Community 40 - "Community 40"
Cohesion: 0.5
Nodes (1): add classification_log table  Revision ID: 0009 Revises: 0008 Create Date: 2026-

### Community 41 - "Community 41"
Cohesion: 0.5
Nodes (1): add duplicate_pairs and domain_pair_rules tables  Revision ID: 0010 Revises: 000

### Community 42 - "Community 42"
Cohesion: 0.5
Nodes (4): AUTO_CONFIRM_THRESHOLD Config, Dashboard & Analytics View, LLM_CONFIDENCE_THRESHOLD Config, Review Queue (low-confidence emails)

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (4): Reports Page Design Spec, GET /api/stats/monthly-summary Endpoint, Savings Rate Calculation (net/income * 100, per month), ReportsView Component (month-by-month table)

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (3): CLAUDE.md — Project Instructions (code-review-graph + graphify), code-review-graph MCP Tools, Graphify Knowledge Graph (graphify-out/)

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (3): GROUP BY Pre-aggregation Fix for domain_count, N+1 domain_count Query Bug in get_review_queue, Plan: Review Queue N+1 Fix (2026-04-20)

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (3): Pre-Aggregated Domain Counts (single query replacing N queries), Review Queue N+1 Fix Spec, Rationale: N+1 Query per Transaction in get_review_queue — Performance Fix

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): CSS Design Tokens (styles.css), Glassmorphism Design System

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): mark_all_read

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): test_defaults_set

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): alembic env.py (migration runner)

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): GEMINI.md (LLM agent instructions for graph tools)

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): UI Redesign Implementation Plan

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): Uvicorn 0.30.6

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): asyncpg 0.30.0

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): aiosqlite 0.20.0

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): pytest 8.3.3

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): Gmail Inbox Viewer

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): Budgets and Recurring Detection

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): app/api FastAPI Routers Directory

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): Docker + docker-compose Deployment

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): code-review-graph MCP Tool Suite

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): semantic_search_nodes MCP Tool

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): detect_changes MCP Tool

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): get_impact_radius MCP Tool

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): query_graph MCP Tool

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): Three-Font Typography Stack

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (1): New Era UI Redesign Design Spec

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): Left Sidebar Layout (200px)

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): Animation System (shimmer, countUp, fadeSlideUp, modalIn)

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (1): Toast Notifications (showToast)

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): Needs Review Card Stack (keyboard nav, slide-out confirm)

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): Rationale: Zero Backend Changes for UI Redesign

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): Graph Report: God Nodes (Transaction, Label, Email, SenderRule, classify_email)

## Knowledge Gaps
- **175 isolated node(s):** `mark_all_read`, `Lower score = higher priority.         Each rate-limit hit adds 0.25 to the scor`, `Fetch N emails from Gmail for inspection — no DB writes.`, `Run classification pipeline on raw inputs — no DB writes.`, `Simple email: body directly on payload, no parts.` (+170 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 47`** (2 nodes): `Icon()`, `icons.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `CSS Design Tokens (styles.css)`, `Glassmorphism Design System`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `mark_all_read`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `test_defaults_set`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `alembic env.py (migration runner)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `GEMINI.md (LLM agent instructions for graph tools)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `UI Redesign Implementation Plan`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `Uvicorn 0.30.6`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `asyncpg 0.30.0`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `aiosqlite 0.20.0`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `pytest 8.3.3`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `Gmail Inbox Viewer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `Budgets and Recurring Detection`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `app/api FastAPI Routers Directory`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `Docker + docker-compose Deployment`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `code-review-graph MCP Tool Suite`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `semantic_search_nodes MCP Tool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `detect_changes MCP Tool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `get_impact_radius MCP Tool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `query_graph MCP Tool`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `Three-Font Typography Stack`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `New Era UI Redesign Design Spec`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `Left Sidebar Layout (200px)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `Animation System (shimmer, countUp, fadeSlideUp, modalIn)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `Toast Notifications (showToast)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `Needs Review Card Stack (keyboard nav, slide-out confirm)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `Rationale: Zero Backend Changes for UI Redesign`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `Graph Report: God Nodes (Transaction, Label, Email, SenderRule, classify_email)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 9`, `Community 10`, `Community 11`, `Community 14`, `Community 19`, `Community 30`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `push()` connect `Community 1` to `Community 0`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 16`, `Community 18`, `Community 22`, `Community 25`, `Community 27`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `pop()` connect `Community 11` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 8`, `Community 9`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 124 inferred relationships involving `push()` (e.g. with `y()` and `er()`) actually correct?**
  _`push()` has 124 INFERRED edges - model-reasoned connections that need verification._
- **Are the 148 inferred relationships involving `get()` (e.g. with `_add_preview()` and `run_sync()`) actually correct?**
  _`get()` has 148 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `error()` (e.g. with `run_sync()` and `_run_sync_inner()`) actually correct?**
  _`error()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `K()` (e.g. with `push()` and `has()`) actually correct?**
  _`K()` has 2 INFERRED edges - model-reasoned connections that need verification._