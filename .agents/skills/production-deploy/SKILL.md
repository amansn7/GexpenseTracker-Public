---
name: production-deploy
description: "Pre-deployment validation and release management — structured checklists for database migrations, environment variables, rollback plans, backward compatibility, and deployment strategies. Use this skill when the user mentions deploy, release, ship to prod, merge to main, CI/CD pipeline, or says /production deploy. Triggers on deployment-related discussions, release planning, or pre-release validation."
---

# Production Deploy

This skill encodes the pre-deployment discipline that separates teams who ship confidently from teams who ship and pray. Every checklist item here exists because someone skipped it and caused an outage. The patterns are opinionated and battle-tested — this is not a deployment tutorial, it is a deployment gate.

If you cannot check every box, you are not ready to deploy. Partial deploys are how you get partial outages.

---

## 1. Pre-Deployment Checklist

Run through this before every production deploy. No exceptions, no shortcuts, no "we'll check it in staging." Print this out and check the boxes with a pen if that is what it takes.

### Data Layer

- [ ] All migrations reviewed and classified (see Section 2)
- [ ] Rollback migration exists and has been tested against staging
- [ ] Database backup taken (or continuous WAL archiving confirmed active)
- [ ] Migrations tested against production-volume data on staging
- [ ] No migrations hold locks longer than 2 seconds (`SET lock_timeout = '2s'`)
- [ ] Migration order is correct (dependencies between migrations verified)

### Application Layer

- [ ] All new environment variables documented and set in production (see Section 3)
- [ ] Secrets rotated if required (API keys, tokens, certificates)
- [ ] Feature flags configured for any gradual rollout
- [ ] API changes are backward-compatible (see Section 6)
- [ ] No breaking changes to event schemas, message formats, or shared contracts
- [ ] Application starts successfully with production config on staging

### Infrastructure

- [ ] Health check endpoints respond correctly (`/health/live`, `/health/ready`)
- [ ] Graceful shutdown tested — in-flight requests complete before process exits
- [ ] Resource limits set (CPU, memory) — no unbounded containers
- [ ] Autoscaling configured and tested (min/max instances, scale-up triggers)
- [ ] DNS/load balancer changes propagated (if applicable)
- [ ] TLS certificates valid and not expiring within 30 days

### Observability

- [ ] Logs reaching the aggregator (CloudWatch, Datadog, Grafana Loki)
- [ ] Key metrics have alerts: error rate > threshold, latency p99 > SLA, pod restarts
- [ ] Distributed traces enabled and sampling rate appropriate for production
- [ ] Error budget reviewed — are we within SLO? If not, this deploy needs extra scrutiny
- [ ] Dashboard updated with new metrics if the deploy adds new endpoints or features

### Rollback Readiness

- [ ] Rollback plan written and reviewed (see Section 5)
- [ ] Previous deployment artifact is available and verified (image tag, release SHA)
- [ ] Team knows who has deploy access and who is on-call
- [ ] Incident channel identified (Slack channel, PagerDuty service, phone tree)
- [ ] Estimated time to rollback documented (should be under 5 minutes)

**Detection — find deploys that skip the checklist:**

```bash
# PRs merged to main without a deploy checklist comment
gh pr list --state merged --base main --limit 20 --json title,body \
  | jq '.[] | select(.body | test("deploy checklist|pre-deploy|rollback plan"; "i") | not) | .title'

# Recent deploys without associated rollback tags
git tag -l "rollback-*" --sort=-creatordate | head -5
```

---

## 2. Migration Safety Review

Every migration must be classified before it ships. This is the single most important step in any deploy that touches the database. Get it wrong and you take the service down for every user, not just the ones using the new feature.

### Classification

#### Additive (Safe) — Green Light

These migrations are safe for zero-downtime rolling deploys. Old code ignores the new structures.

- New tables
- New nullable columns (without defaults on large tables)
- New indexes (with `CONCURRENTLY`)
- New views
- New functions/procedures

```sql
-- Safe: new table, no impact on existing code
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe: new nullable column, old code ignores it
ALTER TABLE orders ADD COLUMN tracking_url TEXT;

-- Safe: concurrent index, no write locks
CREATE INDEX CONCURRENTLY ix_notifications_user_id ON notifications (user_id);
```

