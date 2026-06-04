# Phase 3: Ready for 50,000+ Users

**Effort:** ~8-12 weeks
**Target:** Reliable operation at 50,000+ registered users, 5,000+ concurrent, regional expansion
**Source:** `tasks/architecture-review.md` §13

---

## P3.1 — Read Replica for Analytics (3-5 days)
**Risk:** Stats/report queries compete with write-heavy sync pipeline on primary DB

- [ ] Provision PostgreSQL read replica in Railway or managed DB service
- [ ] Configure SQLAlchemy with separate read/write engine URLs
- [ ] Create `AsyncSessionLocal` variants: `reader` and `writer`
- [ ] Route all GET /api/stats/*, /api/reports/*, /api/health/* through read replica
- [ ] Route all writes (POST/PUT/PATCH/DELETE) through primary
- [ ] Handle replica lag: add optional `force_primary` query param for fresh reads
- [ ] Add replica health monitoring (lag in bytes, connection count)

**Verification:**
- [ ] Load test: saturate primary with sync writes, verify stats queries unaffected
- [ ] Consistency test: verify read-after-write consistency with `force_primary`
- [ ] Failover test: replica goes down, verify read queries fall back to primary

---

## P3.2 — Horizontal Auto-Scaling (2-3 weeks)
**Risk:** Single-container deployment cannot support 50K users or handle load spikes

- [ ] Containerize with Kubernetes (EKS/GKE) or Nomad
- [ ] Configure Horizontal Pod Autoscaler (HPA):
  - Scale on CPU > 70%
  - Scale on task queue depth > 100
  - Scale on request latency P95 > 500ms
- [ ] Add readiness probe: `/health/ready` (checks DB + Redis connectivity)
- [ ] Add liveness probe: `/health` (basic process health)
- [ ] Configure rolling updates with maxSurge=1, maxUnavailable=0 (zero-downtime)
- [ ] Add pod anti-affinity: spread across availability zones
- [ ] Configure resource requests/limits per pod
- [ ] Add cluster autoscaler for node-level scaling
- [ ] Add cost monitoring: right-size instances based on utilization patterns

**Verification:**
- [ ] Load spike test: 5× normal traffic, verify auto-scaling triggers within 2 min
- [ ] Rolling update: deploy new version, verify zero dropped requests
- [ ] Node failure: kill a node, verify pods reschedule within 5 min

---

## P3.3 — Multi-Region Disaster Recovery (3-4 weeks)
**Risk:** No DR plan; single-region deployment = total outage on region failure

- [ ] Deploy in secondary region (e.g., ap-southeast-1 for Asia-Pacific users)
- [ ] Configure active-passive with automated DNS failover (Route53 or Cloudflare)
- [ ] Set up cross-region database replication (logical replication or streaming)
- [ ] Regular DR drills: automated failover test every quarter
- [ ] Document RTO (Recovery Time Objective: 15 min) and RPO (Recovery Point Objective: 5 min)
- [ ] Add data backup strategy:
  - Daily automated pg_dump to S3/GCS
  - Point-in-time recovery via WAL archiving
  - Test restore in staging environment weekly
- [ ] Add runbook for each failure scenario (DB, app, region, DNS)

**Verification:**
- [ ] DR drill: simulate primary region outage, verify failover within RTO
- [ ] Backup test: restore from latest backup, verify data integrity
- [ ] WAL test: restore to arbitrary point-in-time, verify consistency

---

## P3.4 — Full Observability Stack (2 weeks)
**Risk:** No metrics, no dashboards, no alerting — operations are blind

- [ ] Deploy Prometheus + Grafana stack (or managed: Grafana Cloud, Datadog)
- [ ] Add `/metrics` endpoint with `prometheus-fastapi-instrumentator`:
  - Request rate, latency (P50/P95/P99), error rate by endpoint
  - DB query count and duration
  - Connection pool utilization
  - Task queue depth, processing time, failure rate
  - Cache hit/miss ratio
  - LLM spend rate and provider success rate
  - Sync lag per user (time since last sync)
- [ ] Create Grafana dashboards:
  - **Operations Dashboard:** request rate, latency, errors, DB pool, queue depth
  - **Business Dashboard:** active users, syncs/day, transactions created, LLM usage
  - **Capacity Dashboard:** resource utilization, scaling events, cost breakdown
- [ ] Configure alerting rules:
  - P95 latency > 1s for 5 min → page
  - Error rate > 5% for 5 min → page
  - Queue depth > 1000 for 5 min → warn
  - Cache hit rate < 50% → warn
  - DB pool utilization > 80% → page
  - Sync lag > 6h for any user → warn
- [ ] Deploy Loki for log aggregation (or use Grafana Cloud)
- [ ] Add OpenTelemetry instrumentation:
  - Auto-instrument FastAPI, httpx, SQLAlchemy, Redis
  - Propagate trace context to background workers
  - Increase Sentry `traces_sample_rate` from 0.1 to 0.25
- [ ] Set up synthetic monitoring (Checkly, Better Stack, or Grafana Synthetic Monitoring):
  - Key user flows: login, inbox load, transaction create, dashboard load
  - Global availability checks from 3+ regions

**Verification:**
- [ ] Dashboard walkthrough: all panels display data after 24h of operation
- [ ] Alert test: trigger each alert condition, verify notification arrives within 1 min
- [ ] Trace drill: pick a random request, follow trace from frontend → API → DB → response

---

## P3.5 — CDN for Static Assets (1 day)
**Risk:** All static assets served from Python process; wastes CPU cycles on file serving

- [ ] Configure CloudFront or Cloudflare CDN in front of `static/` directory
- [ ] Set cache headers: `Cache-Control: public, max-age=31536000, immutable` for hashed files
- [ ] Set cache headers: `Cache-Control: public, max-age=3600` for index.html (revalidate)
- [ ] Update CSP `default-src` and `script-src` to include CDN origin
- [ ] Add CDN invalidation step in deploy pipeline
- [ ] Consider migrating frontend build to produce proper cache-manifest

**Verification:**
- [ ] Cache hit ratio: verify >90% cache hit rate on static assets
- [ ] Load reduction: verify Python process CPU drops >30% on page loads

---

## P3.6 — Database Read-Write Splitting (3-5 days)
**Risk:** Single writer bottleneck for 50K+ concurrent syncs and user writes

- [ ] Implement read/write split in `app/database.py`:
  - `AsyncSessionLocal` → writer pool (primary)
  - `AsyncSessionLocalReader` → reader pool (replica(s))
- [ ] Configure separate `pool_size` for reader pool (can be larger)
- [ ] Add replica health check with automatic removal from pool on failure
- [ ] Route `SELECT` queries to reader pool, all mutations to writer pool
- [ ] Handle edge cases:
  - `SELECT ... FOR UPDATE` must go to writer (row locking)
  - `SERIALIZABLE` isolation must go to writer
  - Read-after-write within same request: use writer
- [ ] Add replica lag monitoring and alerting

**Verification:**
- [ ] Read/write isolation: verify mutations always hit writer, reads hit reader
- [ ] Lag resilience: verify 10s lag doesn't cause stale reads for user-facing queries
- [ ] Failover: replica failure → reads fall back to writer transparently

---

## P3.7 — LLM Budget Auto-Scaling (3 days)
**Risk:** Static per-user budget doesn't adapt to usage patterns or provider pricing

- [ ] Dynamic per-user budget based on:
  - User tier (free/pro/enterprise)
  - Rolling 30-day usage pattern
  - Current provider pricing (some providers cheaper at certain times)
- [ ] Add budget rollover: unused daily budget rolls over (up to 7 days cap)
- [ ] Add spend analytics: user-facing dashboard showing LLM classification value
- [ ] Add provider cost optimization: route to cheapest available provider first
- [ ] Implement budget-aware batch sizing: more emails per call when budget is tight
- [ ] Add budget alerts: warn user at 50%/80%/100% of daily budget

**Verification:**
- [ ] Budget optimization: verify cost per classification drops by ≥20% with dynamic routing
- [ ] Rollover test: verify unused budget carries over correctly across days

---

## P3.8 — Mature Background Job System (5-7 days)
**Risk:** No dead letter queues, no retry, no prioritization — task failures are silent

- [ ] Implement full task lifecycle:
  - `pending` → `running` → `completed` | `failed` | `retrying`
  - `retrying` → `running` (up to N retries with exponential backoff)
  - `failed` → `dead` (manual inspection or auto-reject after N retries)
- [ ] Add dead letter queue (DLQ) in Redis: separate list for permanently failed tasks
- [ ] Add DLQ monitoring alert when any task enters dead state
- [ ] Implement task prioritization:
  - P0: user-triggered sync (must start within 30s)
  - P1: scheduled sync (should start within 5 min)
  - P2: dedup scan (should start within 1h)
  - P3: recompute, cleanup, backfill (best effort)
- [ ] Add task chaining: `sync_complete → dedup → recompute` pipeline
- [ ] Add task cancellation: cancel pending task when user triggers new one
- [ ] Add task timeout per class: sync=600s, dedup=300s, recompute=30s

**Verification:**
- [ ] DLQ test: force task failure, verify it appears in DLQ and alert triggers
- [ ] Priority test: enqueue 100 P2 tasks, then 1 P0, verify P0 processed first
- [ ] Retry test: configure 3 retries, fail task twice, verify third attempt succeeds
- [ ] Timeout test: configure 1s timeout, verify task is failed and retried

---

## P3.9 — Staging & Preview Environments (3-5 days)
**Risk:** No pre-production validation environment; all risk goes to production

- [ ] Set up persistent staging environment (mirrors production, smaller scale)
- [ ] Set up ephemeral preview environments per PR:
  - GitHub Actions deploys to Railway/GKE preview
  - Each preview has its own Postgres + Redis (temporary)
  - Run full integration test suite against preview
  - Auto-destroy on PR merge/close
- [ ] Add production-like data seeding (anonymized) for performance testing
- [ ] Add smoke tests that run against preview before merge
- [ ] Set up canary deployment: route 5% of traffic to new version for 15 min

**Verification:**
- [ ] PR preview: verify every PR gets a unique URL with working app
- [ ] Staging parity: verify staging mirrors production architecture (scaled down)
- [ ] Canary test: deploy breaking change, verify canary catches it before full rollout

---

## P3.10 — Full Dependency Vulnerability Scanning (1 day)
**Risk:** Dependencies unpinned for frontend; container images unscanned

- [ ] Add `npm audit` to CI pipeline (fail on critical/high)
- [ ] Add `pip-audit` to CI pipeline (already present, validate it blocks critical)
- [ ] Add container image scanning with Trivy or Snyk in CI
- [ ] Add Dependabot or Renovate for automated dependency updates
- [ ] Set up SBOM generation (CycloneDX format) per build
- [ ] Add weekly dependency scan report to team notifications
- [ ] Document dependency review policy: any new dependency requires security review

**Verification:**
- [ ] CI gate: introduce known vulnerability, verify CI blocks it
- [ ] SBOM test: verify SBOM artifact generated with every build
- [ ] Update cadence: verify Dependabot PRs created within 24h of advisory

---

## Phase 3 Exit Criteria

| Criterion | Target | Verification |
|-----------|--------|-------------|
| Read replica isolation | Stats queries show zero impact on write latency | Load test with sustained writes |
| Auto-scaling latency | HPA response within 2 min of traffic spike | 5× traffic step test |
| DR RTO | Failover complete within 15 min | Quarterly DR drill |
| DR RPO | Data loss ≤ 5 min on region failure | WAL lag measurement |
| Observability coverage | All services instrumented, all dashboards populated | Grafana review |
| CDN cache hit rate | >90% on static assets | CDN analytics dashboard |
| Task reliability | Zero silent failures; all failures in DLQ with alerts | 7-day production observation |
| Preview environments | Every PR gets isolated environment | PR test run |
| Vulnerability scan | Zero critical/high vulnerabilities outstanding | Weekly scan report |

## Verification Checklist

- [ ] Full regression suite passes (all 3 phases)
- [ ] Load test: 5,000 concurrent virtual users, sustained 30 min
- [ ] DR drill: simulated region failure, verify failover within RTO
- [ ] Security audit: full penetration test by third party
- [ ] Cost review: architecture reviewed for cost optimization opportunities
- [ ] Runbook review: all failure scenarios have documented playbooks
- [ ] Team training: on-call engineers trained on new observability tools
- [ ] Migration scripts tested: all Phase 1→2→3 migrations reversible

## Rollback Plan

- **Kubernetes:** `kubectl rollout undo deployment/moneyflow`
- **Database:** Phase-specific downgrade migration scripts
- **CDN:** Disable CDN, fall back to direct FastAPI static serving
- **Read replica:** Remove from connection pool, route all to primary
- **Observability:** Keep Sentry + structlog as fallback; disable Prometheus/Grafana
