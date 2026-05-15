# Onboarding Wizard — Design Spec
_2026-04-29_

## Overview

5-step onboarding wizard for new GexpenseTracker (Moneyflow) users. Replaces the existing unwired `OnboardingView` in `account.jsx`. Isolated in a new `onboarding.jsx` file. Full-page centered card layout, no sidebar or nav.

**Steps:** Profile → Connect Gmail → AI Setup → Live Preview → Done

---

## Architecture

```
index.html
  <script> app.jsx, account.jsx, onboarding.jsx (new)

app.jsx boot:
  GET /api/auth/me
    → 401 AND localStorage has mf_onboarding_step → <OnboardingWizard>
    → 200, onboarding_complete=false             → <OnboardingWizard>
    → 200, onboarding_complete=true              → main app
```

**OAuth state persistence:** `localStorage` key `mf_onboarding_step` (integer 1–5). Set before Gmail OAuth redirect so wizard resumes at correct step after callback.

**Auth handoff:** Steps 1–2 run unauthenticated. Gmail OAuth in step 2 establishes the session cookie. Steps 3+ use that session.

**No backend schema changes** for state persistence — localStorage handles everything.

---

## Components

```
onboarding.jsx
├── OnboardingWizard          top-level; manages currentStep, stepData state
│   ├── WizardShell           centered card (max-width 480px), progress bar, step counter
│   ├── StepProfile           profile form, POST /api/account/onboarding
│   ├── StepGmail             connect button, OAuth redirect
│   ├── StepAI                provider pills, API key input, validate flow
│   ├── StepPreview           sync trigger, 2s polling loop, streaming cards
│   └── StepDone              summary, "Open Moneyflow" reload
```

**State:**
```js
const [step, setStep] = useState(
  parseInt(localStorage.getItem("mf_onboarding_step") || "1")
);
const [stepData, setStepData] = useState({});  // carries profile email forward

function advance(n) {
  localStorage.setItem("mf_onboarding_step", n);
  setStep(n);
}
```

`providerPresets` array duplicated from `account.jsx` SettingsView (no module system available).

---

## Step Detail

### Step 1 — Profile
- Fields: `full_name` (required), `email` (required), `display_name`, `default_currency` (default INR), `timezone` (default Asia/Kolkata)
- Submit: `POST /api/account/onboarding` (no auth)
- Success: `advance(2)`, store email in `stepData`
- Error 409: "Account already set up — connect Gmail to continue"

### Step 2 — Connect Gmail
- Single "Connect Gmail" button
- On click: `localStorage.setItem("mf_onboarding_step", 3)` → `window.location = "/api/auth/google"`
- On resume: localStorage=3 means OAuth succeeded — wizard initializes at step 3 (AI Setup) with "Gmail connected ✓" banner
- If `?error=` in URL on reload: show "Gmail connection failed, try again", stay at step 2
- Not skippable — sync requires Gmail

### Step 3 — AI Setup
- Provider pills: OpenAI / OpenRouter / Gemini / Grok / Scaleway / Custom
- Selecting preset fills `model_id` + `base_url` (readonly); user enters API key only
- Button: "Validate & Continue"
- Validate: `POST /api/account/ai-services/validate` with `{provider, api_key, model_id, base_url}`
  - Backend makes 1-token test completion, returns `{ok: true}` or `{ok: false, error: "..."}`
  - Success → `POST /api/account/ai-services` to save → `advance(4)`
  - Failure → inline error + "Try Scaleway (free tier, no credit card)" link (new tab)
- Not skippable — LLM required for email parsing pipeline

**New backend endpoint required:**
```
POST /api/account/ai-services/validate
Body: {provider, api_key, model_id, base_url}
Auth: required (session cookie from step 2 Gmail OAuth)
Returns: {ok: bool, error?: str}
Does NOT persist credentials.
```

### Step 4 — Live Preview
- On mount: `POST /api/sync/trigger`
- Poll `GET /api/sync/status` every 2s
- Each new transaction appended to card list (streaming effect)
- Header: spinner + "Scanning inbox… N emails found"
- "Continue" button appears immediately; sync keeps running in background if user skips
- 30s timeout: "Still working… sync runs in background" + Continue enabled

### Step 5 — Done
- Static: "You're set up." + summary (N transactions found from StepPreview state, AI provider display name from StepAI state — both passed via stepData)
- Button: "Open Moneyflow" → `localStorage.removeItem("mf_onboarding_step")` → `window.location.reload()`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Step 1: 409 user exists | "Account already set up — connect Gmail to continue" |
| Step 1: network fail | Inline error, retry button |
| Step 2: OAuth error param | "Gmail connection failed, try again" — stay at step 2 |
| Step 3: invalid API key | Inline error + Scaleway suggestion |
| Step 3: network fail | "Couldn't reach validation service — check your connection" |
| Step 4: sync trigger fail | "Couldn't start sync" + "Skip preview" button |
| Step 4: stall >30s | "Still working… sync runs in background" + Continue |
| Any: 5xx | Generic "Something went wrong, try again" |

---

## Files Changed

| File | Change |
|---|---|
| `static/src/onboarding.jsx` | New — full wizard |
| `static/index.html` | Add `<script src="/static/src/onboarding.jsx">` |
| `static/src/app.jsx` | Add onboarding gate after `/api/auth/me` |
| `app/api/ai_services.py` | Add `POST /api/account/ai-services/validate` endpoint |
| `app/main.py` | Register new route if needed |

---

## Out of Scope

- Multi-user onboarding (single-user self-hosted app)
- Invite code step (handled by existing profile form field, not a separate step)
- Skippable AI step (required for pipeline)
- Animations/transitions between steps (basic show/hide is sufficient)
