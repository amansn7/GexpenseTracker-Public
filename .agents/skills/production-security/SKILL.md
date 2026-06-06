---
name: production-security
description: "Production security hardening — secrets management, CORS policy, authentication patterns, authorization models, rate limiting, security headers, dependency scanning, and OWASP Top 10 awareness. Use this skill when the user works on authentication, authorization, secrets, CORS, rate limiting, security headers, or any security-adjacent code. Also trigger when user says /production security."
---

# Production Security

This skill encodes the security patterns that stop your application from becoming a headline. Every recommendation here comes from real breaches, real CVE exploits, and real incident reports — not theoretical threat models. The patterns are opinionated because security is not a place for "it depends." If you ship with `allow_origins=["*"]`, hardcoded API keys, or MD5 password hashes, you are not making a tradeoff — you are making a mistake.

---

## 1. Secrets Management

**The #1 rule: secrets never touch code, ever.** Not in variables, not in comments, not in "temporary" config files, not in Docker build args. If `git log -p` or `docker history --no-trunc` can reveal a secret, you have a breach waiting to happen.

### Environment Variables for Local Dev

```python
# settings.py — Pydantic settings, fails fast on missing secrets
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str              # REQUIRED — no default, crash on startup if missing
    jwt_secret_key: str            # REQUIRED
    stripe_api_key: str            # REQUIRED
    redis_url: str = "redis://localhost:6379/0"
    environment: str = "development"
```

```bash
# .env — MUST be in .gitignore
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
JWT_SECRET_KEY=your-256-bit-secret-here
STRIPE_API_KEY=sk_test_...
```

### Secret Managers for Production

Never use `.env` files in production. Use a proper secret manager:

```python
# GCP Secret Manager
from google.cloud import secretmanager

def get_secret(project_id: str, secret_id: str, version: str = "latest") -> str:
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/{version}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# AWS Secrets Manager
import boto3

def get_secret(secret_name: str, region: str = "us-east-1") -> str:
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    return response["SecretString"]
```

Other production-grade options: HashiCorp Vault, Doppler, 1Password Secrets Automation.

### Docker: BuildKit Secrets Only

```dockerfile
# syntax=docker/dockerfile:1

# GOOD — secret never appears in image layers
RUN --mount=type=secret,id=pip_index_url \
    PIP_INDEX_URL=$(cat /run/secrets/pip_index_url) \
    pip install --no-cache-dir -r requirements.txt
```

```bash
DOCKER_BUILDKIT=1 docker build --secret id=pip_index_url,src=.pip_credentials .
```

**What NEVER to do:**

```dockerfile
# ALL OF THESE LEAK SECRETS INTO IMAGE LAYERS:
ARG DATABASE_URL=postgresql://...     # visible in docker history
ENV API_KEY=sk_live_...               # visible in docker inspect
COPY .env /app/.env                   # baked into a layer forever
COPY id_rsa /root/.ssh/               # private key in the image
```

For complete container secret patterns, see **production-docker** section 4.

### Secret Rotation

Design for rotation from day one. Secrets will be compromised — the question is how fast you can rotate.

```python
# Restart-based rotation (minimum viable)
# Change the secret in your secret manager, then rolling-restart the service.
# Works if your deploy pipeline is fast (< 5 minutes).

# Zero-downtime rotation (preferred for databases, API keys)
# Accept both old and new secret during a transition window.
def verify_jwt(token: str) -> dict:
    """Try current key first, fall back to previous key."""
    for key in [settings.jwt_secret_key, settings.jwt_secret_key_previous]:
        if key is None:
            continue
        try:
            return jwt.decode(token, key, algorithms=["HS256"])
        except jwt.InvalidSignatureError:
            continue
    raise HTTPException(status_code=401, detail="Invalid token")
```

### Pre-Commit Hooks: Catch Secrets Before They Ship

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']

  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks
```

```bash
# Generate baseline (marks existing false positives)
detect-secrets scan > .secrets.baseline