#### Transformative (Risky) — Yellow Light

These require extra review, staging testing with production-volume data, and explicit sign-off. They can be done safely but the safe pattern is non-obvious.

- Column type changes (expand-contract)
- Data backfills on large tables (batch, not single UPDATE)
- Adding NOT NULL constraints (use NOT VALID + VALIDATE)
- Adding CHECK constraints on existing data
- Adding foreign keys on existing data

```python
# RISKY: backfill must be batched to avoid locking the table
# and overwhelming the database with a single massive transaction

# WRONG — single UPDATE locks the table and generates huge WAL
# op.execute("UPDATE orders SET status = 'active' WHERE status IS NULL")

# RIGHT — batch in chunks
def upgrade():
    conn = op.get_bind()
    batch_size = 1000
    while True:
        result = conn.execute(text(
            "UPDATE orders SET status = 'active' "
            "WHERE id IN ("
            "  SELECT id FROM orders WHERE status IS NULL LIMIT :batch"
            ")"
        ), {"batch": batch_size})
        if result.rowcount == 0:
            break
        conn.execute(text("COMMIT"))
```

#### Destructive (Dangerous) — Red Light

**REFUSE to deploy destructive migrations without explicit confirmation from the user.** These are irreversible. Suggest a zero-downtime alternative first.

- Column drops
- Table drops
- Data deletion (DELETE/TRUNCATE)
- Column renames (breaks old code during rolling deploy)
- Type changes that narrow data (e.g., TEXT to VARCHAR(50))

```python
# DANGEROUS: dropping a column breaks old code during rolling deploy
# Old instances still query this column. They crash.

# Instead of:
# op.drop_column('users', 'legacy_role')

# Use expand-contract (3 deploys):
# Deploy 1: Stop reading from legacy_role in code
# Deploy 2: Stop writing to legacy_role in code
# Deploy 3: Drop the column (only after ALL instances run new code)

# Generate rollback script BEFORE executing:
def downgrade():
    op.add_column('users', sa.Column('legacy_role', sa.String(50)))
    # NOTE: data is gone. Restore from backup if needed.
```

**Detection — find risky migrations before they ship:**

```bash
# Scan migration files for dangerous operations
grep -rn "drop_column\|drop_table\|DROP TABLE\|DROP COLUMN\|TRUNCATE\|DELETE FROM" \
  alembic/versions/ migrations/

# Scan for missing lock_timeout
grep -rL "lock_timeout" alembic/versions/*.py

# Use squawk for automated migration linting (PostgreSQL)
# pip install squawk-cli
squawk alembic/versions/latest_migration.sql
```

### Migration Lint with squawk

[squawk](https://squawkhq.com/) catches unsafe migration patterns automatically. Add it to CI:

```yaml
# GitHub Actions
- name: Lint migrations
  run: |
    pip install squawk-cli
    # Generate SQL from Alembic migrations
    alembic upgrade head --sql > migration.sql
    squawk migration.sql
```

squawk catches: missing `CONCURRENTLY` on indexes, `NOT NULL` additions without defaults, missing `lock_timeout`, and more.

---

## 3. Environment Variable Validation

Missing environment variables are the #2 cause of deploy failures (after bad migrations). The fix is simple: validate everything at startup, fail fast with a clear error message.

### Python — Pydantic BaseSettings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
from typing import Annotated


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Required — app crashes at import time if missing
    database_url: str
    secret_key: str
    allowed_hosts: list[str]

    # Required with validation
    environment: str
    log_level: str = "INFO"

    # Optional with safe defaults
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]
    db_pool_size: int = 10
    db_max_overflow: int = 5
    sentry_dsn: str | None = None

    # Deploy metadata — set by CI/CD
    app_version: str = "dev"
    deploy_sha: str = "unknown"

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        allowed = {"development", "staging", "production"}
        if v not in allowed:
            raise ValueError(f"environment must be one of {allowed}, got '{v}'")
        return v

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        if v.upper() not in allowed:
            raise ValueError(f"log_level must be one of {allowed}, got '{v}'")
        return v.upper()


# Instantiate at module level — fails at import time, not at first request
settings = Settings()
```

### Node.js — envalid

```typescript
import { cleanEnv, str, num, url, bool } from "envalid";

