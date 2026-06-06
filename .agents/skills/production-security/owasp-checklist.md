# OWASP Top 10 Quick-Reference Checklist

Standalone checklist for the OWASP Top 10 (2021 edition). Each category includes what to check, detection commands you can run against a codebase, and pointers for fixing issues.

---

## A01: Broken Access Control

**What to check:**
- [ ] Every endpoint has an explicit authorization check (not just authentication).
- [ ] Object-level checks prevent User A from accessing User B's data by changing an ID.
- [ ] No directory traversal in file-serving endpoints.
- [ ] Admin routes are protected by role checks, not just hidden from navigation.
- [ ] Prefer query scoping (`WHERE org_id = ?`) over post-query filtering.

**Detection commands:**

```bash
# List all route handlers — each one should have a Depends() or middleware auth check
rg '@app\.(get|post|put|patch|delete)\(' --type py

# Find endpoints that take a user_id param but may lack ownership checks
rg 'user_id.*:.*int' --type py

# Look for direct file path access from user input (directory traversal risk)
rg 'open\(.*request' --type py
rg 'os\.path\.join\(.*request' --type py
rg 'send_file\(.*request' --type py
```

**Fix:** Add `Depends(require_role(...))` or ownership checks to every endpoint. Scope database queries to the current user or organization.

---

## A02: Security Misconfiguration

**What to check:**
- [ ] Debug mode is off in production (`DEBUG=False`, no `--reload` in production).
- [ ] Security headers present on every response (HSTS, CSP, X-Content-Type-Options, X-Frame-Options).
- [ ] No default credentials in config files.
- [ ] Stack traces are not exposed to clients.
- [ ] HTTPS enforced (HSTS header set).
- [ ] Swagger/docs endpoints disabled in production.

**Detection commands:**

```bash
# Debug mode left on
rg 'DEBUG\s*=\s*True' --type py
rg 'debug.*=.*true' -i

# Default credentials
rg '(password|passwd)\s*=\s*"(admin|password|123|default|changeme)"' -i

# Swagger/docs not gated
rg 'docs_url|redoc_url' --type py

# Stack traces exposed
rg 'traceback\.format_exc\(\)|traceback\.print_exc\(\)' --type py
```

**Fix:** Use environment-specific settings. Disable docs in production (`docs_url=None` if `env == "production"`). Add `SecurityHeadersMiddleware`.

---

## A03: Injection

**What to check:**
- [ ] All SQL uses parameterized queries or ORM (no f-strings, no `%` formatting, no string concatenation).
- [ ] No `shell=True` with user-supplied input in subprocess calls.
- [ ] No `eval()` or `exec()` on user data.
- [ ] Template engines have auto-escaping enabled.

**Detection commands:**

