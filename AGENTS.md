## MCP Tools: code-review-graph

This project is configured to use `code-review-graph`. Use graph tools before raw search when they are available.

### Preferred graph-first workflow

- Explore code with `semantic_search_nodes` or `query_graph`
- Understand impact with `get_impact_radius` or `get_affected_flows`
- Review changes with `detect_changes` and `get_review_context`
- Trace relationships with `query_graph` patterns such as `callers_of`, `callees_of`, `imports_of`, and `tests_for`
- Use `get_architecture_overview` and `list_communities` for repo-level structure

Fall back to `rg`, `find`, or direct file reads only when the graph cannot answer the question.

## Repo instruction boundaries

- Keep `AGENTS.md` limited to stable, versioned project instructions.
- Keep session memory, audit notes, and handoff logs out of this file.
- Store transient notes in `handoff.md`, `tasks/`, or other explicitly temporary docs.

## Claude/Codex layout

- `AGENTS.md`: stable agent instructions for the repo
- `CLAUDE.md`: concise project context and workflow
- `.claude/`: Claude settings, plugins, and Claude-facing skills
- `.agents/`: shared skill sources owned by the repo
- `.mcp.json`: MCP server configuration
- `graphify-out/` and `.code-review-graph/`: generated graph artifacts

## Frontend Hook: Always use impeccable skill

**Rule:** For ANY frontend task — design, redesign, audit, polish, animate, colorize, extract, optimize, adapt, or improve a UI — invoke the `impeccable` skill FIRST before doing anything else.

This applies to:
- Websites, landing pages, dashboards, product UI, app shells
- Components, forms, settings, onboarding, empty states
- UX review, visual hierarchy, information architecture, cognitive load
- Accessibility, performance, responsive behavior, theming
- Typography, fonts, spacing, layout, alignment, color, motion
- Micro-interactions, UX copy, error states, edge cases, i18n
- Design systems, tokens, reusable patterns

Trigger keywords: `ui`, `frontend`, `design`, `style`, `css`, `layout`, `component`, `theme`, `responsive`, `animate`, `polish`, `redesign`, `audit`, `visual`, `ux`

**Never skip this step.** Even for "small" frontend fixes, load impeccable first to get the full design system context and workflow guidance.

<claude-mem-context>
# Memory Context

# [GexpenseTracker] recent context, 2026-05-25 11:18am GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (14,523t read) | 1,432,248t work | 99% savings

