# Production Check — Scoring Methodology

How the 0-100 production readiness score is calculated.

---

## Categories and Weights

| Category | Weight | Why This Weight |
|----------|--------|-----------------|
| Security Fundamentals | 25% | Security vulnerabilities are existential — a breach can end a business |
| Error Handling & Resilience | 20% | Bad error handling is the #1 cause of cascading failures and 3 AM pages |
| Observability | 20% | You can't fix what you can't see — blind spots mean slow incident response |
| Deployment Readiness | 15% | Unsafe deployments cause outages; good deploy practices prevent them |
| Database Patterns | 10% | Database issues are the hardest to fix under pressure |
| Container Hygiene | 10% | Container security is table stakes; issues here amplify other vulnerabilities |

## Scoring Formula

```
category_score = max(0, 100 - sum(deductions))
total_score = round(Σ(category_score × category_weight))
```

Each category starts at 100 and deductions are subtracted based on findings.

## Deduction Table

### Security Fundamentals (25%)

| Finding | Severity | Deduction |
|---------|----------|-----------|
| SQL injection vector (f-string SQL) | CRITICAL | -15 |
| Hardcoded secrets in code | CRITICAL | -15 |
| No authentication on public endpoint | CRITICAL | -15 |
| Missing object-level authorization (IDOR) | CRITICAL | -15 |
| Command injection (shell=True + user input) | CRITICAL | -15 |
| Unsafe deserialization (pickle.loads) | CRITICAL | -15 |
| CORS wildcard with credentials | HIGH | -8 |
| No rate limiting on auth endpoints | HIGH | -8 |
| Missing security headers | MEDIUM | -4 |
| No dependency vulnerability scanning | MEDIUM | -4 |
| .env not in .gitignore | MEDIUM | -4 |
| Debug mode reachable in production config | MEDIUM | -4 |
| Missing input validation on endpoint | LOW | -2 |
| No HTTPS redirect configured | LOW | -2 |

### Error Handling & Resilience (20%)

| Finding | Severity | Deduction |
|---------|----------|-----------|
| Bare except: pass on critical path | CRITICAL | -12 |
| No global error handler | HIGH | -6 |
| Stack traces exposed in API responses | HIGH | -6 |
| No timeouts on external HTTP calls | HIGH | -6 |
| No timeouts on database queries | HIGH | -6 |
| All errors return 500 (no status code differentiation) | MEDIUM | -3 |
| Missing request_id in error responses | MEDIUM | -3 |
| No retry logic on transient failures | MEDIUM | -3 |
| No circuit breaker on external services | LOW | -1 |
| Broad exception catches without re-raise | LOW | -1 |

### Observability (20%)

| Finding | Severity | Deduction |
|---------|----------|-----------|
| No structured logging (using print/console.log) | HIGH | -12 |
| No health check endpoints | HIGH | -8 |
| No request correlation IDs | HIGH | -6 |
| Sensitive data in log output | HIGH | -6 |
| No metrics collection | MEDIUM | -4 |
| print() used alongside structured logging | MEDIUM | -4 |
| Health endpoint doesn't check dependencies | MEDIUM | -3 |
| No distributed tracing | LOW | -2 |
| Log levels used incorrectly | LOW | -1 |

### Deployment Readiness (15%)

| Finding | Severity | Deduction |
|---------|----------|-----------|
| No graceful shutdown (SIGTERM handler) | HIGH | -8 |
| Unsafe database migration | HIGH | -8 |
| Hardcoded config (localhost, ports, URLs in code) | MEDIUM | -6 |
| No config validation at startup | MEDIUM | -4 |
| DEBUG=True in production-reachable config | MEDIUM | -4 |
| No migration rollback script | MEDIUM | -3 |
| Missing API versioning for breaking changes | LOW | -2 |
| No pagination on list endpoints | LOW | -2 |

### Database Patterns (10%)

| Finding | Severity | Deduction |
|---------|----------|-----------|
| No connection pooling | HIGH | -6 |
| SQL injection via string interpolation | CRITICAL | -10 |
| N+1 query pattern | MEDIUM | -4 |
| SELECT * in production code | MEDIUM | -3 |
| Missing foreign key indexes | MEDIUM | -3 |
| No pool_pre_ping or equivalent | LOW | -2 |
| Missing timestamps on tables | LOW | -1 |
| Sequential IDs exposed in API | LOW | -1 |

### Container Hygiene (10%)

| Finding | Severity | Deduction |
|---------|----------|-----------|
| Running as root | HIGH | -6 |
| Secrets in Docker ARG/ENV/COPY | CRITICAL | -8 |
| No .dockerignore | MEDIUM | -4 |
| Using `latest` tag | MEDIUM | -3 |
| Missing HEALTHCHECK | MEDIUM | -3 |
| Single-stage build | MEDIUM | -3 |
| No resource limits in compose | LOW | -2 |
| Dev dependencies in production image | LOW | -2 |

## Grade Scale

| Score | Grade | Interpretation |
|-------|-------|----------------|
| 90-100 | A | Production-ready. Ship with confidence. |
| 80-89 | B | Solid foundation. Minor improvements won't block deployment. |
| 70-79 | C | Acceptable for staging. Address HIGH items before production. |
| 50-69 | D | Needs significant work. Multiple categories need attention. |
| 0-49 | F | Not production-ready. Critical issues must be resolved first. |

## Score Improvement Guide

Typical actions and their impact:

| Action | Typical Score Impact |
|--------|---------------------|
| Add structured logging (replace print) | +8-12 points |
| Add health check endpoints | +4-8 points |
| Fix bare except handlers | +3-6 points |
| Add request correlation IDs | +3-6 points |
| Add timeouts to external calls | +3-6 points |
| Configure non-root Docker user | +3-6 points |
| Add .dockerignore | +2-4 points |
| Add rate limiting | +4-8 points |
| Fix hardcoded secrets | +8-15 points |
| Add config validation at startup | +2-4 points |

---

*Scoring methodology by production-stack-skills — vstorm.co*