```bash
# SQL injection candidates — Python
rg 'f"(SELECT|INSERT|UPDATE|DELETE)' --type py
rg '\.execute\(f"' --type py
rg '\.execute\(".*%s' --type py
rg '\.execute\(".*\+' --type py

# SQL injection candidates — JavaScript/TypeScript
rg '`(SELECT|INSERT|UPDATE|DELETE).*\$\{' --type js --type ts
rg '\.query\(`' --type js --type ts

# Command injection
rg 'shell=True' --type py
rg 'os\.system\(' --type py
rg 'child_process\.exec\(' --type js --type ts

# Code injection
rg 'eval\(' --type py --type js --type ts
rg 'exec\(' --type py
```

**Fix:** Use parameterized queries (`text("... :param")`, `{"param": value}`) or the ORM. Replace `shell=True` with argument lists. Remove all `eval()`/`exec()` on user input.

---

## A04: Insecure Design

**What to check:**
- [ ] Rate limiting on login, registration, and password reset.
- [ ] Generic error messages on login failure (no "user not found" vs "wrong password" distinction).
- [ ] Idempotency keys on financial/sensitive operations.
- [ ] Re-authentication required before sensitive actions (password change, email change, payment).

**Detection commands:**

```bash
# Missing rate limiting on auth endpoints
rg '@app\.post.*/auth/' --type py
rg 'limiter\.limit' --type py

# Account enumeration via distinct error messages
rg '"user not found"|"invalid email"|"no account"' -i --type py --type js --type ts

# Financial endpoints without idempotency
rg '(payment|charge|transfer|withdraw)' --type py -l
```

**Fix:** Apply `@limiter.limit("5/minute")` to all auth endpoints. Use "Invalid credentials" as a single error message for all login failures. Add idempotency key checks on mutation endpoints.

---

## A05: Security Logging Failures

**What to check:**
- [ ] Authentication failures logged with IP address and user agent.
- [ ] Authorization failures logged (403s).
- [ ] Logs include sufficient context: request ID, user ID, timestamp.
- [ ] Alerting configured on anomalous patterns (spike in 401s/403s).

**Detection commands:**

```bash
# Check that auth failure paths include logging
rg '401|403|Unauthorized|Forbidden' --type py -l
rg 'logger\.(warning|error|info).*auth' -i --type py

# Bare exceptions that swallow errors silently
rg 'except:$' --type py
rg 'except Exception.*:.*pass' --type py
rg 'catch.*\{\s*\}' --type js --type ts
```

**Fix:** Add structured logging (with request ID, user ID, IP) to every authentication and authorization failure path. Replace bare `except: pass` with logged exceptions.

---

## A06: Vulnerable and Outdated Components

**What to check:**
- [ ] `pip-audit` or `safety` runs in CI on every build.
- [ ] `npm audit` runs in CI on every build.
- [ ] Build fails on HIGH and CRITICAL findings.
- [ ] Dependabot or Renovate is enabled for automatic update PRs.
- [ ] No deprecated or unmaintained packages in use.

**Detection commands:**

```bash
# Python
pip-audit -r requirements.txt
pip-audit --desc

# Node.js
npm audit
npm audit --audit-level=high

# Go
govulncheck ./...

# Docker images
trivy image --severity HIGH,CRITICAL your-image:tag
trivy fs --severity HIGH,CRITICAL .
```

**Fix:** Add `pip-audit`/`npm audit` to CI with `--fail-on-vuln` or `--audit-level=high`. Enable Dependabot. Review and merge dependency update PRs weekly.

---

## A07: Identification and Authentication Failures

**What to check:**
- [ ] Passwords hashed with bcrypt or argon2id (never MD5, SHA1, SHA256 unsalted).
- [ ] JWT tokens have short expiry (15 min access, 7 day refresh).
- [ ] JWT validation specifies `algorithms=["HS256"]` explicitly (prevents `none` algorithm attack).
- [ ] Account lockout or exponential backoff after repeated failures.
- [ ] Tokens stored in HttpOnly secure cookies, not localStorage.

**Detection commands:**

```bash
# Weak password hashing
rg 'md5\(|sha1\(' --type py --type js --type ts
rg 'hashlib\.(md5|sha1)\(' --type py

# JWT without explicit algorithm
rg 'jwt\.decode\(' --type py
rg 'jwt\.verify\(' --type js --type ts
# then check: does each call include algorithms= / algorithms: ?

# Tokens in localStorage
rg 'localStorage\.(setItem|getItem).*token' --type js --type ts
```

**Fix:** Switch to `passlib[bcrypt]` or `argon2-cffi`. Always pass `algorithms=["HS256"]` to JWT decode/verify. Store tokens in HttpOnly cookies with `secure=True` and `samesite="lax"`.

---

## A08: Software and Data Integrity Failures

**What to check:**
- [ ] No `pickle.loads()` on user-supplied data.
- [ ] No `yaml.load()` — use `yaml.safe_load()` instead.
- [ ] No `eval()` on user input.
- [ ] CI/CD pipeline steps are pinned and protected.
- [ ] Artifacts are signed or checksummed.

**Detection commands:**

```bash
# Unsafe deserialization
rg 'pickle\.(loads?|load)\(' --type py
rg 'yaml\.load\(' --type py
rg 'eval\(' --type py --type js --type ts

# Unpinned CI actions (GitHub Actions)
rg 'uses:.*@(main|master|latest)' --glob '*.yml' --glob '*.yaml'
```

**Fix:** Replace `pickle.loads` with JSON + Pydantic validation. Replace `yaml.load` with `yaml.safe_load`. Pin CI action versions to commit SHAs.

---

## A09: Server-Side Request Forgery (SSRF)

**What to check:**
- [ ] URLs from user input are validated before fetching.
- [ ] Internal IP ranges are blocked (169.254.x.x, 10.x.x.x, 172.16.x.x, 192.168.x.x, 127.x.x.x).
- [ ] No open redirects that attackers can chain.
- [ ] Webhook URLs are validated and restricted.

**Detection commands:**

```bash
# User-supplied URLs being fetched server-side
rg 'requests\.(get|post|put|delete)\(' --type py
rg 'httpx\.(get|post|put|delete|AsyncClient)\(' --type py
rg 'urllib\.request\.urlopen\(' --type py
rg 'fetch\(' --type js --type ts

# Open redirects
rg 'redirect\(.*request\.(args|query|params)' --type py --type js --type ts
```

**Fix:** Validate and sanitize user-supplied URLs. Maintain an allowlist of permitted domains. Block RFC 1918 and link-local IP ranges before making any outbound request.

---

## A10: Insufficient Logging and Monitoring

**What to check:**
- [ ] No bare `except: pass` — errors are logged with context.
- [ ] No empty `catch {}` blocks.
- [ ] Exceptions fail closed (deny access on error, don't silently allow).
- [ ] Error responses use correct HTTP status codes (401, 403, 422, 500), not `200 + {"error": ...}`.

**Detection commands:**

```bash
# Exception swallowing
rg 'except:$' --type py
rg 'except Exception.*:.*pass' --type py
rg 'catch.*\{\s*\}' --type js --type ts

# Errors returned as 200
rg 'return.*200.*error' --type py --type js --type ts

# CORS wildcard (misconfigured monitoring surface)
rg 'allow_origins.*\*' --type py
rg "origin.*['\"]\\*['\"]" --type js --type ts
```

**Fix:** Replace bare `except: pass` with `except Exception as e: logger.exception(...)`. Ensure all error paths return appropriate HTTP status codes. Set up alerting on 4xx/5xx spikes.

---

## Running a Full Scan

Copy and run the combined detection commands to surface the most common issues in under a minute:

```bash
# Hardcoded secrets
rg '(password|secret|api_key|token)\s*=\s*"[^"]{8,}"' -i
rg 'sk_(live|test)_[a-zA-Z0-9]{20,}'
rg 'AKIA[0-9A-Z]{16}'

# SQL injection
rg 'f"(SELECT|INSERT|UPDATE|DELETE)' --type py
rg '`(SELECT|INSERT|UPDATE|DELETE).*\$\{' --type js --type ts

# Command injection
rg 'shell=True' --type py
rg 'os\.system\(' --type py

# Unsafe deserialization
rg 'pickle\.(loads?|load)\(' --type py
rg 'yaml\.load\(' --type py
rg 'eval\(' --type py --type js --type ts

# Debug mode
rg 'DEBUG\s*=\s*True' --type py

# CORS wildcard
rg 'allow_origins.*\*' --type py

# Weak hashing
rg 'md5\(|sha1\(' --type py --type js --type ts

# Exception swallowing
rg 'except:$' --type py
rg 'except Exception.*:.*pass' --type py
rg 'catch.*\{\s*\}' --type js --type ts
```