# One-time scan for hardcoded secrets
gitleaks detect --source . --verbose
trufflehog filesystem . --only-verified
```

### Detection: Grep for Hardcoded Secrets

```bash
# Run these on any codebase to find secrets that should not be there
rg '(password|secret|api_key|token|private_key)\s*=\s*"[^"]{8,}"' -i --type py --type js --type ts
rg '(PASSWORD|SECRET|API_KEY|TOKEN)\s*=\s*"[^"]{8,}"'
rg 'sk_(live|test)_[a-zA-Z0-9]{20,}'          # Stripe keys
rg 'AKIA[0-9A-Z]{16}'                          # AWS access keys
rg 'ghp_[a-zA-Z0-9]{36}'                       # GitHub personal access tokens
rg 'xox[bpas]-[a-zA-Z0-9-]+'                   # Slack tokens
rg '-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----'  # Private keys
```

---

## 2. CORS Configuration

CORS (Cross-Origin Resource Sharing) controls which origins can make requests to your API from a browser. Get it wrong and you either block your own frontend or open your API to every site on the internet.

### What CORS Protects Against (And What It Does Not)

**CORS prevents:** A malicious site (`evil.com`) from making authenticated requests to your API using a victim's browser cookies. Without CORS, any site could read your API responses if the user is logged in.

**CORS does NOT prevent:** Server-to-server attacks, API key theft from client-side code, or attacks from non-browser clients (curl, Postman, bots). CORS is a browser-only enforcement mechanism.

### Python FastAPI

```python
from fastapi.middleware.cors import CORSMiddleware

# GOOD — specific origins, explicit methods and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://app.example.com",
        "https://staging.example.com",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,  # preflight cache: 10 minutes
)
```

```python
# DANGEROUS — never do this in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # Any site can make requests
    allow_credentials=True,      # Combined with *, this is a security hole
    allow_methods=["*"],         # Exposes every HTTP method
    allow_headers=["*"],         # Accepts any header
)
```

### Node.js Express

```javascript
const cors = require('cors');

// GOOD — explicit whitelist
const allowedOrigins = [
  'https://app.example.com',
  'https://staging.example.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  maxAge: 600,
}));
```

### CORS Rules

- Never `allow_origins=["*"]` when `allow_credentials=True` — browsers actually reject this combination, but it signals you have not thought about your CORS policy
- Whitelist specific origins — your frontend domain(s), your staging domain, nothing else
- `allow_methods` — only the methods your API actually uses. If you do not support PATCH, do not allow PATCH
- `allow_headers` — only `Authorization` and `Content-Type` for most APIs
- `max_age` — set to 600 (10 min) to reduce preflight requests. Do not set to 86400 in dev (causes stale CORS debugging)

---

## 3. Authentication Patterns

### JWT: Short-Lived Access, Long-Lived Refresh

```
Access token:  15 minutes     (carried on every request)
Refresh token: 7 days         (used only to get new access tokens)
```

Access tokens are short-lived so that if stolen, the damage window is small. Refresh tokens are long-lived but can be revoked server-side.

### JWT Storage: HttpOnly Cookies, Not localStorage

```python
# Python FastAPI — set tokens as HttpOnly cookies
from fastapi.responses import JSONResponse

@app.post("/auth/login")
async def login(credentials: LoginRequest, response: Response):
    user = authenticate(credentials.email, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(user.id, expires_minutes=15)
    refresh_token = create_refresh_token(user.id, expires_days=7)

    response = JSONResponse(content={"message": "Logged in"})
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,          # JavaScript cannot read this cookie
        secure=True,            # HTTPS only
        samesite="lax",         # CSRF protection
        max_age=900,            # 15 minutes
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=604800,         # 7 days
        path="/auth/refresh",   # only sent to refresh endpoint
    )
    return response
```

**Why not localStorage?** Any XSS vulnerability gives the attacker full access to tokens stored in localStorage. HttpOnly cookies are invisible to JavaScript — XSS cannot read them.

### JWT Validation

```python
# Python — PyJWT
import jwt
from datetime import datetime, timezone

def validate_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=["HS256"],      # ALWAYS specify algorithms explicitly
            options={
                "require": ["exp", "sub", "iat"],
                "verify_exp": True,
            },
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

