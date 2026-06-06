# Deployment Checklist

Quick-reference checklist for production deploys. Run through this before every deploy -- no exceptions.

For full details and examples, see [SKILL.md](SKILL.md) Section 1.

## Data Layer

- [ ] All migrations reviewed and classified (additive / transformative / destructive)
- [ ] Rollback migration exists and has been tested on staging
- [ ] Database backup taken (or continuous WAL archiving confirmed active)
- [ ] Migrations tested against production-volume data on staging
- [ ] Every migration sets `lock_timeout = '2s'` as its first statement
- [ ] Migration execution order verified (cross-migration dependencies resolved)

## Application

- [ ] All new environment variables documented and set in production
- [ ] Secrets rotated if required (API keys, tokens, certificates)
- [ ] Feature flags configured for any gradual rollout
- [ ] API changes are backward-compatible (no removed/renamed fields, no new required request fields)
- [ ] No breaking changes to event schemas, message formats, or shared contracts
- [ ] Application starts successfully with production config on staging

## Infrastructure

- [ ] Health check endpoints respond correctly (`/health/live`, `/health/ready`)
- [ ] Graceful shutdown tested (in-flight requests complete before process exit)
- [ ] Resource limits set (CPU, memory) -- no unbounded containers
- [ ] Autoscaling configured and tested (min/max instances, scale-up triggers)
- [ ] DNS / load balancer changes propagated (if applicable)
- [ ] TLS certificates valid and not expiring within 30 days

## Observability

- [ ] Logs reaching the aggregator (CloudWatch, Datadog, Grafana Loki)
- [ ] Alerts configured: error rate > threshold, latency p99 > SLA, pod restarts
- [ ] Distributed traces enabled with appropriate sampling rate
- [ ] Error budget reviewed -- within SLO? Extra scrutiny if not.
- [ ] Dashboard updated with new metrics for new endpoints or features

## Rollback

- [ ] Rollback plan written and reviewed (see [rollback-playbook.md](rollback-playbook.md))
- [ ] Previous deployment artifact available and verified (image tag, release SHA)
- [ ] Team knows who has deploy access and who is on-call
- [ ] Incident channel identified (Slack channel, PagerDuty service)
- [ ] Estimated time to rollback documented (target: under 5 minutes)
