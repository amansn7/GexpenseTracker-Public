# AI Tooling Layout

This repo uses a small set of committed files for stable agent behavior and keeps generated or machine-local artifacts out of the source of truth.

## Canonical files

- `AGENTS.md`: stable repo instructions shared across agent harnesses
- `CLAUDE.md`: concise Claude-oriented project context and workflow
- `.mcp.json`: project MCP server definitions
- `.claude/settings.json`: Claude hooks and MCP enablement
- `.claude/plugins.json`: verified Claude plugin list
- `.claude/skills/`: Claude-facing skill entrypoints
- `.agents/skills/`: repo-owned shared skill sources

For Claude, skill metadata should live in the YAML frontmatter at the top of each `SKILL.md`. Do not add OpenAI-specific `agents/openai.yaml` files in this repo.

## Shared skills

The preferred pattern is:

1. Keep the full skill source under `.agents/skills/<name>/`
2. Expose it to Claude through `.claude/skills/<name>` as a symlink or thin wrapper
3. Keep Claude-discoverable metadata in `SKILL.md` frontmatter and commit the source skill directory

This repo currently uses that pattern for `impeccable`.

Repo-owned skills currently intended for regular use:

- `impeccable`
- `classifier-audit`
- `sync-debug`
- `release-check`
- `browser-smoke`

## Generated and local-only directories

These paths are operational artifacts, not canonical source:

- `.code-review-graph/`
- `graphify-out/`
- `node_modules/`
- `.venv/`
- `venv/`
- `.pytest_cache/`
- `.planning/`
- `.superpowers/`

If one of these contains information worth preserving, promote it into a normal doc under `docs/` instead of treating the generated directory as source.

## Plugin policy

Commit only verified plugins in `.claude/plugins.json`.

- Do not leave `TODO_*` entries in the committed list
- Do not use the file as a scratchpad for ideas
- If a plugin is only experimental, document it in a note instead of enabling it by default

## MCP policy

Use `.mcp.json` for the minimal project MCP definition. For this repo:

- `code-review-graph` is the committed MCP integration
- Claude hook behavior lives in `.claude/settings.json`
- Generated graph databases and exports are local artifacts and should not be treated as source files