```javascript
// Node.js — jsonwebtoken
const jwt = require('jsonwebtoken');

function validateAccessToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET_KEY, {
      algorithms: ['HS256'],  // ALWAYS specify — prevents 'none' algorithm attack
      complete: false,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new HttpError(401, 'Token expired');
    }
    throw new HttpError(401, 'Invalid token');
  }
}
```

### Password Hashing: bcrypt or argon2id

```python
# Python — passlib with bcrypt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)
```

```python
# Python — argon2id (preferred for new projects)
from argon2 import PasswordHasher

ph = PasswordHasher(
    time_cost=3,          # iterations
    memory_cost=65536,    # 64MB
    parallelism=4,
)

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except Exception:
        return False
```

**Never use:** MD5, SHA1, SHA256 (unsalted), or any general-purpose hash for passwords. These are fast by design — attackers can brute-force billions of hashes per second. bcrypt and argon2id are intentionally slow.

### OAuth2 Flows

- **Authorization Code** — for server-rendered web apps. Server exchanges code for tokens, tokens never touch the browser.
- **Authorization Code + PKCE** — for SPAs and mobile apps. Same flow, but with a code verifier to prevent interception.
- **Client Credentials** — for service-to-service. No user involved.
- **Never use Implicit flow** — deprecated, tokens exposed in URL fragments.

### API Keys for Service-to-Service

```python
# Hash API keys before storing (same as passwords)
import hashlib
import secrets

def generate_api_key() -> tuple[str, str]:
    """Returns (raw_key_for_client, hashed_key_for_storage)."""
    raw_key = f"sk_{secrets.token_urlsafe(32)}"
    hashed = hashlib.sha256(raw_key.encode()).hexdigest()
    return raw_key, hashed

def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    return hashlib.sha256(raw_key.encode()).hexdigest() == stored_hash
```

**Never roll your own crypto.** Use established libraries: PyJWT, python-jose, passlib, argon2-cffi, jsonwebtoken (Node.js). If you are implementing a cryptographic primitive, you are doing it wrong.

---

## 4. Authorization Models

Authentication answers "who are you?" Authorization answers "what can you do?"

### RBAC (Role-Based Access Control)

Best for most applications. Users have roles, roles have permissions.

```python
# FastAPI — role-based authorization with Depends
from enum import Enum
from fastapi import Depends, HTTPException

class Role(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"

def require_role(*allowed_roles: Role):
    """Dependency that enforces role-based access."""
    async def check_role(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="Insufficient permissions",
            )
        return current_user
    return check_role

# Usage
@app.get("/admin/users")
async def list_all_users(
    user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    return db.query(User).all()

@app.get("/reports")
async def get_reports(
    user: User = Depends(require_role(Role.ADMIN, Role.MANAGER)),
    db: Session = Depends(get_db),
):
    return db.query(Report).filter(Report.org_id == user.org_id).all()
```

### Object-Level Authorization

The most commonly missed authorization check. User A must not access User B's resources by changing an ID in the URL.

```python
# BAD — any authenticated user can access any user's orders
@app.get("/users/{user_id}/orders")
async def get_orders(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Order).filter(Order.user_id == user_id).all()

# GOOD — ownership check
@app.get("/users/{user_id}/orders")
async def get_orders(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id and current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(Order).filter(Order.user_id == user_id).all()

# BEST — scope queries to the current user, no ID needed
@app.get("/orders")
async def get_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Order).filter(Order.user_id == current_user.id).all()
```

### ABAC (Attribute-Based Access Control)

For fine-grained control when RBAC is not enough (multi-tenant, time-based, resource-attribute-based):

```python
def check_access(user: User, resource: Resource, action: str) -> bool:
    """Attribute-based policy evaluation."""
    # Same organization
    if user.org_id != resource.org_id:
        return False
    # Time-based: read-only outside business hours
    if action == "write" and not is_business_hours():
        return user.role == Role.ADMIN
    # Resource-attribute: only owner or admin can delete
    if action == "delete":
        return resource.owner_id == user.id or user.role == Role.ADMIN
    return True
```

