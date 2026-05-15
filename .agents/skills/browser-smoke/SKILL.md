---
name: browser-smoke
description: Use when MoneyFlow needs browser-based smoke validation for inbox, dashboard, onboarding, settings, admin, or responsive UI behavior. Use this skill only when browser automation is available; otherwise use it to produce a precise manual smoke checklist and residual-risk report.
---

# Browser Smoke

Use this skill for UI verification after frontend or full-stack changes.

## Workflow

1. Identify the affected surface:
   - inbox
   - dashboard/reports
   - onboarding/account
   - settings/admin
   - recurring/budgets/debt
2. If browser automation is available, run the narrowest credible smoke path for that surface.
3. If browser automation is not available, produce a manual smoke checklist with exact pages and behaviors to verify.
4. Focus on user-visible regressions:
   - page loads
   - key actions complete
   - errors are visible and understandable
   - layout holds on narrow viewports if the change is responsive or navigation-related
5. Report verified behavior separately from unverified behavior.

## Project-specific checks

### Inbox

- list renders
- search/filter still works if touched
- row expand/collapse works
- bulk action flows still appear and respond

### Dashboard

- charts/cards render without obvious layout breakage
- date range controls respond
- totals and empty/error states still fit

### Onboarding / Account

- onboarding steps render in order
- account/settings actions remain reachable
- auth-required redirects still make sense if touched

### Settings / Admin

- tabs/sections render
- form controls remain usable
- AI/provider/admin status panels still load if touched

## Output expectations

- `Verified in browser`
- `Manual smoke still needed`
- `Residual risk`