const env = cleanEnv(process.env, {
  // Required — process exits with clear error if missing
  DATABASE_URL: url(),
  SECRET_KEY: str({ desc: "JWT signing key" }),
  ALLOWED_HOSTS: str({ desc: "Comma-separated allowed hosts" }),

  // Required with validation
  NODE_ENV: str({ choices: ["development", "staging", "production"] }),
  LOG_LEVEL: str({
    choices: ["debug", "info", "warn", "error"],
    default: "info",
  }),

  // Optional with safe defaults
  REDIS_URL: url({ default: "redis://localhost:6379/0" }),
  PORT: num({ default: 3000 }),
  SENTRY_DSN: str({ default: "" }),

  // Deploy metadata
  APP_VERSION: str({ default: "dev" }),
  DEPLOY_SHA: str({ default: "unknown" }),
});

export default env;
```

### Rules

- Every required env var must be validated at startup, not on first use
- Fail with a human-readable error: "Missing required environment variable: DATABASE_URL" — not a cryptic NoneType error 3 stack frames deep
- Document every env var in a `.env.example` file committed to the repo
- New env vars added in a PR MUST be set in production BEFORE the deploy, or have a safe default
- Never use `os.getenv("SECRET")` without a fallback or validation — it silently returns None

**Detection — find unvalidated env vars:**

```bash
# Python: find raw os.getenv/os.environ without Settings class
grep -rn "os\.getenv\|os\.environ\[" --include="*.py" src/ app/ \
  | grep -v "settings\|config\|test"

# Node.js: find raw process.env without envalid
grep -rn "process\.env\." --include="*.ts" --include="*.js" src/ \
  | grep -v "node_modules\|config\|env\.ts\|env\.js\|test"

# Find env vars referenced in code but missing from .env.example
comm -23 \
  <(grep -rhoP '(?:os\.getenv|os\.environ\[|process\.env\.)["'"'"']?\K[A-Z_]+' src/ | sort -u) \
  <(grep -oP '^[A-Z_]+' .env.example 2>/dev/null | sort -u)
```

---

## 4. Deployment Strategies

Choose the right strategy for the risk level. There is no universal best — each has tradeoffs.

### Rolling Update (Default for Stateless Services)

New instances start, pass health checks, and begin receiving traffic. Old instances drain and shut down. At any point during the deploy, both old and new code are running simultaneously.

```yaml
# Kubernetes Deployment
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # At most 1 extra pod during rollout
      maxUnavailable: 0  # Never reduce below desired count
  template:
    spec:
      containers:
        - name: api
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health/live
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 20
      terminationGracePeriodSeconds: 30
```

**When to use:** Standard deploys of stateless services with backward-compatible changes. Most deploys.

**Risk:** Old and new code run simultaneously. Database schema and API contracts must be backward-compatible.

### Blue-Green (Zero-Downtime with Instant Rollback)

Run two identical environments. Deploy to the inactive one ("green"), verify, then switch traffic. Rollback is instant — switch traffic back to "blue."

```bash
# Cloud Run example — deploy to a new revision without serving traffic
gcloud run deploy my-service \
  --image gcr.io/my-project/my-service:${NEW_SHA} \
  --no-traffic \
  --tag canary

# Smoke test the new revision
curl -s https://canary---my-service-xxxxx.a.run.app/health/ready

# If healthy, shift all traffic
gcloud run services update-traffic my-service --to-latest

# If broken, rollback to previous revision
gcloud run services update-traffic my-service \
  --to-revisions=my-service-00042-abc=100
```

```yaml
# Docker Compose blue-green (simplified)
# nginx.conf switches upstream between blue and green
services:
  blue:
    image: myapp:current
    ports: ["8001:8000"]
  green:
    image: myapp:${NEW_TAG}
    ports: ["8002:8000"]
  nginx:
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports: ["80:80"]
```

**When to use:** Critical services where rollback speed matters more than resource cost. Services with hard availability SLAs.

**Cost:** Requires 2x infrastructure during deploy window. Both environments must be fully functional.

### Canary (High-Risk Changes)

Route a small percentage of traffic to the new version. Monitor error rates and latency. Gradually increase traffic if metrics are healthy.

```yaml
# Kubernetes canary with Istio VirtualService
apiVersion: networking.istio.io/v1
kind: VirtualService
spec:
  hosts: ["my-service"]
  http:
    - route:
        - destination:
            host: my-service
            subset: stable
          weight: 95
        - destination:
            host: my-service
            subset: canary
          weight: 5