### Authorization Rules

- Authorization always happens server-side — never trust client-side role checks
- Every endpoint has an explicit authorization check — missing auth is worse than wrong auth
- Prefer query scoping (`WHERE org_id = ?`) over post-query filtering — stops data leaks at the database level
- Log authorization failures — they indicate either bugs or attacks

---

## 5. Rate Limiting

Rate limiting prevents abuse: brute-force attacks, credential stuffing, API scraping, and accidental client-side infinite loops.

### Python: slowapi

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "type": "https://api.example.com/errors/rate_limited",
            "title": "Rate Limit Exceeded",
            "status": 429,
            "detail": "Too many requests. Slow down.",
        },
        headers={"Retry-After": str(exc.retry_after)},
    )

# General API: 60 requests/minute per IP
@app.get("/api/items")
@limiter.limit("60/minute")
async def list_items(request: Request):
    ...

# Auth endpoints: MUCH stricter — 5 attempts/minute
@app.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request):
    ...

@app.post("/auth/register")
@limiter.limit("3/minute")
async def register(request: Request):
    ...

@app.post("/auth/password-reset")
@limiter.limit("3/minute")
async def password_reset(request: Request):
    ...
```

### Node.js: express-rate-limit

```javascript
const rateLimit = require('express-rate-limit');

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 60,                     // 60 requests per window
  standardHeaders: true,       // Return rate limit info in headers
  legacyHeaders: false,
  message: { error: 'Too many requests', retryAfter: 60 },
});

// Auth limiter — much stricter
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts', retryAfter: 60 },
});

app.use('/api/', apiLimiter);
app.use('/auth/', authLimiter);
```

### Rate Limiting Rules

- Apply to ALL public endpoints, not just auth
- Auth endpoints (login, register, password reset) get 10-12x stricter limits than general endpoints
- Always return `429 Too Many Requests` with a `Retry-After` header — well-behaved clients need this
- Log rate limit hits — a spike indicates an attack or a misbehaving client
- Prefer **sliding window** over fixed window — fixed window allows burst at window boundaries (e.g., 60 requests at :59 and 60 more at :00)
- For distributed systems, use Redis-backed rate limiting (not in-memory, which is per-process)

For additional rate limiting patterns in FastAPI, see **production-fastapi** section 9.

---

## 6. Security Headers

Security headers are your defense-in-depth layer. They instruct browsers to enforce security policies even if your application code has bugs.

### The Required Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Force HTTPS for 2 years, including subdomains |
| `Content-Security-Policy` | `default-src 'self'` | Prevent XSS by restricting resource loading |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing attacks |
| `X-Frame-Options` | `DENY` | Prevent clickjacking via iframes |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control what URL info leaks to other sites |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable browser features you do not use |
| `X-XSS-Protection` | `0` | Disable broken legacy XSS filter (CSP replaces it) |

### Python FastAPI — Pure ASGI Middleware

```python
from starlette.types import ASGIApp, Receive, Scope, Send

class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.headers = [
            (b"strict-transport-security", b"max-age=63072000; includeSubDomains"),
            (b"content-security-policy", b"default-src 'self'"),
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"x-xss-protection", b"0"),
            (b"referrer-policy", b"strict-origin-when-cross-origin"),
            (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
        ]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(self.headers)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)

# Register in middleware stack
app.add_middleware(SecurityHeadersMiddleware)
```

### Node.js Express — Helmet

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // only if needed
      imgSrc: ["'self'", "data:"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// Helmet sets X-Content-Type-Options, X-XSS-Protection, etc. by default
```

### CSP Tuning

Content-Security-Policy is the most powerful and most frequently misconfigured header. Start strict, relax only what you must:

```
# API-only service (no HTML responses)
Content-Security-Policy: default-src 'none'

# Web app with inline styles (common with CSS-in-JS)
Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.example.com; script-src 'self'

# Start with report-only to test without breaking anything
Content-Security-Policy-Report-Only: default-src 'self'; report-uri /csp-report
```

---

