# [Backend] Phase 3 Todo: Ready for 50,000+ Users

**Source:** `tasks/phase-03-backend.md`
**Progress:** 0/70+ items — not started
**Depends on:** Phase 1 + Phase 2 completion

---

## P3.1 — Read Replica for Analytics (3-5 days)

- [ ] Provision PostgreSQL read replica (Railway or managed DB service)
- [ ] Configure SQLAlchemy with separate read/write engine URLs
- [ ] Create `AsyncSessionLocal` variants: `reader` and `writer`
- [ ] Route GET `/api/stats/*`, `/api/reports/*`, `/api/health/*` through read replica
- [ ] Route all writes (POST/PUT/PATCH/DELETE) through primary
- [ ] Handle replica lag: add optional `force_primary` query param
- [ ] Add replica health monitoring (lag in bytes, connection count)

**Verification:**
- [ ] Load test: saturate primary with writes, verify stats queries unaffected
- [ ] Consistency: read-after-write works with `force_primary`
- [ ] Failover: replica down → reads fall back to primary

---

## P3.2 — Horizontal Auto-Scaling (2-3 weeks)

- [ ] Containerize with Kubernetes (EKS/GKE) or Nomad
- [ ] Configure HPA: scale on CPU >70%, queue depth >100, latency P95 >500ms
- [ ] Add readiness probe: `/health/ready` (DB + Redis connectivity)
- [ ] Add liveness probe: `/health` (basic process health)
- [ ] Configure rolling updates: maxSurge=1, maxUnavailable=0
- [ ] Add pod anti-affinity across availability zones
- [ ] Configure resource requests/limits per pod
- [ ] Add cluster autoscaler for node-level scaling
- [ ] Add cost monitoring: right-size instances

**Verification:**
- [ ] Load spike: 5× traffic → auto-scale within 2 min
- [ ] Rolling update: zero dropped requests
- [ ] Node failure: pods reschedule within 5 min

---

## P3.3 — Multi-Region Disaster Recovery (3-4 weeks)

- [ ] Deploy in secondary region (e.g., ap-southeast-1)
- [ ] Active-passive with automated DNS failover (Route53/Cloudflare)
- [ ] Cross-region DB replication (logical or streaming)
- [ ] Automated failover test every quarter
- [ ] Document RTO (15 min) and RPO (5 min)
- [ ] Daily automated pg_dump to S3/GCS
- [ ] Point-in-time recovery via WAL archiving
- [ ] Weekly restore test in staging
- [ ] Runbook for each failure scenario (DB, app, region, DNS)

**Verification:**
- [ ] DR drill: region outage → failover within RTO
- [ ] Backup test: restore from latest backup, verify integrity
- [ ] WAL test: restore to arbitrary point-in-time

---

## P3.4 — Full Observability Stack (2 weeks)

- [ ] Deploy Prometheus + Grafana (or Grafana Cloud / Datadog)
- [ ] Add `/metrics` endpoint:
  - Request rate, latency (P50/P95/P99), error rate by endpoint
  - DB query count and duration
  - Connection pool utilization
  - Task queue depth, processing time, failure rate
  - Cache hit/miss ratio
  - LLM spend rate and provider success rate
  - Sync lag per user
- [ ] Create Grafana dashboards: Operations, Business, Capacity
- [ ] Configure alerting rules (latency, error rate, queue depth, cache ratio, pool utilization, sync lag)
- [ ] Deploy Loki for log aggregation
- [ ] Add OpenTelemetry: auto-instrument FastAPI, httpx, SQLAlchemy, Redis
- [ ] Propagate trace context to background workers
- [ ] Increase Sentry traces_sample_rate from 0.1 to 0.25
- [ ] Set up synthetic monitoring (Checkly / Better Stack / Grafana Synthetic)
- [ ] Global availability checks from 3+ regions

**Verification:**
- [ ] Dashboard walkthrough: all panels show data after 24h
- [ ] Alert test: each alert condition triggers notification within 1 min
- [ ] Trace drill: follow a request frontend → API → DB → response

---

## P3.5 — CDN for Static Assets (1 day)

- [ ] Configure CloudFront/Cloudflare CDN in front of `static/`
- [ ] Cache headers: `max-age=31536000, immutable` for hashed files
- [ ] Cache headers: `max-age=3600` for index.html (revalidate)
- [ ] Update CSP `default-src` / `script-src` to include CDN origin
- [ ] Add CDN invalidation step in deploy pipeline
- [ ] Consider cache-manifest frontend build

