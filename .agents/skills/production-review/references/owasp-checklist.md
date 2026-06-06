# OWASP Top 10:2025 — Detection Patterns for Code Review

This reference provides concrete detection strategies for each OWASP Top 10 category. For each vulnerability: what to search for, what patterns indicate a problem, and how to fix it with real code examples.

---

## A01:2025 — Broken Access Control

The most common web application vulnerability. Every endpoint must enforce authorization, not just authentication.

### Detection Patterns

**What to grep for:**
```
# Missing auth decorators/dependencies
@app.get("/admin         # FastAPI route without Depends(...)
@app.route("/admin       # Flask route without @login_required
router.get("/admin       # Express route without middleware
```

**What to look for manually:**
- Endpoints that accept an ID parameter and do not verify the requester owns that resource
- Admin/management endpoints protected only by being "hidden" (not linked in UI)
- File download endpoints where the path comes from user input
- Bulk/export endpoints with no access scoping

### Python — FastAPI

```python
# BAD: No authorization — any authenticated user can access any user's data
@app.get("/users/{user_id}/billing")
async def get_billing(user_id: int, db: Session = Depends(get_db)):
    return db.query(Billing).filter(Billing.user_id == user_id).first()

# GOOD: Object-level authorization
@app.get("/users/{user_id}/billing")
async def get_billing(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    billing = db.query(Billing).filter(Billing.user_id == user_id).first()
    if not billing:
        raise HTTPException(status_code=404, detail="Not found")
    return billing
```

```python
# BAD: Path traversal via user input
@app.get("/files/{filename}")
async def get_file(filename: str):
    return FileResponse(f"/data/uploads/{filename}")
    # Attacker sends: GET /files/../../etc/passwd

# GOOD: Validate and sanitize file paths
import os

@app.get("/files/{filename}")
async def get_file(filename: str):
    safe_name = os.path.basename(filename)  # strips directory traversal
    file_path = os.path.join("/data/uploads", safe_name)
    resolved = os.path.realpath(file_path)
    if not resolved.startswith("/data/uploads/"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not os.path.exists(resolved):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(resolved)
```

### Python — Django

```python
# BAD: No permission check on view
class InvoiceDetailView(DetailView):
    model = Invoice
    # Any logged-in user can view any invoice by changing the URL

# GOOD: Object-level permission
class InvoiceDetailView(LoginRequiredMixin, DetailView):
    model = Invoice

    def get_queryset(self):
        return Invoice.objects.filter(organization=self.request.user.organization)
```

### Node.js — Express

```javascript
// BAD: No authorization middleware
router.get('/users/:userId/settings', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.params.userId });
  res.json(settings);
});

// GOOD: Ownership check
router.get('/users/:userId/settings', authenticate, async (req, res) => {
  if (req.user.id !== req.params.userId && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const settings = await UserSettings.findOne({ userId: req.params.userId });
  if (!settings) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(settings);
});
```

### Go

```go
// BAD: No ownership check
func GetUserProfile(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "userID")
    profile, _ := db.GetProfile(r.Context(), userID)
    json.NewEncoder(w).Encode(profile)
}

// GOOD: Ownership verified from JWT claims
func GetUserProfile(w http.ResponseWriter, r *http.Request) {
    userID := chi.URLParam(r, "userID")
    claims := r.Context().Value("claims").(*Claims)
    if claims.UserID != userID && !claims.IsAdmin {
        http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
        return
    }
    profile, err := db.GetProfile(r.Context(), userID)
    if err != nil {
        http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
        return
    }
    json.NewEncoder(w).Encode(profile)
}
```

---

## A02:2025 — Security Misconfiguration

Default configs, debug modes, verbose errors, missing security headers.

### Detection Patterns

**What to grep for:**
```
DEBUG = True
debug=True
app.debug = True
FLASK_DEBUG=1
DJANGO_DEBUG=True
NODE_ENV=development        # in production config/Dockerfile
AllowedHosts = ["*"]        # Django
ALLOWED_HOSTS.*\*           # Django
```

