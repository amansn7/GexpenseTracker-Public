# LLM-Powered Budget Features — Design Sketch

## Context

The app already has:
- **LLM infra**: `MultiLLMClient` with provider fallback (Groq, Google, OpenRouter, etc.), cost tracking (`LLMSpendTracker`), retry logic, JSON repair
- **Budget model**: Per-category `monthly_limit` with `spent_this_month` computed inline
- **Stats pipeline**: Unified `/api/stats` returning summary, categoryBreakdown, topMerchants, health, monthlySummary, budgets
- **Insights precedent**: `app/api/insights.py` already calls `client.chat()` for `/insights/explain`
- **Existing suggest button**: Rule-based (3mo average + buffer) in BudgetModal

---

## Architecture

All 6 features follow the same backend pattern — new endpoints under a new `app/api/budget_llm.py` router, mounted at `/api/budgets/llm/`:

```python
router = APIRouter()

@router.post("/suggest-plan")
@router.post("/health-check")
@router.post("/anomaly-adjust")
@router.post("/goal-optimize")
```

Design decision: **Backend endpoints, not frontend fetch-to-LLM.** Because:
- The LLM client handles provider fallback, rate limiting, cost tracking
- The stats data is already on the backend (no need to serialize >100KB of data to the browser)
- The prompt building can use DB joins not available from the API

Each endpoint:
1. Fetches needed stats/goals/budgets from the DB (reuses `_compute_*` helpers)
2. Calls `client.chat()` with a structured prompt
3. Parses JSON from the response using `extract_json()`
4. Returns structured data to the frontend

---

## Feature 1: One-Shot Complete Budget Plan

**Endpoint:** `POST /api/budgets/llm/suggest-plan`

**What it does:** User clicks "Suggest all budgets" → gets a complete plan with rationale for every category.

**Prompt shape:**

```
system: You are a financial budget advisor for Indian users.
Given their income, spending patterns, and any existing goals,
recommend a complete monthly budget plan.

Respond with valid JSON only. No markdown, no explanation outside JSON.
```

```
user:
INCOME: ₹{total_income}/month (average last 3 months)

SPENDING BREAKDOWN (last 3 months):
{categories spilling into ~20 rows: category, amount, pct, txn_count}

TOP MERCHANTS:
{top 8 merchants}

EXISTING BUDGETS:
{existing budgets: category, current_limit, spent_this_month, over_budget}

ACTIVE GOALS:
{goals: name, target, saved, remaining, target_date, monthly_gap}

RECURRING EXPENSES:
{recurring: name, amount, frequency, monthly_equivalent}

RULES:
1. Total budget should not exceed 80% of income (20% savings minimum)
2. If goals exist, ensure savings rate accommodates them
3. For categories with existing budgets, adjust rather than replace
4. Consider Indian spending norms

Output EXACTLY this JSON shape:
{
  "budgets": [
    {
      "category": "food",
      "suggested_limit": 12000,
      "current_limit": null,
      "rationale": "You spend ₹14K on food average. Restaurants are 40% of this — trimming dining out saves ₹2K.",
      "confidence": "high"
    }
  ],
  "summary": "This plan saves ₹{amount}/month ({pct}% rate), on track for your car goal.",
  "total_budget": 68000,
  "total_income": 85000,
  "projected_savings": 17000,
  "savings_rate_pct": 20.0
}
```

**On the frontend:** A "Suggest All" button next to "+ Add Budget" in the section header. When clicked, opens a panel showing all suggested budgets in a list, with a "Apply All" button at the bottom. Each row has:
- Category, suggested limit, current limit (if exists)
- Rationale snippet (expandable)
- Confidence badge (high/medium/low)
- Individual "Apply" button per row

---

## Feature 2: Anomaly-Aware Baselines

**Problem:** The current rule-based suggest averages blindly. A ₹50K laptop in "Shopping" inflates the baseline for months.

**Endpoint:** `POST /api/budgets/llm/anomaly-adjust`

**How it works — two modes:**

### Mode A: Transaction-level (data-heavy, optional)
Only called when suggesting a single category. Fetch the raw transactions for that category, send the top-N by amount to the LLM, ask which are one-time:

