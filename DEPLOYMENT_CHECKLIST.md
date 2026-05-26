# Deployment Checklist

Read this before every push. Each item is grounded in a real incident.

## Pre-push

### Migration Safety
- [ ] `alembic heads` — exactly 1 head, no branch splits
- [ ] `alembic check` — pending migrations match head
- [ ] `find alembic/versions -name "*.py" | wc -l` == `alembic history | wc -l` — no orphaned files
- [ ] All revision IDs ≤ 32 chars (check with `python3 -c "import re; [print(f'{r}: {len(r)}') for r in open('alembic/versions/*.py') if 'revision:' in r]"`)
- [ ] No duplicate revision IDs (`python3 -c "import yaml;..."` or grep manually)
- [ ] New migrations tested against PostgreSQL: run `scripts/test_pg_migrations.sh` if available, or at minimum `DATABASE_URL=postgresql://... alembic upgrade head`
- [ ] Boolean `server_default` uses `sa.text("true")` not `sa.text("1")`
- [ ] PostgreSQL-only DDL guarded with `if dialect == "postgresql":`
- [ ] `CREATE INDEX CONCURRENTLY` is NOT used (fails inside Alembic txns) — use regular `CREATE INDEX`
- [ ] If migration makes a column NOT NULL: guard with NULL-row count + warn+skip
- [ ] If migration references a table that may exist: add idempotent check (`inspector.get_table_names()`)

### Code Quality
- [ ] `git status` — no uncommitted work
- [ ] `git log --oneline -5` — review what's shipping
- [ ] `git diff --stat` — confirms only intended files
- [ ] `ruff check app/ tests/` — no new lint errors
- [ ] `pytest` — all tests pass (or known skips documented)
- [ ] If model changed: grep ALL code paths that instantiate the model (not just the ones you remember)
- [ ] If ORM model gained a column: verify migration adds it or handle missing-column gracefully

### Classifier & Body Extraction
- [ ] Test `_extract_body_text` with an HTML-only email (text/plain truncated) — verify full body returned
- [ ] If adding boilerplate pattern, test against all known email types (bank, AMC, delivery, offer)
- [ ] Verify foreign currency emails (USD/EUR) produce correct amount and source_currency
- [ ] Verify LLM reclassify returns same amount as regex pre-extraction for known emails

### Frontend
- [ ] Bump cache-busting `v=` in `templates/index.html` for changed `.jsx` files
- [ ] `node scripts/build-frontend.mjs` — rebuilds `static/dist/*.js`
- [ ] `grep "YourKeyword" static/dist/your-file.js` — verify compiled output contains your changes
- [ ] `git diff --stat static/dist/` — confirm dist files updated

## Deploy

- [ ] Docker build: `docker build -t moneyflow .` (or let Railway build)
- [ ] Smoke test: `./scripts/test_docker_smoke.sh` (if Docker CLI available)
- [ ] Push: `git push`
- [ ] Wait for Railway deploy: check dashboard or `railway status`
- [ ] Verify `/health` responds 200
- [ ] Check migration logs: look for `Running upgrade ... -> 0042` (or your head revision)
- [ ] Check for warnings: NULL-row skips, JWT_SECRET not configured, etc.

## Post-deploy

- [ ] Smoke-test key flows:
  - [ ] Login / onboarding
  - [ ] Inbox: open email, classify, review
  - [ ] Transaction edit: PATCH a transaction (catches merchant_aliases/user_id errors)
  - [ ] Dashboard: flow view renders
  - [ ] Settings: any sensitive operation
- [ ] Scan Railway logs for runtime errors: `UndefinedColumnError`, `InFailedSQLTransactionError`, `timezone.UTC`
- [ ] Check JWT_SECRET warning is expected (session-based auth OK)
- [ ] If NULL rows were skipped: create follow-up task to backfill manually