**Security headers to check for:**
```
Strict-Transport-Security    # HSTS — force HTTPS
Content-Security-Policy      # CSP — prevent XSS
X-Content-Type-Options       # Prevent MIME sniffing
X-Frame-Options              # Prevent clickjacking
Referrer-Policy              # Control referrer leakage
Permissions-Policy           # Restrict browser features
```

### Python — FastAPI

```python
# BAD: No security headers
app = FastAPI()

# GOOD: Security headers via middleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

app = FastAPI(docs_url=None if PRODUCTION else "/docs",  # disable Swagger in prod
              redoc_url=None if PRODUCTION else "/redoc")

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response

app.add_middleware(TrustedHostMiddleware, allowed_hosts=["api.example.com"])
```

### Node.js — Express

```javascript
// BAD: No security headers
const app = express();

// GOOD: Use helmet for security headers
const helmet = require('helmet');
const app = express();
app.use(helmet());
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.contentSecurityPolicy({
  directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"] },
}));

// Also disable X-Powered-By (helmet does this by default)
// Disable detailed error messages in production
if (process.env.NODE_ENV === 'production') {
  app.set('env', 'production');  // Express hides stack traces
}
```

### Go

```go
// GOOD: Security headers middleware
func SecurityHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        w.Header().Set("Content-Security-Policy", "default-src 'self'")
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        next.ServeHTTP(w, r)
    })
}
```

---

## A03:2025 — Injection

SQL injection, command injection, template injection, LDAP injection.

### Detection Patterns

