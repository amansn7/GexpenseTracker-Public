---
name: production-check
description: "Full production readiness audit with 0-100 score — scans the entire project across security, error handling, observability, deployment readiness, database patterns, and container hygiene. Launches parallel analysis, classifies findings by severity, and produces a prioritized action plan. Use this skill when user says /production check, /production score, asks 'is this production ready', 'audit this project', 'how production ready is this', or wants a comprehensive codebase health check."
---

# Production Check

The comprehensive production readiness audit. This skill scans your entire project, evaluates it across six categories, assigns a score from 0-100, and gives you a prioritized action plan to get production-ready.

This is not a code review. A code review looks at diffs. This looks at the entire system — from your Dockerfile to your error handling to whether your migrations will lock a table for 45 minutes.

---

## How It Works

When the user runs `/production check`, execute these steps in order:

### Step 1: Detect the Stack

Before auditing, identify what you're working with:

```
Scan for:
- Language: Python (pyproject.toml, requirements.txt), Node.js (package.json), Go (go.mod), Java (pom.xml)
- Framework: FastAPI, Django, Flask, Express, Fastify, Gin, Spring Boot
- Database: PostgreSQL, MySQL, MongoDB, Redis (check connection strings, ORM configs)
- Infrastructure: Dockerfile, docker-compose.yml, Kubernetes manifests, serverless configs
- CI/CD: .github/workflows/, .gitlab-ci.yml, Jenkinsfile
```

Report the detected stack to the user before proceeding.

### Step 2: Run the Six-Category Audit

Evaluate the project against each category below. For each finding, note:
- **What**: the issue
- **Where**: file and line
- **Why**: what happens in production if this isn't fixed
- **Fix**: concrete recommendation (code when possible)
- **Severity**: CRITICAL / HIGH / MEDIUM / LOW

#### Category 1: Security Fundamentals (25% weight)

Check for:

**Authentication & Authorization:**
- Every endpoint has explicit auth (not just "hidden")
- Object-level access control (user A can't access user B's data)
- Admin endpoints are protected, not just unlisted

**Secrets Management:**
- No hardcoded secrets in code (`grep -r "password\s*=\s*\"" --include="*.py" --include="*.js"`)
- `.env` in `.gitignore`
- No secrets in Dockerfile ARG/ENV
- No secrets in docker-compose.yml

**Input Validation:**
- All user input validated at the API boundary
- SQL queries use parameterized statements (no f-strings in SQL)
- No `shell=True` with user input
- No `eval()` or `exec()` with user input

**CORS:**
- Not `allow_origins=["*"]` with credentials
- Specific origin whitelist

**Rate Limiting:**
- Auth endpoints have strict rate limits
- Public endpoints have rate limits

**Security Headers:**
- HSTS, X-Content-Type-Options, X-Frame-Options, CSP present

**Dependencies:**
- No known HIGH/CRITICAL CVEs in dependencies

**Scoring:**
- CRITICAL finding: -15 points from this category
- HIGH finding: -8 points
- MEDIUM finding: -4 points
- LOW finding: -2 points
- Maximum deduction: entire category weight (25 points)

#### Category 2: Error Handling & Resilience (20% weight)

Check for:

**Exception Handling:**
- No bare `except: pass` or `except Exception: pass`
- No swallowed exceptions on critical paths
- Structured error responses (consistent JSON format)
- Different status codes for different error types (not everything is 500)

**External Call Protection:**
- All HTTP calls have explicit timeouts
- Database queries have timeouts
- Redis/cache calls have timeouts
- Retry logic on transient failures
- Circuit breakers for external services (for microservices)

**Graceful Degradation:**
- Non-critical features can be disabled without taking down the service
- Cache failures don't crash the application
- Analytics/logging failures don't affect the request

**Error Logging:**
- Errors are logged with context (request_id, user_id, stack trace)
- No sensitive data in error logs
- No stack traces in API responses

**Scoring:**
- CRITICAL: -12 points
- HIGH: -6 points
- MEDIUM: -3 points
- LOW: -1 point

#### Category 3: Observability (20% weight)