### May 21, 2026
746 9:30p 🔵 TOTP Signing Fallback Key Hardcoded in auth_deps.py
747 " 🔵 decrypt_secret Silently Returns Plaintext on Any Exception
749 " 🔴 S1 Fixed: TOTP Signing Fallback Key Removed from auth_deps.py
750 " 🔵 SyncState Model Has default=1 on id Column, Not Autoincrement
751 " 🔵 Two Conflicting MerchantAlias Models in Codebase
752 " 🔵 Three Classifier Bugs Confirmed in Pre-filter and LLM Client
753 " 🔵 TOTP Secrets Written Unencrypted in settings.py
754 9:33p 🔴 S4 Fixed: JWT _make_token Now Emits jti Claim, Logout Blacklist Activated
755 " 🔴 C3 Fully Wired: LLM Client Cache Invalidated on Both Key Update and Key Rotation
756 " 🔴 Test conftest.py Missing SECRET_KEY Env Var — Added for S1 Test Compatibility
757 " 🔵 Pre-existing Test Failure: test_batch_llm_success Merchant Case Normalization
S111 Batch 2 parallel fixes — frontend F1-F4, Gmail SY2+SY3, health A4, review A1 — all dispatched and actively being applied (May 21, 9:33 PM)
758 9:34p 🔴 Batch 1 Complete — C1+C2+C3 Classifier Fixes Committed (9f52fdc)
759 " 🟣 Batch 2 Dispatched — Frontend Agent ac86283681de95ae4 Fixing F1-F4
760 " 🔵 Frontend Dead Nav Views Mapped: today→dashboard, picture→flow, review→inbox+filter
761 " 🔵 F2 Confirmed: API.delete in data.jsx Always Calls r.json() Even on 204
762 " 🔵 F3 Onboarding Loop: StepDone Only Removes localStorage, Never Calls Backend
763 " 🔵 F4 Confirmed: handleFetchBody in inbox.jsx Has No try/catch
764 " 🔵 SY2: Gmail Batch Callbacks Silently Swallow Exceptions via raise Inside BatchHttpRequest
765 " 🔵 SY3: auth.py Already Raises RuntimeError on RefreshError but Doesn't Mark Account Disconnected
S112 GexpenseTracker multi-bug fix sprint: 5 parallel subagents fixing frontend, sync, security, and API bugs (May 21, 9:35 PM)
766 9:36p 🔴 Gmail batch metadata callback: replace raise-in-callback with deferred error handling
767 " 🟣 Frontend subagent dispatched: 4 critical UI bug fixes (F1–F4)
### May 22, 2026
768 2:33a 🔵 Onboarding F3: server sets onboarding_complete=True at registration; wizard close is a reload issue
769 " 🔵 API.delete 204 fix already present in data.jsx; _full_cb still raises in callback
770 " 🚨 Health endpoints leak internal system details unauthenticated
S113 GexpenseTracker multi-bug sprint: parallel subagents executing 10+ fixes across frontend, backend sync, security, and API layers (May 22, 2:34 AM)
S114 GexpenseTracker bug sprint: verifying fixes, running tests, identifying pre-existing test failures vs regressions (May 22, 2:35 AM)
S115 User greeted with "hi" — session start, no task assigned yet (May 22, 2:35 AM)
### May 25, 2026
S117 Caveman mode activation via skill invocation (May 25, 10:17 AM)
S118 GexpenseTracker security audit — verify 19 previously identified issues are fixed (May 25, 10:35 AM)
S116 Caveman mode activation via skill invocation (May 25, 10:35 AM)
771 10:35a 🔵 GexpenseTracker IDOR Fix Confirmed in merchant_aliases API
772 " 🔵 Fernet Key Derivation Fallback via SHA256
773 " 🔵 Bulk Reprocess Progress Stored in Module-Level Global Dict
774 " 🔵 Gmail Batch Fetch: Partial Failure Handling with All-Batch-Failed Raise
775 " 🔵 LLM Client Uses str.format() With Curly-Brace Escaping for User Input
776 " 🟣 Recent UI Shipping: Motion System, Sankey Toggle, Inbox Redesign
777 " 🔵 Health Endpoint Auth: /health/detailed Owner-Only, /health/ready Public
778 " 🔵 TOTP Secret Stored as Raw String(256) — Encryption at Application Layer Only
779 " 🔵 Bulk Reprocess Task: Double User Isolation — ID List Fetch + Per-Item DB Guard
780 " 🔵 handleFetchBody: Silent Failure — Body Fetch Non-Blocking for Reclassification
781 10:37a 🔵 API.delete in data.jsx Returns null on HTTP 204 No Content
S119 Fix remaining security issues S3 (totp_secret plaintext) and A4 (/health/ready info leak) — parallel subagents dispatched (May 25, 10:37 AM)
782 " 🟣 S3 Fix: TOTP Secret Encryption — Subagent Dispatched
783 " 🟣 A4 Fix: /health/ready Response Sanitization — Subagent Dispatched
785 10:38a 🔵 S3 Test Gap: test_2fa_enforcement.py Stores Plaintext totp_secret — Will Break After Encryption Fix
786 " 🔵 S3 Encryption Chain Already Correct — Migration 0039 Widened Columns
784 " 🔵 Public Release Readiness Assessment Initiated
787 " 🔵 MoneyFlow App Identity and Design System Confirmed
788 10:39a 🔴 S3 Test Fix: All 2FA Test Fixtures Now Use encrypt_secret() for totp_secret
790 " 🔵 MoneyFlow Full Codebase Structure and Tech Stack Mapped
789 " 🔴 S3 Test Fix Verified: All 9 2FA Tests Pass After encrypt_secret() Updates
792 " 🔵 Production Readiness Issues — What's Fixed vs Still Open
791 " 🔵 Pre-existing Test Failure: test_batch_classifier Merchant Case Mismatch
793 10:40a 🔵 Code Quality Scan: 34 Ruff Lint Errors, All Minor
794 " 🔵 All Category A/B Production Readiness Issues Now Fixed
795 10:41a 🔵 Second Pre-existing Failure: Gmail Socket Timeout Test Mock Not Called
796 " 🟣 Important Security Fixes: SSRF, OAuth State, DELETE Re-auth, CSP — Subagent Dispatched
S120 GexpenseTracker full security audit — all 19 critical issues verified fixed, test suite clean (May 25, 10:41 AM)

Access 1432k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>