## 7. SQL Injection Prevention

SQL injection is the oldest and most preventable vulnerability in web applications. It still makes the OWASP Top 10 because developers still use string interpolation in queries.

### The Rule: Always Parameterized Queries

```python
# DANGEROUS — SQL injection via f-string
@app.get("/search")
async def search(q: str, db: Session = Depends(get_db)):
    result = db.execute(f"SELECT * FROM products WHERE name LIKE '%{q}%'")
    return result.fetchall()
    # Attacker sends: q = "'; DROP TABLE products; --"

# SAFE — parameterized query
from sqlalchemy import text

@app.get("/search")
async def search(q: str, db: Session = Depends(get_db)):
    result = db.execute(
        text("SELECT * FROM products WHERE name LIKE :query"),
        {"query": f"%{q}%"},
    )
    return result.fetchall()

# SAFEST — use the ORM
@app.get("/search")
async def search(q: str, db: Session = Depends(get_db)):
    return db.query(Product).filter(Product.name.ilike(f"%{q}%")).all()
```

```javascript
// DANGEROUS — template literal SQL
app.get('/search', async (req, res) => {
  const results = await db.query(
    `SELECT * FROM products WHERE name LIKE '%${req.query.q}%'`
  );
  res.json(results.rows);
});

// SAFE — parameterized query
app.get('/search', async (req, res) => {
  const results = await db.query(
    'SELECT * FROM products WHERE name LIKE $1',
    [`%${req.query.q}%`]
  );
  res.json(results.rows);
});
```

### Watch for Raw SQL in ORM Code

ORMs prevent most injection, but developers bypass them:

```python
# DANGEROUS — raw SQL through ORM escape hatch
db.execute(f"SELECT * FROM users WHERE email = '{email}'")
db.execute("SELECT * FROM users WHERE email = '%s'" % email)
db.execute("SELECT * FROM users WHERE email = '" + email + "'")

# SAFE — all of these are parameterized
db.execute(text("SELECT * FROM users WHERE email = :email"), {"email": email})
db.query(User).filter(User.email == email).first()
db.query(User).filter_by(email=email).first()
```

### Detection

```bash
# Find SQL injection candidates in Python
rg 'f"(SELECT|INSERT|UPDATE|DELETE)' --type py
rg '\.execute\(f"' --type py
rg '\.execute\(".*%s' --type py
rg '\.execute\(".*\+' --type py

# Find SQL injection candidates in JavaScript/TypeScript
rg '`(SELECT|INSERT|UPDATE|DELETE).*\$\{' --type js --type ts
rg '\.query\(`' --type js --type ts
```

For complete injection detection patterns, see **production-review** reference: [OWASP detection patterns](../production-review/references/owasp-checklist.md).

---

## 8. Dependency Scanning

Your code is only as secure as your weakest dependency. A single vulnerable transitive dependency can give attackers remote code execution.

### Python

```bash
# pip-audit — checks against the Python Packaging Advisory Database
pip-audit -r requirements.txt
pip-audit --desc

# safety — alternative scanner
safety check -r requirements.txt
```

### Node.js

```bash
# Built-in npm audit
npm audit
npm audit --audit-level=high    # fail on HIGH+

# Fix automatically where possible
npm audit fix
```

### Go

```bash
govulncheck ./...
```

### Docker Images

```bash
# Trivy — scan image for OS and language vulnerabilities
trivy image --severity HIGH,CRITICAL your-image:tag

# Scan project directory
trivy fs --severity HIGH,CRITICAL .
```

### CI Integration: Fail the Build

```yaml
# GitHub Actions — pip-audit
- name: Security audit (Python)
  run: |
    pip install pip-audit
    pip-audit -r requirements.txt --desc --fail-on-vuln

# GitHub Actions — npm audit
- name: Security audit (Node.js)
  run: npm audit --audit-level=high

# GitHub Actions — Trivy image scan
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE }}
    exit-code: 1
    severity: HIGH,CRITICAL
    ignore-unfixed: true
```

### Automated Updates

Set up Dependabot or Renovate to open PRs for dependency updates automatically:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"
```

