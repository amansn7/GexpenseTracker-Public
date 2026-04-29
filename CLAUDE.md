## Project Context
Expense tracker: budgets, analytics, Axis Bank payroll income-shift rules. Stack: FastAPI + SQLAlchemy (async), JavaScript/HTML frontend. Run full test suite before committing (`--ignore=tests/test_llm_client.py` — pre-existing failure).

## Workflow
- Track multi-step work with TaskCreate/TaskUpdate; clear stale tasks at session start.
- UI changes: full audit before fixing.
- Commit with descriptive messages once tests pass.

## MCP: code-review-graph
**Use graph tools BEFORE Grep/Glob/Read.** Faster, cheaper, gives structural context.

- Explore code → `semantic_search_nodes` / `query_graph`
- Impact analysis → `get_impact_radius` / `get_affected_flows`
- Code review → `detect_changes` + `get_review_context`
- Architecture → `get_architecture_overview` + `list_communities`
- Tests → `query_graph` pattern="tests_for"

Fallback to Grep/Read only when graph can't answer.

## graphify
Knowledge graph at `graphify-out/`. Use `graphify-out/wiki/index.md` for architecture questions. Run `graphify update .` after modifying code files.