```

```bash
# Cloud Run canary — send 5% of traffic to new revision
gcloud run services update-traffic my-service \
  --to-revisions=my-service-00043-def=5,my-service-00042-abc=95

# Monitor for 15 minutes, then promote or rollback
# Check error rate:
# - If canary error rate > 2x stable error rate, rollback immediately
# - If canary latency p99 > 1.5x stable p99, rollback immediately
```

**When to use:** Large schema changes, major refactors, new integrations, anything where "it worked in staging" is not sufficient confidence.

**Canary promotion criteria:**
1. Error rate within 1.5x of stable baseline for 15 minutes
2. Latency p99 within 1.5x of stable baseline
3. No new error types in logs
4. No increase in pod restarts

### Feature Flags (Gradual Rollout at Application Level)

Decouple deploy from release. Ship the code, then enable the feature gradually. This is the safest approach for user-facing changes.

```python
# Python — LaunchDarkly / Unleash / simple feature flag
import structlog

logger = structlog.get_logger()


def get_recommendations(user_id: str, feature_flags: FeatureFlags) -> list:
    if feature_flags.is_enabled("new_recommendation_engine", user_id=user_id):
        logger.info("using_new_engine", user_id=user_id)
        return new_recommendation_engine(user_id)
    return legacy_recommendation_engine(user_id)


# Simple file-based feature flags for small teams
# (Use a proper service like LaunchDarkly/Unleash for production at scale)
class FeatureFlags:
    def __init__(self):
        self._flags: dict[str, dict] = {}

    def is_enabled(self, flag: str, user_id: str | None = None) -> bool:
        config = self._flags.get(flag, {})
        if not config.get("enabled", False):
            return False
        # Percentage rollout
        if "percentage" in config and user_id:
            return hash(f"{flag}:{user_id}") % 100 < config["percentage"]
        return True
```

**Rules:**
- Feature flags are temporary. Remove them within 30 days of full rollout.
- Every flag has an owner and a removal date in the tracking system.
- Kill switches (disable a feature instantly) for every new user-facing feature.
- Log when a flag is evaluated — you need this data for debugging.

---

## 5. Rollback Playbook

"Redeploy the previous version" is not a rollback plan. A real rollback plan accounts for schema changes, data state, traffic routing, and communication.

### Before You Deploy: Write the Rollback Plan

Every deploy PR should include a rollback section. Use this template:

```markdown
## Rollback Plan

**Estimated rollback time:** 3 minutes
**Rollback command:**
  gcloud run services update-traffic my-service --to-revisions=my-service-00042-abc=100

**Schema rollback required:** Yes / No
  If yes: `alembic downgrade -1` (tested on staging: [link to test run])

**Data rollback required:** Yes / No
  If yes: restore from backup taken at [timestamp] using [procedure]

**Traffic rollback:** Switch nginx upstream back to blue / revert Istio weights

**Who to notify:**
  - #engineering-incidents Slack channel
  - On-call: @oncall-primary (PagerDuty)
  - Product: @pm-name (if user-facing)

**Rollback decision criteria:**
  - Error rate > 5% for 2 consecutive minutes
  - p99 latency > 2x baseline for 5 minutes
  - Any 5xx errors on critical path (checkout, auth)
```

### Schema Rollback

Can you run `alembic downgrade -1` (or equivalent) safely?

```python
# GOOD — this migration has a clean downgrade
def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.add_column('orders', sa.Column('tracking_url', sa.Text(), nullable=True))

def downgrade():
    op.execute("SET lock_timeout = '2s'")
    op.drop_column('orders', 'tracking_url')


# BAD — downgrade is destructive and loses data
def upgrade():
    op.execute("SET lock_timeout = '2s'")
    op.add_column('orders', sa.Column('status', sa.String(50), nullable=True))
    # Backfill runs separately

def downgrade():
    # WARNING: this drops the column AND all backfilled data
    op.drop_column('orders', 'status')
    # If you need to rollback, restore column from backup instead