### Rules

- Scan in CI on every build — not just occasionally
- Fail the build on HIGH and CRITICAL findings
- Use `--ignore-unfixed` to suppress CVEs with no available fix (reduce noise)
- Review and merge dependency update PRs weekly — letting them pile up creates merge conflicts and audit fatigue
- Pin exact versions in lockfiles (package-lock.json, requirements.txt with hashes) for reproducible builds

For Docker-specific image scanning, see **production-docker** section 8.

---

## 9. Input Validation

Validate at the boundary. Every piece of data crossing your API surface is untrusted until your code says otherwise.

### Python: Pydantic with strict=True

```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Annotated
from decimal import Decimal

class CreateUserRequest(BaseModel):
    model_config = ConfigDict(strict=True)  # No type coercion — "123" is not an int

    email: Annotated[str, Field(max_length=255, pattern=r"^[\w.-]+@[\w.-]+\.\w+$")]
    name: Annotated[str, Field(min_length=1, max_length=100)]
    age: Annotated[int, Field(ge=0, le=150)] | None = None

class TransferRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    from_account: Annotated[str, Field(pattern=r"^[A-Z0-9]{10}$")]
    to_account: Annotated[str, Field(pattern=r"^[A-Z0-9]{10}$")]
    amount: Annotated[Decimal, Field(gt=0, le=1_000_000)]
    currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
```

### Node.js: Zod

```javascript
const { z } = require('zod');

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

// In Express middleware
app.post('/users', (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(422).json({ errors: result.error.issues });
  }
  // result.data is now typed and validated
  createUser(result.data);
});
```

### Request Size Limits

```python
# Uvicorn/Gunicorn — limit request body size
# --limit-request-line 8190
# --limit-request-field_size 8190

# Nginx — limit client body
# client_max_body_size 10m;
```

```javascript
// Express — body size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
```

### File Upload Validation

```python
import os
from fastapi import UploadFile, HTTPException

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

async def validate_upload(file: UploadFile) -> UploadFile:
    # Check content type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type {file.content_type} not allowed")

    # Check file size (read in chunks)
    size = 0
    chunk_size = 8192
    while chunk := await file.read(chunk_size):
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            raise HTTPException(400, "File too large (max 10MB)")
    await file.seek(0)  # reset for downstream processing

    # Sanitize filename — prevent path traversal
    safe_name = os.path.basename(file.filename or "upload")
    safe_name = "".join(c for c in safe_name if c.isalnum() or c in ".-_")
    file.filename = safe_name

    return file
```

### Input Validation Rules

- Validate at the API boundary, not deep in business logic — bad data should never reach your domain layer
- Use `strict=True` on models accepting external input — prevents type coercion attacks where `"true"` becomes `True`
- Set max lengths on every string field — unbounded strings become memory exhaustion attacks
- Validate file uploads: type, size, and sanitize filename
- Reject unexpected fields — do not silently ignore extra data in requests (use `extra="forbid"` in Pydantic)

For more Pydantic patterns, see **production-fastapi** section 6.

---

## 10. OWASP Top 10 Quick Reference

This is a rapid checklist. For full detection patterns and code examples, see **production-review** reference: [OWASP detection patterns](../production-review/references/owasp-checklist.md).