```
CATEGORY: Shopping
TOP TRANSACTIONS (last 3 months):
1. Amazon.in — ₹50,000 — "MacBook Air" — 2026-04-15
2. Myntra — ₹3,200 — "Clothing" — 2026-05-02
3. Amazon.in — ₹1,500 — "Books" — 2026-05-20

Which of these are one-time/non-recurring purchases that should be excluded
from budget baseline calculation? Respond:
{"one_time_indices": [1], "rationale": "MacBook Air is a capital purchase, not monthly shopping"}
```

### Mode B: Category-level (lighter)
Use the category breakdown from multiple periods to detect spikes:

```python
# Fetch categoryBreakdown for last 3 months individually (period=1m, thrice)
# Compare month-over-month for each category
# Flag categories where any month > 2x the median
```

**Prompt for Mode B:**
```
Category "Shopping" has these monthly amounts:
  March: ₹8,000
  April: ₹62,000  ← 7.75x median
  May: ₹9,000

The April spike is likely a one-time purchase.
Adjust the baseline to ₹8,500 (median of non-spike months).
```

**Integration:** This becomes a data-processing step BEFORE features 1 and 4. The suggest-plan endpoint filters anomalies first, then computes baselines.

---

## Feature 3: Category-Aware Merchant Reasoning

**Problem:** Some merchants span categories. Amazon sells both "Shopping" and "Subscriptions". A budget for "Shopping" might include Prime membership.

**Endpoint:** `POST /api/budgets/llm/merchant-split` (or inline in suggest-plan)

**How it works:**

Prompt the LLM with the user's top merchants and their spend by category:

```
USER'S MERCHANT-CATEGORY MATRIX:
Amazon.in:
  - ₹4,200 in Shopping (4 purchases)
  - ₹1,500 in Subscriptions (Prime renewal)
  - ₹3,000 in Entertainment (Prime Video)
Swiggy:
  - ₹5,500 in Food (food delivery)
  - ₹200 in Shopping (Swiggy Instamart grocery)

For each merchant, identify miscategorized transactions and suggest
which category each transaction truly belongs to.
```

**Output:**
```json
{
  "reallocations": [
    {
      "merchant": "Amazon.in",
      "amount": 1500,
      "from_category": "Shopping",
      "to_category": "sub",
      "rationale": "Prime membership is a subscription"
    }
  ]
}
```

**Why this matters for budgets:** If ₹1,500 of "Shopping" is actually "Subscriptions", the shopping budget looks inflated and the subscription budget looks under-funded. The LLM corrects the baseline before suggesting limits.

**Implementation strategy:** This is expensive per-merchant. Better to do it once during the suggest-plan flow and cache the reallocation map, rather than every time.

---

## Feature 4: Goal-Aware Optimization

**Endpoint:** `POST /api/budgets/llm/goal-optimize`

**What it does:** Takes the user's savings goals and reverse-engineers what budget adjustments are needed to meet them.

**Prompt:**

```
You are a financial planner. The user has these savings goals:

GOALS:
1. "Emergency Fund" — target ₹3L, saved ₹50K, need ₹2.5L more
   Target date: Dec 2026 (7 months away)
   → Need to save ₹35,714/month just for this goal

2. "Europe Trip" — target ₹2L, saved ₹0, need ₹2L
   Target date: May 2027 (12 months away)
   → Need to save ₹16,667/month for this goal

CURRENT FINANCES:
  Monthly income: ₹85,000
  Current budgets total: ₹72,000
  Current savings rate: 15.3% (₹13,000/month)
  Goals require: ₹52,381/month total
  Shortfall: ₹39,381/month

EXISTING BUDGETS:
  Rent: ₹27,000 (fixed, non-negotiable)
  Food: ₹14,000 (above median for your city)
  Shopping: ₹8,000 (high vs national average of ₹3K)
  Transport: ₹5,000
  Subscriptions: ₹3,500
  ...

Find ₹39,381/month in savings by adjusting discretionary budgets.
Prioritize non-essential categories. Never suggest cutting rent or utilities below
reasonable thresholds.
```