**SQL injection — what to grep for:**
```
f"SELECT .* FROM         # Python f-string SQL
f"INSERT INTO            # Python f-string SQL
f"UPDATE .* SET          # Python f-string SQL
f"DELETE FROM            # Python f-string SQL
.format(.*SELECT         # Python .format() SQL
"SELECT.*" \+            # String concatenation SQL (JS, Go, Java)
`SELECT.*\$\{            # Template literal SQL (JS)
fmt.Sprintf.*SELECT      # Go fmt in SQL
```

**Command injection — what to grep for:**
```
os.system(               # Python — always vulnerable
subprocess.*shell=True   # Python — vulnerable with user input
exec(                    # Python/JS — code execution
eval(                    # Python/JS — code execution
child_process.exec(      # Node.js — shell command
os/exec.Command.*sh.*-c  # Go — shell command
```

### Python

```python
# BAD: SQL injection via f-string
@app.get("/search")
async def search(q: str, db: Session = Depends(get_db)):
    result = db.execute(f"SELECT * FROM products WHERE name LIKE '%{q}%'")
    return result.fetchall()

# GOOD: Parameterized query
from sqlalchemy import text

@app.get("/search")
async def search(q: str, db: Session = Depends(get_db)):
    result = db.execute(
        text("SELECT * FROM products WHERE name LIKE :query"),
        {"query": f"%{q}%"}
    )
    return result.fetchall()

# BEST: Use the ORM
@app.get("/search")
async def search(q: str, db: Session = Depends(get_db)):
    return db.query(Product).filter(Product.name.ilike(f"%{q}%")).all()
```

```python
# BAD: Command injection
@app.post("/convert")
async def convert(filename: str):
    os.system(f"convert {filename} output.pdf")
    # Attacker sends: filename="; rm -rf /"

# GOOD: Argument list, no shell
import subprocess

@app.post("/convert")
async def convert(filename: str):
    safe_name = os.path.basename(filename)
    result = subprocess.run(
        ["convert", safe_name, "output.pdf"],
        capture_output=True,
        timeout=30,
        check=True,
    )
```

### Node.js

```javascript
// BAD: SQL injection via template literal
app.get('/search', async (req, res) => {
  const results = await db.query(`SELECT * FROM products WHERE name LIKE '%${req.query.q}%'`);
  res.json(results.rows);
});

// GOOD: Parameterized query
app.get('/search', async (req, res) => {
  const results = await db.query(
    'SELECT * FROM products WHERE name LIKE $1',
    [`%${req.query.q}%`]
  );
  res.json(results.rows);
});
```

```javascript
// BAD: Command injection
const { exec } = require('child_process');
app.post('/resize', (req, res) => {
  exec(`convert ${req.body.filename} -resize 50% output.jpg`);
});

// GOOD: Use execFile with argument array
const { execFile } = require('child_process');
app.post('/resize', (req, res) => {
  const safeName = path.basename(req.body.filename);
  execFile('convert', [safeName, '-resize', '50%', 'output.jpg'], (err) => {
    if (err) return res.status(500).json({ error: 'Conversion failed' });
    res.json({ status: 'ok' });
  });
});
```

### Go

```go
// BAD: SQL injection via fmt.Sprintf
func SearchHandler(w http.ResponseWriter, r *http.Request) {
    query := r.URL.Query().Get("q")
    rows, _ := db.Query(fmt.Sprintf("SELECT * FROM products WHERE name LIKE '%%%s%%'", query))
    // ...
}

// GOOD: Parameterized query
func SearchHandler(w http.ResponseWriter, r *http.Request) {
    query := r.URL.Query().Get("q")
    rows, err := db.QueryContext(r.Context(), "SELECT * FROM products WHERE name LIKE $1", "%"+query+"%")
    if err != nil {
        http.Error(w, `{"error":"query failed"}`, http.StatusInternalServerError)
        return
    }
    defer rows.Close()
    // ...
}
```

---

## A04:2025 — Insecure Design

Flaws in business logic, missing threat modeling, no rate limiting on sensitive operations.

### Detection Patterns

**What to look for:**
- Password reset that does not rate-limit token requests
- Account enumeration via different error messages ("user not found" vs "wrong password")
- No CAPTCHA or rate limiting on registration
- Financial operations without idempotency keys
- Missing re-authentication for sensitive actions (password change, email change, deletion)

### Examples

```python
# BAD: Account enumeration — different responses reveal whether email exists
@app.post("/login")
async def login(email: str, password: str):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(400, "User not found")  # reveals email exists
    if not verify_password(password, user.password_hash):
        raise HTTPException(400, "Wrong password")   # different message

# GOOD: Generic error message
@app.post("/login")
async def login(email: str, password: str):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
```

```python
# BAD: Payment endpoint with no idempotency
@app.post("/payments")
async def create_payment(amount: float, recipient: str):
    payment = Payment(amount=amount, recipient=recipient)
    db.add(payment)
    db.commit()
    charge_card(amount)  # double-submit = double charge

# GOOD: Idempotency key prevents duplicate charges
@app.post("/payments")
async def create_payment(
    amount: float,
    recipient: str,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
):
    existing = db.query(Payment).filter(Payment.idempotency_key == idempotency_key).first()
    if existing:
        return existing  # return cached result
    payment = Payment(amount=amount, recipient=recipient, idempotency_key=idempotency_key)
    db.add(payment)
    db.commit()
    charge_card(amount)
    return payment
```

---

## A05:2025 — Security Logging and Monitoring Failures

Insufficient logging to detect and respond to attacks.

### Detection Patterns

**What to look for:**
- No logging of authentication failures
- No logging of authorization failures (403s)
- No logging of input validation failures from suspicious sources
- Logs do not include enough context to investigate (no user ID, no IP, no request ID)
- No alerting on anomalous patterns (spike in 401s, spike in 500s)

```python
# BAD: Auth failure with no logging
@app.post("/login")
async def login(credentials: LoginRequest):
    user = authenticate(credentials.email, credentials.password)
    if not user:
        raise HTTPException(401, "Invalid credentials")

# GOOD: Log auth failures for security monitoring
import structlog
logger = structlog.get_logger()

@app.post("/login")
async def login(credentials: LoginRequest, request: Request):
    user = authenticate(credentials.email, credentials.password)
    if not user:
        logger.warning(
            "authentication_failed",
            email=credentials.email,
            ip=request.client.host,
            user_agent=request.headers.get("user-agent"),
        )
        raise HTTPException(401, "Invalid credentials")
    logger.info("authentication_succeeded", user_id=user.id, ip=request.client.host)
```

---

## A06:2025 — Vulnerable and Outdated Components

Using dependencies with known vulnerabilities.

### Detection Patterns

**What to check:**
```bash
# Python
pip-audit                              # scan for known CVEs
safety check -r requirements.txt       # alternative scanner

# Node.js
npm audit                              # built-in vulnerability scanner
npx auditjs ossi                       # alternative

# Go
govulncheck ./...                      # official Go vulnerability checker

# General
trivy fs .                             # scan project for vulnerabilities
```

**What to grep for:**
- Pinned versions that are very old (check PyPI/npm for latest)
- Use of deprecated packages (`request` in Node.js, `urllib2` in Python)
- Use of packages with known security issues (`pyyaml` < 5.1 with `yaml.load()`)

```python
# BAD: Unsafe YAML loading (arbitrary code execution before PyYAML 6.0)
import yaml
data = yaml.load(user_input)

# GOOD: Safe YAML loading
import yaml
data = yaml.safe_load(user_input)
```

---

## A07:2025 — Identification and Authentication Failures

Weak passwords, missing MFA, session management issues.

### Detection Patterns

**What to look for:**
- No password complexity requirements
- No account lockout after failed attempts
- Session tokens in URLs (not cookies)
- Session not invalidated on logout
- JWT with `none` algorithm accepted
- JWT secret key too short or hardcoded
- No token expiry or very long expiry (> 24h for access tokens)

```python
# BAD: JWT with no expiry and hardcoded secret
import jwt

def create_token(user_id: int) -> str:
    return jwt.encode({"user_id": user_id}, "mysecret", algorithm="HS256")

# GOOD: JWT with proper configuration
from datetime import datetime, timedelta, timezone
import jwt

def create_token(user_id: int) -> str:
    return jwt.encode(
        {
            "sub": str(user_id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
            "iat": datetime.now(timezone.utc),
            "jti": str(uuid.uuid4()),  # unique token ID for revocation
        },
        settings.JWT_SECRET_KEY,  # from environment, 256+ bits
        algorithm="HS256",
    )
```

```javascript
// BAD: JWT verification that accepts 'none' algorithm
const decoded = jwt.verify(token, secret);

// GOOD: Explicitly specify allowed algorithms
const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

---

## A08:2025 — Software and Data Integrity Failures

Untrusted data deserialization, CI/CD pipeline security, unsigned updates.

### Detection Patterns

**What to grep for:**
```
pickle.loads(           # Python — arbitrary code execution
pickle.load(            # Python — arbitrary code execution
marshal.loads(          # Python — unsafe deserialization
yaml.load(              # Python — unsafe without safe_load
json.loads(             # generally safe, but check what happens with the data
ObjectInputStream       # Java — unsafe deserialization
unserialize(            # PHP — unsafe deserialization
```

```python
# BAD: Pickle deserialization of user input (remote code execution)
import pickle

@app.post("/import")
async def import_data(file: UploadFile):
    data = pickle.loads(await file.read())
    return process(data)

# GOOD: Use safe serialization formats
import json

@app.post("/import")
async def import_data(file: UploadFile):
    try:
        data = json.loads(await file.read())
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON")
    validated = ImportSchema(**data)  # Pydantic validation
    return process(validated)
```

---

## A09:2025 — Server-Side Request Forgery (SSRF)

Application fetches a URL provided by the user without validation.

### Detection Patterns

**What to grep for:**
```
requests.get(.*user       # Python requests with user-supplied URL
httpx.get(.*user          # Python httpx with user-supplied URL
fetch(.*req.body          # Node.js fetch with user-supplied URL
http.Get(.*user           # Go http with user-supplied URL
urllib.request.urlopen(   # Python urllib with user-supplied URL
```

```python
# BAD: SSRF — user controls the URL
@app.post("/fetch-preview")
async def fetch_preview(url: str):
    response = httpx.get(url)  # attacker sends http://169.254.169.254/latest/meta-data/
    return {"content": response.text}

# GOOD: URL validation and restriction
from urllib.parse import urlparse
import ipaddress

ALLOWED_SCHEMES = {"http", "https"}
BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / cloud metadata
    ipaddress.ip_network("127.0.0.0/8"),
]

def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("Invalid scheme")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(parsed.hostname))
    except (socket.gaierror, ValueError):
        raise ValueError("Cannot resolve hostname")
    for network in BLOCKED_NETWORKS:
        if ip in network:
            raise ValueError("Blocked destination")
    return url

@app.post("/fetch-preview")
async def fetch_preview(url: str):
    safe_url = validate_url(url)
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(safe_url, follow_redirects=False)
    return {"content": response.text[:10000]}  # limit response size
```

---

## A10:2025 — Insufficient Logging & Monitoring

(Formerly "Insufficient Logging & Monitoring" in 2021, now broadened to include mishandling of exceptions.)

### Detection Patterns

**What to grep for:**
```
except:$                    # bare except (Python)
except Exception:.*pass     # swallowed exception (Python)
except Exception as e:.*pass
catch (e) \{\}              # empty catch (JS)
catch \(.*\) \{\s*\}       # empty catch (JS/Java)
_ = err                     # ignored error (Go)
```

```python
# BAD: Exception swallowing — hides real errors
try:
    result = external_api.call(data)
except Exception:
    pass  # if this fails, we'll never know

# BAD: Overly broad catch returns success on failure
try:
    process_payment(order)
except Exception:
    return {"status": "ok"}  # payment failed but client thinks it succeeded

# GOOD: Log the error, return appropriate status
try:
    result = external_api.call(data)
except ExternalAPIError as e:
    logger.error("external_api_failed", error=str(e), request_id=request_id)
    raise HTTPException(502, detail="Upstream service unavailable")
except Exception as e:
    logger.exception("unexpected_error", error=str(e), request_id=request_id)
    raise HTTPException(500, detail="Internal server error")
```

```go
// BAD: Ignored error
result, err := db.Query(ctx, query)
_ = err  // silently drops the error

// GOOD: Handle the error
result, err := db.Query(ctx, query)
if err != nil {
    logger.Error("database query failed", "error", err, "query", query)
    return fmt.Errorf("querying users: %w", err)
}
```

---

## Quick Reference: What to Grep First

Run these searches at the start of any review to quickly identify the most common vulnerabilities:

```bash
# SQL injection
rg 'f"(SELECT|INSERT|UPDATE|DELETE)' --type py
rg '`(SELECT|INSERT|UPDATE|DELETE).*\$\{' --type js --type ts
rg 'fmt\.Sprintf.*"(SELECT|INSERT|UPDATE|DELETE)' --type go

# Command injection
rg 'shell=True' --type py
rg 'os\.system\(' --type py
rg 'child_process\.exec\(' --type js --type ts

# Hardcoded secrets
rg '(password|secret|api_key|token)\s*=\s*"[^"]{8,}"' -i
rg '(PASSWORD|SECRET|API_KEY|TOKEN)\s*=\s*"[^"]{8,}"'

# Debug mode
rg 'DEBUG\s*=\s*True' --type py
rg "debug.*=.*true" -i

# Unsafe deserialization
rg 'pickle\.(loads?|dumps?)' --type py
rg 'yaml\.load\(' --type py
rg 'eval\(' --type py --type js --type ts

# Missing auth
rg '@app\.(get|post|put|patch|delete)\(' --type py  # then check each for auth

# CORS wildcard
rg 'allow_origins.*\*' --type py
rg "origin.*['\"]\\*['\"]" --type js --type ts

# Bare except / error swallowing
rg 'except:$' --type py
rg 'except Exception.*:.*pass' --type py
rg 'catch.*\{\s*\}' --type js --type ts
```
