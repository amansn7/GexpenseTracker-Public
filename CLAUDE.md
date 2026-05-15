## Project Context
Expense tracking app with Gmail sync, rule-based classification, and multi-provider LLM fallback. Stack: FastAPI + SQLAlchemy async on the backend, React/JSX frontend compiled with `esbuild` into `static/dist/`.

## Workflow
- Use `code-review-graph` before raw file search when the graph is available.
- Keep repo instructions stable and versioned; keep session notes in `handoff.md` or `tasks/`, not in `CLAUDE.md` or `AGENTS.md`.
- For frontend work, treat `static/src/` as source and `static/dist/` as build output.
- Run the relevant tests before committing when code changes affect behavior.

## Claude Layout
- `CLAUDE.md`: concise project context and stable agent workflow.
- `.claude/settings.json`: Claude hooks and MCP enablement.
- `.claude/plugins.json`: verified plugin list only, no placeholders.
- `.claude/skills/`: Claude-facing skills. Shared skills may symlink into `.agents/skills/`.
- `.agents/skills/`: repo-owned shared skill sources used across agent harnesses.
- `.mcp.json`: project MCP server definitions.

## MCP: code-review-graph
Use graph tools before `grep`/`find`/manual file scans when available.

- Explore code: `semantic_search_nodes`, `query_graph`
- Impact analysis: `get_impact_radius`, `get_affected_flows`
- Review changes: `detect_changes`, `get_review_context`
- Architecture: `get_architecture_overview`, `list_communities`
- Tests: `query_graph` with `pattern="tests_for"`

## Graph Artifacts
- Live MCP config: `.mcp.json`
- Local graph database: `.code-review-graph/`
- Exported graph artifacts: `graphify-out/`
- Generated graph files are local artifacts, not canonical source files