**Output:**
```json
{
  "goal_analysis": [
    {
      "goal_name": "Emergency Fund",
      "required_monthly": 35714,
      "current_monthly": 0,
      "on_track": false,
      "months_remaining": 7,
      "suggestion": "Not saving anything toward this goal"
    }
  ],
  "adjustments": [
    {
      "category": "Shopping",
      "current_limit": 8000,
      "suggested_limit": 4000,
      "savings": 4000,
      "rationale": "Cut impulse purchases by 50% — still above national median"
    }
  ],
  "total_savings_found": 18000,
  "remaining_shortfall": 21381,
  "recommendation": "Even with aggressive cuts, you'll fall ₹21K short. Consider extending the Emergency Fund timeline from 7 to 12 months, or increase income."
}
```

**Frontend:** A "Check Goals" button in the budgets header. Opens a panel with the goal analysis (which goals are on/off track) and suggested budget adjustments. Each adjustment has "Apply" to update that budget.

---

## Feature 5: Adaptive (Irregular Income)

**Problem:** Fixed budgets don't work for freelancers or commission-based income. The rule-based suggest assumes steady monthly income.

**Endpoint:** `POST /api/budgets/llm/adaptive-plan`

**How it works:**

First, determine income variability from `monthlySummary` (12 months):

```python
incomes = [m.income for m in monthly_summary["months"] if m.income > 0]
mean = statistics.mean(incomes)
stdev = statistics.stdev(incomes)
cv = stdev / mean  # coefficient of variation
is_variable = cv > 0.3
```

**If stable income (`cv <= 0.3`):** Use the standard fixed-budget approach (Feature 1).

**If variable income (`cv > 0.3`):** Suggest proportional budgets.

```
INCOME VARIABILITY: High (CV = 0.62)
  Mean: ₹72,000
  Range: ₹35,000 – ₹1,40,000
  Low months: 4 of 12

Since your income varies significantly, fixed budgets will
be frequently over or under. Instead, use proportional budgets:

ESSENTIALS (50% of income): Rent, Groceries, Utilities, Transport
  → These should be covered even in low months
  → Set fixed minimum: ₹35,000 (based on your lowest income month)
  → In high months, surplus goes here first.

DISCRETIONARY (30% of income): Food delivery, Shopping, Entertainment
  → Proportional to actual income that month
  → Budget = actual_income × 0.30 × category_weight

SAVINGS (20% of income):
  → In high months, accelerate savings
  → In low months, pause non-critical savings goals
```

**Output:**
```json
{
  "income_profile": {
    "type": "variable",
    "mean": 72000,
    "min": 35000,
    "max": 140000,
    "cv": 0.62,
    "low_months": 4
  },
  "plan_type": "proportional",
  "essentials": {
    "description": "Fixed minimums that must be covered even in low months",
    "fixed_total": 35000,
    "categories": [
      {"category": "rent", "fixed_limit": 27000, "note": "Non-negotiable"},
      {"category": "groceries", "fixed_limit": 5000},
      {"category": "transport", "fixed_limit": 3000}
    ]
  },
  "discretionary": {
    "description": "Proportional to actual income × 0.30 × category weight",
    "total_pct_of_income": 30,
    "categories": [
      {"category": "food", "weight_pct": 40, "example": "Income ₹80K → ₹9,600 limit"},
      {"category": "shopping", "weight_pct": 25, "example": "Income ₹80K → ₹6,000 limit"}
    ]
  },
  "savings_plan": {
    "description": "In high months, save aggressively. In low months, pause.",
    "target_rate_pct": 20,
    "min_save": 0,
    "max_save_pct": 40
  }
}
```

**Frontend:** When the user opens the "Suggest All" panel, if income is variable, show a different UI — proportional budget sliders instead of fixed limits. Each category shows the amount as `"₹X (at ₹Y income)"` with a live preview.

---

## Feature 6: Budget Health Check

**Endpoint:** `POST /api/budgets/llm/health-check`

**What it does:** Proactive analysis of current budget performance with actionable advice. Could be shown as a banner/card on the Budgets view header.

**Prompt:**

