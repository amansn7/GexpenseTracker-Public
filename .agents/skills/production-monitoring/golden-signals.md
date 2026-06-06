# Golden Signals Reference

The four golden signals from the Google SRE book. Monitor these for every production service.

---

## 1. Latency

**What**: Time to serve a request.

**What to measure**:
- p50 (median): typical user experience
- p95: experience for most users
- p99: worst case for almost all users
- Separate successful requests from errors (a fast 500 is still a failure)

**Alert when**: p95 latency exceeds your SLO target for > 5 minutes.

**Prometheus query**:
```promql
# p95 latency over 5-minute window
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# p95 latency for successful requests only
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{status!~"5.."}[5m]))
```

---

## 2. Traffic

**What**: How much demand is being placed on the system.

**What to measure**:
- HTTP requests per second (total and by endpoint)
- Active connections / concurrent requests
- For async systems: messages per second, queue depth

**Alert when**: Traffic drops significantly (may indicate upstream failure or DNS issue) or spikes beyond capacity.

**Prometheus query**:
```promql
# Requests per second
rate(http_requests_total[5m])

# By endpoint
sum by (method, path) (rate(http_requests_total[5m]))
```

---

## 3. Errors

**What**: Rate of requests that fail.

**What to measure**:
- Explicit errors: HTTP 5xx responses
- Implicit errors: HTTP 200 responses with wrong content or exceeding latency SLO
- By error type: distinguish server errors (5xx) from client errors (4xx)

**Alert when**: Error rate exceeds your error budget burn rate.

**Prometheus query**:
```promql
# Error rate (5xx / total)
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])

# Absolute error count
sum(rate(http_requests_total{status=~"5.."}[5m]))
```

---

## 4. Saturation

**What**: How full the service is. The closer to capacity, the more likely performance degrades.

**What to measure**:
- CPU utilization (> 70% sustained is a warning sign)
- Memory utilization (> 80% risks OOM)
- Database connection pool utilization (active / max)
- Disk I/O utilization
- Network bandwidth utilization
- Queue depth / backlog size

**Alert when**: Any resource exceeds 80% utilization sustained, or approaching hard limits.

**Prometheus query**:
```promql
# CPU utilization
rate(process_cpu_seconds_total[5m])

# Memory usage
process_resident_memory_bytes / 1024 / 1024  # in MB

# Connection pool saturation (custom metric)
db_pool_active_connections / db_pool_max_connections
```

---

## SLO Definition Template

| Signal | SLI (Indicator) | SLO (Target) | Error Budget |
|--------|-----------------|--------------|--------------|
| Latency | % of requests < 200ms | 99.0% | 1% can exceed 200ms |
| Availability | % of requests that return non-5xx | 99.9% | 0.1% can be 5xx (~43 min/month) |
| Throughput | Requests served per second | ≥ 100 rps sustained | N/A |

**Error budget calculation**: 
- 99.9% availability over 30 days = 43.2 minutes of allowed downtime
- If you burn your error budget in 15 days, slow down deployments

---

*From production-stack-skills by VStorm — vstorm.co*
