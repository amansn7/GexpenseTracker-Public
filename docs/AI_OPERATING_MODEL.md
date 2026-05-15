# AI Operating Model

This document defines the target AI tooling layout for MoneyFlow and the roles that materially help this codebase.

Claude-native rule: skills in this repo are defined by `SKILL.md` and its frontmatter. Do not add OpenAI-specific metadata manifests such as `agents/openai.yaml`.

## Project profile

MoneyFlow is a full-stack personal-finance app that converts Gmail transaction emails into structured financial data. The hard parts are:

- Gmail OAuth and incremental history sync
- duplicate detection and replay safety
- expense classification and extraction quality
- a React/JSX frontend with product-design constraints

That means the repo benefits more from graph-aware engineering skills and a few repo-specific workflows than from a large plugin stack.

## Required MCP

### `code-review-graph`

Required. This is the primary repo-intelligence MCP.

Use it for:

- architecture and impact analysis
- bug tracing across sync and classifier flows
- change review and blast-radius checks
- test coverage lookup before refactors

Configured in [`.mcp.json`](/Users/amansaini/GexpenseTracker/.mcp.json:1) and enabled by Claude hooks in [`.claude/settings.json`](/Users/amansaini/GexpenseTracker/.claude/settings.json:1).

## Recommended MCP

### Browser automation MCP

Recommended for this repo because the app has high-value UI flows:

- inbox
- dashboard
- onboarding
- settings/admin
- responsive behavior

If present, use it for smoke checks and UI regression work. It is recommended, not required for normal backend work.

## Skills

### Shared frontend skill

- `impeccable`
  - Use for UI audits, redesigns, responsive fixes, accessibility, and frontend polish.

### Graph-first engineering skills

- `explore-codebase`
- `review-changes`
- `refactor-safely`
- `debug-issue`

These are generic, but they match this repo because the code-review graph is central to the workflow.

### Repo-specific skills

- `classifier-audit`
  - For `app/classifier/`, extraction bugs, provider fallback, and merchant normalization.
- `sync-debug`
  - For Gmail sync, dedup, scheduler, replay, and state bugs.
- `release-check`
  - For targeted regression verification before shipping.
- `browser-smoke`
  - For browser-driven or manual smoke validation of key UI flows.

## Plugins

Keep plugins minimal.

### Keep

- `caveman@caveman`
  - Fine as an optional convenience plugin because it is already configured and verified.

### Optional only

- `claude-hud`
- `context-mode`

### Not a priority

UI or research plugins that duplicate what skills and MCP already provide. This repo’s main needs are code navigation, flow analysis, and release discipline.

## Subagent roles

These are the subagent roles worth using for this repo.

### Codebase explorer

Use for bounded graph-backed questions:

- what calls this code
- what tests cover this path
- which flows are affected

### Backend worker

Use for isolated backend changes in:

- `app/api/`
- `app/sync.py`
- `app/classifier/`
- `app/gmail/`
- `app/dedup/`

### Frontend worker

Use for isolated UI work in:

- `static/src/`
- templates or style adjustments tied to JSX output

### Browser QA checker

Use only if browser automation is available. Best for:

- inbox interactions
- onboarding/account flows
- settings/admin regressions
- responsive checks

This role maps directly to the `browser-smoke` skill.

### Asset producer

Already covered by the `impeccable` ecosystem. Use only for design-heavy tasks, not routine product engineering.

## Suggested ownership split

- Explorer: graph lookup, impact radius, test discovery
- Backend worker: sync/classifier/API implementation
- Frontend worker: JSX/CSS implementation
- Browser QA checker: smoke validation on affected screens

This split keeps ownership disjoint and avoids multiple agents editing the same files.