```
You are a budget coach. Analyze this user's budget performance for the current month.

CURRENT MONTH: May 2026 (22 days in)

BUDGETS:
| Category     | Limit    | Spent    | % Used | Status       |
|-------------|---------|---------|-------|-------------|
| Food        | ₹12,000 | ₹10,200 | 85%   | On track     |
| Shopping    | ₹8,000  | ₹7,500  | 94%   | Near limit   |
| Transport   | ₹5,000  | ₹4,800  | 96%   | Near limit   |
| Rent        | ₹27,000 | ₹27,000 | 100%  | Met          |
| Subscriptions| ₹3,500 | ₹4,200 | 120%  | Over budget  |

INCOME THIS MONTH: ₹85,000
LAST MONTH: ₹82,000
TOTAL SPENT: ₹53,700
PROJECTED MONTH-END: ₹68,000 (vs ₹55,500 budgeted)

PREVIOUS MONTH COMPARISON:
  Food: ₹10,200 now vs ₹9,500 last month (+7%)
  Shopping: ₹7,500 now vs ₹5,200 last month (+44%)

ACTIVE GOALS:
  "Car" — ₹5L target, ₹1L saved, 8 months left

OUTPUT:
{
  "score": 72,
  "score_label": "Needs attention",
  "issues": [
    {
      "severity": "warning",
      "category": "Shopping",
      "message": "Shopping spend is up 44% vs last month. If this pace continues, you'll exceed your ₹8K limit by ₹2K.",
      "action": "Consider pausing non-essential purchases for the remaining 8 days."
    },
    {
      "severity": "critical",
      "category": "Subscriptions",
      "message": "₹4,200 spent against ₹3,500 limit (120%). You're over budget.",
      "action": "Review active subscriptions. One month's ₹700 overspend is minor, but recurring."
    }
  ],
  "praise": [
    {
      "category": "Food",
      "message": "On track at 85% with 8 days left. Good control."
    }
  ],
  "projection": {
    "month_end_spend": 68000,
    "vs_budget": 12500,
    "concern": "Projected to exceed total budget by ₹12,500. Overspend is concentrated in Shopping and Transport."
  },
  "goal_impact": {
    "car_goal": {
      "required_monthly_savings": 50000,
      "current_savings_rate": "14.8%",
      "gap": "Cutting Shopping by ₹2K and Transport by ₹500 would add ₹2,500/mo, but still far from ₹50K needed. Consider extending timeline to 18 months."
    }
  }
}
```

**Frontend:** A health card rendered in the Budgets view section header area, next to the summary stats. Could be:
- A small colored badge showing the score (green/yellow/red)
- Clicking expands the full analysis panel with issues, praise, and projections
- Each issue has an "Adjust budget" action button that pre-fills the edit modal

---

## Implementation Priority

| # | Feature | Complexity | Impact | Effort |
|---|---------|-----------|--------|--------|
| 6 | Budget health check | Low | High (visible to all) | 1-2 days |
| 1 | One-shot complete plan | Medium | High (replaces manual setup) | 2-3 days |
| 4 | Goal-aware optimization | Medium | High (connects budgets to goals) | 1-2 days |
| 5 | Adaptive (irregular income) | Medium | Medium (targeted) | 1-2 days |
| 2 | Anomaly-aware baselines | Low | Medium (improves accuracy) | 0.5 day |
| 3 | Merchant-category reasoning | High | Low (edge case refinement) | 2-3 days |

## Prompt Template Location

New file: `app/classifier/llm/budget_prompts.py`

Houses all budget-related prompt templates as Python constants, following the existing pattern in `prompts.py`.

## Reusable patterns from existing code

| Pattern | Source | Reuse |
|---------|--------|-------|
| `client.chat(system_prompt, user_prompt, max_tokens, timeout)` | `app/api/insights.py` | Every endpoint |
| `get_user_client(user_id)` | `app/classifier/llm/client.py` | Every endpoint |
| Temperature 0.1 | `app/classifier/llm/client.py` | Keep for determinism |
| `max_tokens=1000` | `app/classifier/llm/client.py` | Budget plans need more tokens |
| JSON extraction + repair | `app/classifier/llm/parsing.py` | Every endpoint |
| `LLMSpendTracker` | `app/classifier/llm/client.py` | Cost tracking per call |