**Verification:**
- [ ] Cache hit ratio >90%
- [ ] Python process CPU drops >30% on page loads

---

## P3.6 — Database Read-Write Splitting (3-5 days)

- [ ] Implement read/write split in `app/database.py`
- [ ] `AsyncSessionLocal` → writer pool (primary)
- [ ] `AsyncSessionLocalReader` → reader pool (replica)
- [ ] Separate `pool_size` for reader pool (larger)
- [ ] Replica health check with automatic removal from pool
- [ ] `SELECT` → reader pool, mutations → writer pool
- [ ] Handle edge cases: `SELECT ... FOR UPDATE`, `SERIALIZABLE`, read-after-write
- [ ] Replica lag monitoring and alerting

**Verification:**
- [ ] Mutations always hit writer, reads hit reader
- [ ] 10s lag doesn't cause stale reads for user-facing queries
- [ ] Replica failure → reads fall back to writer transparently

---

## P3.7 — LLM Budget Auto-Scaling (3 days)

- [ ] Dynamic per-user budget based on tier, 30-day usage, provider pricing
- [ ] Budget rollover: unused daily budget rolls over (7-day cap)
- [ ] Spend analytics dashboard for users
- [ ] Provider cost optimization: route to cheapest available provider
- [ ] Budget-aware batch sizing: more emails per call when budget tight
- [ ] Budget alerts at 50%/80%/100% of daily budget

**Verification:**
- [ ] Cost per classification drops ≥20% with dynamic routing
- [ ] Rollover: unused budget carries over correctly

---

## P3.8 — Mature Background Job System (5-7 days)

- [ ] Implement full task lifecycle: pending → running → completed | failed | retrying
- [ ] Dead letter queue (DLQ) in Redis for permanently failed tasks
- [ ] DLQ monitoring alert when any task enters dead state
- [ ] Task prioritization: P0 (user-triggered sync) through P3 (backfill)
- [ ] Task chaining: sync_complete → dedup → recompute
- [ ] Task cancellation: cancel pending task when user triggers new one
- [ ] Task timeout per class: sync=600s, dedup=300s, recompute=30s

**Verification:**
- [ ] DLQ test: forced failure → task in DLQ + alert triggers
- [ ] Priority test: P0 processed before P2 tasks
- [ ] Retry test: 3 retries, fail twice, third attempt succeeds
- [ ] Timeout test: 1s timeout → task failed and retried

---

## P3.9 — Staging & Preview Environments (3-5 days)

- [ ] Set up persistent staging environment (mirrors production, smaller scale)
- [ ] Ephemeral preview environments per PR via GitHub Actions
- [ ] Each preview has its own Postgres + Redis (temporary)
- [ ] Full integration test suite against preview
- [ ] Auto-destroy on PR merge/close
- [ ] Production-like data seeding (anonymized)
- [ ] Smoke tests run against preview before merge
- [ ] Canary deployment: 5% traffic to new version for 15 min

**Verification:**
- [ ] Every PR gets unique URL with working app
- [ ] Staging mirrors production architecture (scaled down)
- [ ] Canary catches breaking change before full rollout

---

## P3.10 — Full Dependency Vulnerability Scanning (1 day)

- [ ] Add `npm audit` to CI (fail on critical/high)
- [ ] Verify `pip-audit` blocks critical vulnerabilities
- [ ] Container image scanning with Trivy/Snyk in CI
- [ ] Dependabot/Renovate for automated dependency updates
- [ ] SBOM generation (CycloneDX format) per build
- [ ] Weekly dependency scan report to team notifications
- [ ] Dependency review policy: new deps require security review

**Verification:**
- [ ] CI gate: introduce known vulnerability → CI blocks
- [ ] SBOM artifact generated with every build
- [ ] Dependabot PRs created within 24h of advisory

---

## Execution Order

| Step | Item | Rationale |
|------|------|-----------|
| 1 | P3.5 CDN | Quick win, independent, reduces CPU |
| 2 | P3.10 Vulnerability scanning | Quick win, independent |
| 3 | P3.4 Observability | Foundation for operating at scale |
| 4 | P3.1 Read replica | After observability to measure impact |
| 5 | P3.6 Read-write splitting | Depends on P3.1 replica |
| 6 | P3.2 Auto-scaling | After replica + observability |
| 7 | P3.8 Mature background jobs | After auto-scaling infra |
| 8 | P3.3 DR | After all infrastructure stable |
| 9 | P3.9 Staging/preview | Infrastructure maturity |
| 10 | P3.7 LLM budget auto-scaling | Enhancement, can be last |