Check for:

**Structured Logging:**
- Uses structlog/loguru/pino/zap (not `print()` or `console.log` for production logging)
- JSON format in production configuration
- Log levels used correctly (ERROR/WARNING/INFO/DEBUG)
- No sensitive data logged

**Request Tracing:**
- Correlation IDs / request IDs present
- IDs propagated to log entries
- IDs returned in error responses

**Health Endpoints:**
- `/health/live` or `/health` endpoint exists
- `/health/ready` endpoint checks dependencies
- Health endpoints excluded from auth middleware

**Metrics:**
- Request count/rate tracked
- Latency percentiles tracked
- Error rate tracked
- Custom business metrics present (bonus)

**Scoring:**
- Missing structured logging entirely: -12
- Missing health endpoints: -8
- Missing correlation IDs: -6
- Missing metrics: -4
- print() statements used as logging: -4

#### Category 4: Deployment Readiness (15% weight)

Check for:

**Configuration:**
- All config from environment variables (not hardcoded)
- Config validation at startup (fail fast)
- No `localhost` or `127.0.0.1` in application code
- No `DEBUG = True` in production paths

**Graceful Shutdown:**
- SIGTERM handler registered
- In-flight requests completed before exit
- Database connections closed on shutdown
- Background tasks cancelled on shutdown

**API Compatibility:**
- No breaking changes without versioning
- Pagination on list endpoints
- Request/response validation

**Migrations:**
- All `CREATE INDEX` use `CONCURRENTLY`
- `SET lock_timeout` on every migration
- No `NOT NULL` additions without the 3-step pattern on large tables
- Rollback scripts exist

**Scoring:**
- Missing graceful shutdown: -8
- Hardcoded config: -6 per instance (max -12)
- Unsafe migration: -8 per instance
- Missing config validation: -4

#### Category 5: Database Patterns (10% weight)

Check for:

**Connection Management:**
- Connection pooling configured (not connect-per-request)
- Pool size appropriate for the workload
- Idle connection timeout set
- `pool_pre_ping` or equivalent enabled

**Query Safety:**
- No N+1 queries in list endpoints
- No `SELECT *` in production queries
- Parameterized queries everywhere
- Indexes on foreign key columns

**Schema Design:**
- Timestamps on all tables (created_at, updated_at)
- UUID or non-sequential public IDs (not exposing internal auto-increment)

**Scoring:**
- No connection pooling: -6
- N+1 queries: -4 per instance (max -8)
- Missing FK indexes: -3 per instance

#### Category 6: Container Hygiene (10% weight)

Check for:

**Dockerfile Quality:**
- Multi-stage build (builder + runtime)
- Non-root user (`USER` directive present)
- Pinned base image versions (no `latest`)
- `HEALTHCHECK` directive present
- `.dockerignore` exists and excludes .git, .env, node_modules

**Image Security:**
- No secrets in build args or env
- No dev dependencies in production image
- Minimal base image (slim/distroless/alpine)

**Compose Quality (if present):**
- Resource limits set
- Health check conditions on depends_on
- Named volumes for persistent data
- Network isolation

**Scoring:**
- Running as root: -6
- No .dockerignore: -4
- Using `latest` tag: -3
- Missing HEALTHCHECK: -3
- Single-stage build: -3
- Secrets in layers: -6

### Step 3: Calculate the Score

```
Total Score = Σ(category_score × category_weight)

Where category_score = max(0, 100 - total_deductions_for_category)

Weights:
  Security fundamentals:      25%
  Error handling & resilience: 20%
  Observability:               20%
  Deployment readiness:        15%
  Database patterns:           10%
  Container hygiene:           10%
```

Round to the nearest integer.

### Step 4: Assign a Grade

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | A | Production-ready. Ship it. |
| 80-89 | B | Solid. Minor improvements needed, nothing blocking. |
| 70-79 | C | Acceptable for staging. Address HIGH items before production. |
| 50-69 | D | Needs significant work. Multiple areas require attention. |
| 0-49 | F | Not production-ready. Critical issues present. |