```

**Rules:**
- Every migration must have a tested downgrade path
- If the downgrade would lose data, document it explicitly
- Test the downgrade on staging BEFORE deploying to production
- If you cannot downgrade safely, the migration must go through extra review

### Data Rollback

When schema rollback is not enough — you need to restore data.

```bash
# Point-in-time recovery with pgBackRest
pgbackrest --stanza=myapp --type=time \
  --target="2024-01-15 14:30:00+00" restore

# Logical restore of a specific table from a dump
pg_restore -Fc -d myapp --table=orders --data-only \
  myapp_pre_deploy_20240115.dump

# Verify row counts after restore
psql -d myapp -c "SELECT COUNT(*) FROM orders;"
```

**Rule:** If your deploy modifies existing data (backfills, transforms, deletes), take a backup of the affected tables BEFORE deploying. Not the whole database — just the tables you are changing. This makes restore fast.

### Traffic Rollback

Switch traffic back to the previous version without touching code or schema.

```bash
# Kubernetes: rollback to previous deployment
kubectl rollout undo deployment/my-service

# Cloud Run: shift traffic to previous revision
gcloud run services update-traffic my-service \
  --to-revisions=PREVIOUS_REVISION=100

# Docker Compose blue-green: switch nginx upstream
# Edit nginx.conf: upstream backend { server blue:8000; }
docker compose exec nginx nginx -s reload

# Verify rollback succeeded
curl -s https://my-service.example.com/health/ready | jq .
```

### Communication Checklist

When rolling back, communicate immediately. Silence during an incident is worse than incomplete information.

1. Post in the incident channel: "Rolling back deploy of [PR link]. Elevated error rate detected. Investigating."
2. Update the status page if user-facing impact is confirmed
3. After rollback completes: "Rollback complete. Service restored. Root cause investigation in progress."
4. Create an incident ticket for post-mortem within 24 hours

---

## 6. Backward Compatibility Checks

During a rolling deploy, old and new code run simultaneously. If new code makes a breaking change, old instances crash. This is not theoretical — it happens on every deploy that violates these rules.

### API Backward Compatibility

```python
# SAFE — adding a new optional field (old clients ignore it)
class OrderResponse(BaseModel):
    id: str
    total: Decimal
    status: str
    tracking_url: str | None = None  # New field, optional, has default


# BREAKING — removing a field (old clients expect it)
class OrderResponse(BaseModel):
    id: str
    total: Decimal
    # status: str  <-- removed, old clients crash parsing the response


# BREAKING — renaming a field (old clients expect the old name)
class OrderResponse(BaseModel):
    id: str
    total: Decimal
    order_status: str  # Was "status", old clients break


# SAFE — deprecation pattern (keep both, remove old in next release)
class OrderResponse(BaseModel):
    id: str
    total: Decimal
    status: str  # Deprecated — use order_status
    order_status: str  # New name

    @model_validator(mode="after")
    def sync_status_fields(self):
        self.status = self.order_status  # Keep old field in sync
        return self
```

**API rules:**
- Adding fields is safe
- Removing or renaming fields is breaking
- Changing field types is breaking (string to int, required to optional changes the contract)
- New required request fields are breaking for existing clients
- Use API versioning (`/v1/`, `/v2/`) for intentional breaking changes

### Database Backward Compatibility

During rolling deploy, old code runs against the new schema. The schema must work with both versions.

```sql
-- SAFE: old code ignores the new column
ALTER TABLE orders ADD COLUMN tracking_url TEXT;

-- BREAKING: old code does SELECT status FROM orders — this crashes
ALTER TABLE orders RENAME COLUMN status TO order_status;

-- BREAKING: old code does INSERT INTO orders (status, ...) — this crashes
ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
-- (if old code does not always provide a value)

-- SAFE expand-contract for renames:
-- Step 1 (this deploy): Add new column, write to both
ALTER TABLE orders ADD COLUMN order_status TEXT;
-- Trigger to keep them in sync:
CREATE OR REPLACE FUNCTION sync_order_status() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_status IS NULL THEN
        NEW.order_status := NEW.status;
    END IF;
    IF NEW.status IS NULL THEN
        NEW.status := NEW.order_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2 (next deploy): Switch all code to use order_status
