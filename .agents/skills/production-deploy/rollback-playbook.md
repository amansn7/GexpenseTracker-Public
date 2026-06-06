# Rollback Playbook

A practical, step-by-step guide for rolling back production deployments. Covers decision criteria, execution procedures, post-rollback verification, and communication.

---

## When to Rollback

### Decision Criteria

Rollback immediately -- do not wait for root-cause analysis -- if any of the following are true:

- **Error rate** exceeds 5% for 2 consecutive minutes
- **p99 latency** exceeds 2x the pre-deploy baseline for 5 minutes
- **Any 5xx errors on critical paths** (authentication, checkout, payment processing)
- **Pod/container restart loops** -- new version is crash-looping
- **Health check failures** -- `/health/ready` returns non-200 after start-period elapses
- **Data corruption signals** -- unexpected NULLs, constraint violations, or missing rows in newly modified tables

If the issue is isolated to a non-critical feature and a feature flag can disable it, prefer the flag over a full rollback.

---

## How to Rollback

### 1. Instant Rollback -- Redeploy Previous Version

This is the fastest rollback path. No schema changes, no data changes -- just switch traffic back to the last known-good artifact.

#### Docker Compose (blue-green)

```bash
# Switch nginx upstream back to the previous ("blue") container
# Edit nginx.conf: upstream backend { server blue:8000; }
docker compose exec nginx nginx -s reload

# Verify
curl -sf https://my-service.example.com/health/ready
```

#### Kubernetes

```bash
# Undo the most recent rollout
kubectl rollout undo deployment/my-service

# Verify rollback is progressing
kubectl rollout status deployment/my-service

# Confirm pods are healthy
kubectl get pods -l app=my-service -o wide
```

#### Cloud Run

```bash
# Shift 100% of traffic to the previous revision
gcloud run services update-traffic my-service \
  --to-revisions=PREVIOUS_REVISION_NAME=100

# Verify
curl -sf https://my-service.example.com/health/ready
```

#### Generic (any container platform)

```bash
# Redeploy the previous image tag (stored in your deploy log or CI artifacts)
# Example:
PREVIOUS_TAG="abc1234"  # git SHA of last successful deploy
docker pull myapp:${PREVIOUS_TAG}
# Deploy using your platform's deploy command
```

---

### 2. Migration Rollback

Required when the deploy included database schema changes and the rollback requires reverting them.

#### Before You Start

1. Confirm the downgrade migration exists and has been tested on staging.
2. Confirm whether the downgrade is destructive (drops a column that was already populated by the new code).

#### Steps

```bash
# 1. Roll back the application FIRST (stop new code from writing to new schema)
#    Use the instant rollback steps above.

# 2. Run the downgrade migration
#    Alembic:
alembic downgrade -1

#    Django:
python manage.py migrate <app_name> <previous_migration_number>

#    Raw SQL:
psql -d myapp -f rollback_migration.sql

# 3. Verify schema state
psql -d myapp -c "\d <affected_table>"

# 4. Verify application health with the old schema
curl -sf https://my-service.example.com/health/ready
```

#### If the Downgrade Is Destructive

If the downgrade drops a column that now contains user data:

1. Do NOT run the downgrade migration.
2. Roll back the application only (instant rollback).
3. The old code must tolerate the new column (nullable columns are ignored by old code).
4. File an incident ticket to address the schema mismatch.

---

### 3. Data Rollback

Required when the deploy included data modifications (backfills, transforms, deletes) that must be undone.

#### Point-in-Time Recovery (full database)

```bash
# Restore to the moment before the deploy using pgBackRest
pgbackrest --stanza=myapp --type=time \
  --target="2024-01-15 14:30:00+00" restore

# Verify row counts
psql -d myapp -c "SELECT COUNT(*) FROM <affected_table>;"
```

#### Table-Level Restore (surgical)

```bash
# Restore a single table from a pre-deploy dump
pg_restore -Fc -d myapp --table=<table_name> --data-only \
  myapp_pre_deploy_<date>.dump

# Verify
psql -d myapp -c "SELECT COUNT(*) FROM <table_name>;"
psql -d myapp -c "SELECT * FROM <table_name> LIMIT 5;"
```

#### Important

- If the deploy modified existing data, a backup of the affected tables should have been taken BEFORE deploying.
- A full database PITR replays WAL and requires downtime. Prefer table-level restore when possible.
- After any data restore, verify foreign key consistency and run application smoke tests.

---

## Post-Rollback Verification

Run through every item after the rollback completes. Do not declare the incident resolved until all checks pass.

- [ ] `/health/ready` returns 200 on all instances
- [ ] Error rate has returned to pre-deploy baseline
- [ ] p99 latency has returned to pre-deploy baseline
- [ ] No new error patterns in logs (check the last 10 minutes)
- [ ] No pod/container restart loops
- [ ] Critical user flows verified manually (login, checkout, core API endpoints)
- [ ] Database state verified (row counts, constraint integrity on affected tables)
- [ ] Monitoring dashboards confirm recovery

---

## Communication Template

Use this template during and after the rollback. Silence during an incident is worse than incomplete information.

### During Rollback

Post immediately in the incident channel:

```
INCIDENT: Rolling back deploy of [PR link / deploy SHA].
REASON: [Elevated error rate / p99 spike / health check failures / describe symptom].
ACTION: Reverting to [previous version / revision / image tag].
OWNER: @your-name
STATUS: Rollback in progress.
```

### After Rollback Completes

```
UPDATE: Rollback complete. Service restored at [timestamp].
IMPACT: [duration of degradation, affected users/endpoints if known].
NEXT: Root cause investigation in progress. Post-mortem within 24 hours.
```

### Post-Mortem Ticket (create within 24 hours)

Include:
- Timeline (deploy started, issue detected, rollback initiated, service restored)
- Root cause (or "under investigation")
- What monitoring caught the issue (or what monitoring should have caught it)
- Action items to prevent recurrence
- Link to the failed deploy PR

---

## Quick Reference

| Scenario | Rollback Method | Expected Time |
|---|---|---|
| Code bug, no schema changes | Instant rollback (redeploy previous image) | 1-3 minutes |
| Code bug + additive migration (new nullable column) | Instant rollback only (old code ignores new column) | 1-3 minutes |
| Code bug + transformative migration (backfill, constraint) | Instant rollback + downgrade migration | 3-10 minutes |
| Data corruption from backfill | Instant rollback + table-level restore from backup | 5-30 minutes |
| Full data corruption | Instant rollback + point-in-time recovery | 15-60+ minutes |
| Feature rollback (no bug, business decision) | Disable feature flag | < 1 minute |