### Step 5: Generate the Prioritized Action Plan

Sort all findings by impact. Show the user:

1. **Quick wins** — fixes that take < 5 minutes but improve the score significantly
2. **Critical fixes** — must be done before production, regardless of effort
3. **High-impact improvements** — biggest score improvement per effort
4. **Nice-to-haves** — low-priority improvements for later

For each action item, show the estimated score improvement:
> "Fix bare except handlers in api/routes.py → +4 points (Error Handling)"

---

## Output Format

Present the audit results in this format:

```
## Production Readiness Audit

**Project**: [detected project name]
**Stack**: [detected stack]
**Score**: [XX/100] — Grade [A-F]
**Date**: [current date]

### Score Breakdown

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Security Fundamentals | XX/100 | 25% | XX |
| Error Handling & Resilience | XX/100 | 20% | XX |
| Observability | XX/100 | 20% | XX |
| Deployment Readiness | XX/100 | 15% | XX |
| Database Patterns | XX/100 | 10% | XX |
| Container Hygiene | XX/100 | 10% | XX |
| **Total** | | | **XX/100** |

### Critical Issues (fix before any deployment)

1. **[Category] [Title]** — `file:line`
   [Description and why it matters]
   **Fix**: [concrete fix with code]

### High Priority (fix before production traffic)

1. ...

### Quick Wins (< 5 minutes each, biggest score impact)

1. **[+N points]** [what to do]

### Medium Priority (next sprint)

1. ...

### What's Done Well

- [Acknowledge good practices already in place]

---

**Action Plan**: Fix the [N] critical issues and [N] quick wins first.
Your score jumps from [XX] to ~[estimated new score].

---
*Audited by production-stack-skills v1.0 — vstorm.co*
```

---

## Quick Score Mode

When the user runs `/production score`, give a fast 60-second version:
- Scan for the most impactful indicators only
- Report headline score and top 3 findings
- Skip the detailed breakdown
- End with: "Run `/production check` for the full audit with action plan."

---

## Report Generation

When the user runs `/production report`:
1. Run the full `/production check` audit
2. Format as a polished Markdown document suitable for sharing with stakeholders
3. Include: executive summary, detailed findings, action plan, methodology
4. Add header: "Production Readiness Report — [Project Name] — [Date]"
5. Add footer: "Generated by production-stack-skills — vstorm.co"

---

## Detection Patterns Quick Reference

Run these at the start of every audit:

```bash
# Security
rg '(password|secret|api_key|token)\s*=\s*"[^"]{8,}"' -i          # hardcoded secrets
rg 'allow_origins.*\*'                                              # CORS wildcard
rg 'f"(SELECT|INSERT|UPDATE|DELETE)' --type py                      # SQL injection
rg 'shell=True' --type py                                           # command injection
rg 'DEBUG\s*=\s*True' --type py                                     # debug mode

# Error Handling
rg 'except:$' --type py                                             # bare except
rg 'except.*:.*pass$' --type py                                     # swallowed exception
rg 'catch\s*\(.*\)\s*\{\s*\}' --type js --type ts                   # empty catch

# Observability
rg 'print\(' --type py                                               # print as logging
rg 'console\.log' --type js --type ts                                 # console as logging

# Deployment
rg 'localhost|127\.0\.0\.1' --type py --type js --type ts             # hardcoded hosts

# Database
rg 'SELECT \*' --type py --type js                                    # SELECT star

# Docker (check Dockerfile directly)
# Look for: USER directive, HEALTHCHECK, .dockerignore existence
```

---

## Cross-References

Each category maps to a specialized skill for detailed fixes:

- **Security** → `production-security` for hardening patterns, `production-review` for OWASP detection
- **Error Handling** → `production-error-handling` for retry/circuit breaker patterns
- **Observability** → `production-monitoring` for OTEL/logging/metrics setup
- **Deployment** → `production-deploy` for pre-deployment checklist
- **Database** → `production-postgres` for migration safety and indexing
- **Container** → `production-docker` for multi-stage builds and hardening
- **Architecture** → `production-planner` for system design with production constraints