-- Step 3 (deploy after): Drop status column and trigger
```

### Configuration Backward Compatibility

New environment variables must either have safe defaults or be set in production BEFORE the deploy.

```python
# WRONG — deploy crashes if NEW_FEATURE_URL is not set
new_feature_url: str  # Required, no default — boom

# RIGHT — safe default so old deploys without the var still work
new_feature_url: str = ""  # Empty string means feature disabled

# Or use a feature flag
new_feature_enabled: bool = False  # Off by default, enable after deploy
```

**Detection — find backward compatibility violations:**

```bash
# Find removed fields in response models (Python/Pydantic)
git diff main...HEAD --unified=0 -- "*.py" \
  | grep "^-.*:\s*\(str\|int\|float\|bool\|Decimal\|datetime\)" \
  | grep -v "test\|#"

# Find column renames in migrations
grep -rn "alter_column\|RENAME COLUMN\|rename_column" \
  alembic/versions/ migrations/ --include="*.py" --include="*.sql"

# Find new required env vars without defaults
git diff main...HEAD -- "*.py" \
  | grep "^+.*:\s*str$\|^+.*:\s*int$\|^+.*:\s*bool$" \
  | grep -i "settings\|config"
```

---

## 7. CI/CD Pipeline Best Practices

A deploy pipeline is a series of gates. Every gate must pass before the next one opens. If any gate fails, the deploy stops. No manual overrides, no "skip CI" on deploy branches.

### Pipeline Stages

```yaml
# GitHub Actions — production deploy pipeline
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run tests
        run: |
          pip install -r requirements.txt -r requirements-dev.txt
          pytest --tb=short --strict-markers -q
          # Tests MUST pass. No flaky test exceptions.

      - name: Type check
        run: mypy src/ --strict

      - name: Lint
        run: ruff check src/

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Dependency audit (Python)
        run: |
          pip install pip-audit
          pip-audit -r requirements.txt --strict

      # For Node.js:
      # - name: Dependency audit
      #   run: npm audit --audit-level=high

      - name: Secret scan
        uses: trufflesecurity/trufflehog@main
        with:
          extra_args: --only-verified

  migration-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Lint migrations with squawk
        run: |
          pip install squawk-cli
          # Generate SQL from new migrations
          alembic upgrade head --sql > migrations.sql
          squawk migrations.sql

  build:
    needs: [test, security-scan, migration-lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: |
          docker build \
            --tag myapp:${{ github.sha }} \
            --label org.opencontainers.image.revision=${{ github.sha }} \
            .

      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: myapp:${{ github.sha }}
          exit-code: 1
          severity: HIGH,CRITICAL
          ignore-unfixed: true

      - name: Push to registry
        run: |
          docker tag myapp:${{ github.sha }} gcr.io/my-project/myapp:${{ github.sha }}
          docker push gcr.io/my-project/myapp:${{ github.sha }}

  deploy-staging:
    needs: [build]
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        run: |
          gcloud run deploy myapp-staging \
            --image gcr.io/my-project/myapp:${{ github.sha }} \
            --region us-central1

      - name: Run smoke tests against staging
        run: |
          # Wait for deployment to stabilize
          sleep 10
          curl -sf https://myapp-staging.example.com/health/ready
          # Run integration test suite against staging
          pytest tests/smoke/ --base-url=https://myapp-staging.example.com

  deploy-production:
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval in GitHub
    steps:
      - name: Deploy to production
        run: |
          gcloud run deploy myapp \
            --image gcr.io/my-project/myapp:${{ github.sha }} \
            --region us-central1

      - name: Verify production health
        run: |
          sleep 10
          curl -sf https://myapp.example.com/health/ready
          # Check error rate has not spiked
```

### Pipeline Rules

1. **Tests must pass.** No "known flaky" exceptions. Fix flaky tests or delete them. A test suite you do not trust is worse than no tests — it trains the team to ignore failures.

2. **Security scan must pass.** `pip-audit`, `npm audit`, or `trivy` with `--exit-code 1`. HIGH and CRITICAL findings block the deploy.

3. **Migration lint must pass.** squawk (or equivalent) catches missing `CONCURRENTLY`, missing `lock_timeout`, unsafe `NOT NULL` additions.

4. **Docker image must build and scan clean.** Trivy image scan with HIGH/CRITICAL severity gate.

5. **Deploy to staging first.** Run smoke tests. If smoke tests fail, do not deploy to production. Ever.

6. **Production deploy requires approval.** Use GitHub environment protection rules, GitLab approval gates, or equivalent. No one person should be able to push to production without review.

7. **Tag every deploy.** After production deploy succeeds, tag the commit:

```bash
git tag -a "deploy-$(date +%Y%m%d-%H%M%S)" -m "Deployed to production"
git push origin --tags
```

**Detection — find pipeline gaps:**

```bash
# Check if CI config exists
ls .github/workflows/ || ls .gitlab-ci.yml || ls Jenkinsfile || echo "NO CI CONFIG FOUND"

# Check if security scanning is configured
grep -r "trivy\|pip-audit\|npm audit\|snyk\|grype" .github/workflows/ .gitlab-ci.yml 2>/dev/null \
  || echo "NO SECURITY SCANNING IN CI"

# Check if staging deploy exists before production
grep -r "staging" .github/workflows/ .gitlab-ci.yml 2>/dev/null \
  || echo "NO STAGING DEPLOY IN CI"

# Check for skip-CI escape hatches
git log --oneline -20 | grep -i "skip ci\|no-ci\|\[ci skip\]"
```

---

## Anti-Patterns

These are the deployment mistakes that cause real outages. Every one has been seen in production.

| Anti-Pattern | Why It Kills You | Fix |
|---|---|---|
| Deploy Friday at 5 PM | No one around to fix issues, users hit errors all weekend | Deploy early in the week, early in the day. Never before a holiday. |
| "YOLO merge to main" | No review, no checklist, no rollback plan | Enforce branch protection, require PR review, run the checklist |
| Skipping staging | "It works on my machine" is not a deployment strategy | Always deploy to staging first. Always run smoke tests. |
| No rollback plan | "We'll figure it out" becomes "we're figuring it out at 3 AM" | Write the rollback plan before deploying. Test it. |
| Deploying schema + code simultaneously | If code deploy fails, schema is already changed. Rollback breaks. | Deploy schema changes separately from code changes when possible. |
| Manual deploys via SSH | Unreproducible, unauditable, error-prone | All deploys through CI/CD. No SSH to production for deploys. |
| `--force` pushing to main | Destroys commit history, breaks other developers, loses rollback targets | Never force push to main. Ever. |
| Ignoring failed CI checks | "That test is flaky" — until the day it catches a real bug | Fix or delete flaky tests. CI must be trusted. |
| No deploy tags/artifacts | "Which version is in production?" — if you cannot answer instantly, you have a problem | Tag every deploy. Store build artifacts with SHA. |
| Env vars in code, not config | Secrets in git history forever, env-specific logic scattered everywhere | Pydantic Settings / envalid. Everything from environment. |

---

## Quick Reference: Deploy Day Commands

```bash
# Pre-deploy: verify current production state
kubectl get pods -l app=my-service -o wide
curl -s https://my-service.example.com/health/ready | jq .
git log --oneline production..main  # What are we deploying?

# Deploy: tag and push
git tag -a "pre-deploy-$(date +%Y%m%d-%H%M%S)" -m "Pre-deploy checkpoint"
git push origin --tags

# Post-deploy: verify
curl -s https://my-service.example.com/health/ready | jq .
# Watch error rate for 15 minutes
# Watch latency p99 for 15 minutes
# Check logs for new error patterns

# Rollback (if needed)
kubectl rollout undo deployment/my-service
# or
gcloud run services update-traffic my-service --to-revisions=PREVIOUS=100
```

---

## Cross-References

- For FastAPI-specific production patterns (lifespan, middleware, async), see **production-fastapi**
- For database migration safety, indexing, and connection pooling, see **production-postgres**
- For container hardening (multi-stage, non-root, distroless, secrets), see **production-docker**
- For OpenTelemetry traces, structured logging, and alerting, see **production-monitoring**
- For comprehensive production-readiness code review, see **production-review**
- For architecture planning with failure modes and ADRs, see **production-planner**
- For automated production-readiness checks, see **production-check**