| # | Category | What to Check |
|---|----------|---------------|
| A01 | Broken Access Control | Every endpoint has authorization. Object-level checks prevent User A from accessing User B's data. No directory traversal. Admin routes are protected, not just hidden. |
| A02 | Security Misconfiguration | Debug mode off. Security headers present. No default credentials. Stack traces not exposed. HTTPS enforced. Swagger/docs disabled in production. |
| A03 | Injection | All SQL parameterized. No `shell=True` with user input. No `eval()` or `exec()` on user data. Template auto-escaping on. |
| A04 | Insecure Design | Rate limiting on sensitive operations. Generic error messages on login (no account enumeration). Idempotency keys on financial operations. Re-auth on sensitive actions. |
| A05 | Security Logging Failures | Auth failures logged with IP and user agent. Authorization failures logged. Sufficient context for investigation (request ID, user ID). Alerting on anomalies. |
| A06 | Vulnerable Components | `pip-audit` / `npm audit` in CI. Build fails on HIGH/CRITICAL. Dependabot or Renovate enabled. No deprecated packages. |
| A07 | Auth Failures | Password hashing with bcrypt/argon2id. JWT with short expiry and explicit algorithm. No `none` algorithm accepted. Account lockout after N failures. |
| A08 | Data Integrity Failures | No `pickle.loads()` on user input. No `yaml.load()` (use `safe_load`). No `eval()`. CI/CD pipeline protected. Signed artifacts. |
| A09 | SSRF | URL validation on user-supplied URLs. Block internal IP ranges (169.254.x.x, 10.x.x.x, 172.16.x.x, 192.168.x.x). No open redirects. |
| A10 | Logging & Monitoring | No bare `except: pass`. No empty `catch {}`. Errors logged with context. Exceptions fail closed (deny, not allow). |

---

## Anti-Patterns Table

| Anti-Pattern | Impact | Fix |
|---|---|---|
| `allow_origins=["*"]` with credentials | Any site can make authenticated requests | Whitelist specific origins |
| Secrets in code or Docker ARG/ENV | Credential exposure via git history or image layers | Environment variables + secret manager |
| `password = hashlib.md5(pw).hexdigest()` | Cracked in seconds with rainbow tables | bcrypt or argon2id |
| JWT in localStorage | XSS steals tokens | HttpOnly secure cookies |
| JWT with no expiry | Stolen token works forever | 15-min access + 7-day refresh |
| `jwt.decode(token, secret)` without `algorithms=` | Accepts `none` algorithm, bypasses signature | Always specify `algorithms=["HS256"]` |
| No rate limiting on `/login` | Credential stuffing and brute force | 5 attempts/minute per IP |
| `f"SELECT * FROM users WHERE id = {user_id}"` | SQL injection | Parameterized queries or ORM |
| `subprocess.run(cmd, shell=True)` with user input | Command injection | Argument list, no shell |
| No input validation | Memory exhaustion, injection, type confusion | Pydantic `strict=True` / Zod at boundary |
| Missing security headers | XSS, clickjacking, MIME sniffing | Middleware adds headers to every response |
| `pickle.loads(user_data)` | Remote code execution | JSON + Pydantic validation |
| No dependency scanning in CI | Known CVEs ship to production | `pip-audit` / `npm audit` in pipeline |
| `except Exception: pass` | Errors silently swallowed, attacks undetected | Log, alert, and fail closed |
| Same error for everything: `return 200, {"error": ...}` | Clients cannot distinguish error types, monitoring blind | Correct HTTP status codes (401, 403, 422, 500) |

---

## Detection: Quick Security Scan

Run these commands on any codebase to surface the most common security issues in under a minute:

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
rg 'child_process\.exec\(' --type js --type ts

# Unsafe deserialization
rg 'pickle\.(loads?|load)\(' --type py
rg 'yaml\.load\(' --type py
rg 'eval\(' --type py --type js --type ts

# Debug mode in production
rg 'DEBUG\s*=\s*True' --type py
rg 'debug.*=.*true' -i

# CORS wildcard
rg 'allow_origins.*\*' --type py
rg "origin.*['\"]\\*['\"]" --type js --type ts

# Missing auth on endpoints
rg '@app\.(get|post|put|patch|delete)\(' --type py

# Weak hashing
rg 'md5\(|sha1\(' --type py --type js --type ts

# Exception swallowing
rg 'except:$' --type py
rg 'except Exception.*:.*pass' --type py
rg 'catch.*\{\s*\}' --type js --type ts
```

---

## Cross-References

- For FastAPI-specific middleware, CORS, and rate limiting patterns, see **production-fastapi**
- For container secrets, non-root execution, and image scanning, see **production-docker**
- For database injection prevention and connection security, see **production-postgres**
- For full OWASP detection patterns and code review checklists, see **production-review**
- For architecture planning with security constraints from day one, see **production-planner**
