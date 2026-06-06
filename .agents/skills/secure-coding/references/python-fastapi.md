# Python FastAPI — Secure Coding

Covers FastAPI 0.100+ with Pydantic v2, SQLAlchemy 2.x, async drivers (asyncpg, aiomysql), and common auth libraries (`fastapi-users`, `python-jose`, `authlib`).

FastAPI gives you Pydantic validation for free — that's a meaningful security baseline — but everything else (auth, CSRF, rate limiting, headers) is BYO.

## Injection

### SQL injection

With SQLAlchemy 2.x:
```python
# SAFE
result = await session.execute(
    select(User).where(User.email == email)
)
result = await session.execute(
    text("SELECT * FROM users WHERE email = :e"), {"e": email}
)

# UNSAFE
await session.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))
```

With raw `asyncpg`:
```python
# SAFE
await conn.fetch("SELECT * FROM users WHERE id = $1", uid)
# UNSAFE
await conn.fetch(f"SELECT * FROM users WHERE id = {uid}")
```

For dynamic ORDER BY columns or table names, validate against an allowlist — never interpolate raw user input into SQL identifiers.

### Command injection

```python
# UNSAFE
await asyncio.create_subprocess_shell(f"convert {fname} out.png")

# SAFE
await asyncio.create_subprocess_exec("convert", fname, "out.png")
```

### NoSQL injection

For MongoDB via `motor`:
```python
# UNSAFE: user controls the operator
await db.users.find_one({"username": req.json["username"]})  # if username = {"$ne": null} → bypass

# SAFE: validate the field is a string via Pydantic
class LoginIn(BaseModel):
    username: str
    password: str

@app.post("/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"username": body.username})
```
The Pydantic model enforces type — that defeats the operator-injection trick.

## AuthN / AuthZ

### Auth dependencies

FastAPI's `Depends()` is the idiomatic way to enforce auth. Keep auth in a dependency, not in handler bodies:

```python
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401)
    user = await get_user(payload["sub"])
    if not user: raise HTTPException(401)
    return user

@app.get("/me")
async def me(user: User = Depends(get_current_user)):
    return user
```

For role-based:
```python
def require_role(role: str):
    async def dep(user: User = Depends(get_current_user)) -> User:
        if role not in user.roles: raise HTTPException(403)
        return user
    return dep

@app.delete("/admin/users/{id}", dependencies=[Depends(require_role("admin"))])
async def delete_user(id: int): ...
```

Apply auth dependencies via `dependencies=[...]` on `APIRouter` or `FastAPI` so the default is "authenticated" and you exempt specific public routes.

### JWT pitfalls

- Always specify `algorithms=["HS256"]` (or `["RS256"]`) when decoding — never let it default. Don't accept `none`.
- Verify `exp`, `nbf`, `iss`, `aud` (`jwt.decode(..., audience=..., issuer=...)`).
- Don't put sensitive data in JWT claims — they're just base64.
- Store JWTs in HttpOnly Secure SameSite cookies if served from the same origin (then you also need CSRF). Bearer tokens in `Authorization` header are CSRF-immune but vulnerable to XSS exfiltration if stored in `localStorage`.

### Password storage

```python
from passlib.context import CryptContext
pwd = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
hash = pwd.hash(password)
ok = pwd.verify(attempt, hash)
```

### IDOR

Pydantic doesn't help with authorization. Always check ownership:
```python
@app.get("/orders/{order_id}")
async def get_order(order_id: int, user: User = Depends(get_current_user)):
    order = await session.get(Order, order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(404)   # 404 not 403 to avoid id enumeration
    return order
```

## CSRF

FastAPI has no built-in CSRF protection. The decision tree:

- **Bearer tokens in `Authorization` header (typical for SPA + JWT)**: no CSRF needed, because cookies aren't ambient.
- **Cookies for auth (session cookies, cookie-stored JWTs)**: CSRF protection required. Use `fastapi-csrf-protect` or implement double-submit-cookie pattern.
- **Mixed (e.g., session cookie + Bearer token)**: defaults to "ambient credentials present" — needs CSRF.

Set `SameSite=Lax` (default in modern browsers) on auth cookies as defense-in-depth, but don't rely on it alone.

## Input validation

Pydantic v2 models on every endpoint:
```python
class CreateUser(BaseModel):
    email: EmailStr
    age: int = Field(ge=0, le=150)
    name: str = Field(min_length=1, max_length=100, pattern=r"^[\w\s\-']+$")

@app.post("/users")
async def create(body: CreateUser): ...
```

Common mistakes:
- Accepting raw `dict` or `Any` instead of a typed model — defeats validation.
- Using `model_extra = "allow"` lets extra fields through — keep `"forbid"` for create endpoints to prevent mass assignment.
- `response_model=` strips fields not declared on the model — use it to avoid leaking internal fields.

```python
class UserOut(BaseModel):
    id: int
    email: EmailStr
    # password_hash NOT included

@app.get("/users/{id}", response_model=UserOut)
async def get_user(id: int): return await session.get(User, id)
```

## CORS

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],   # not ["*"]
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)
```
**Critical**: `allow_origins=["*"]` with `allow_credentials=True` is rejected by browsers but FastAPI won't warn you. List explicit origins for credentialed APIs.

## Secrets & config

- Use `pydantic-settings` (`BaseSettings`) to load from env with type validation.
- Never hardcode secrets; never commit `.env`.
- `app = FastAPI(debug=True)` enables verbose traceback responses — off in production.
- `/docs` and `/redoc` are exposed by default. Disable in production for non-public APIs:
  ```python
  app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
  ```

## Crypto

Same rules as Flask/Django: `secrets` module for tokens, `cryptography` for AES, `passlib` for password hashing, `python-jose`/`PyJWT` for JWT (and pin algorithms explicitly).

## File upload & path traversal

```python
from fastapi import UploadFile, File, HTTPException
from pathlib import Path
import magic

ALLOWED_MIME = {"image/png", "image/jpeg"}
MAX = 5 * 1024 * 1024
UPLOAD_DIR = Path("/var/app/uploads").resolve()

@app.post("/upload")
async def upload(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    contents = await file.read(MAX + 1)
    if len(contents) > MAX: raise HTTPException(413)
    if magic.from_buffer(contents[:2048], mime=True) not in ALLOWED_MIME:
        raise HTTPException(400)

    safe_name = Path(file.filename).name        # strip path components
    target = (UPLOAD_DIR / str(user.id) / safe_name).resolve()
    if not str(target).startswith(str(UPLOAD_DIR) + "/"):
        raise HTTPException(400)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(contents)
```

FastAPI / Starlette streams uploads to a tempfile by default (no full in-memory load) but doesn't enforce a max size — you have to. For very large uploads, use streaming with size accounting, and add a reverse-proxy-level limit (nginx `client_max_body_size`).

## Deserialization

- JSON via Pydantic — safe.
- `pickle.loads()` on untrusted data — never.
- `yaml.load()` — use `yaml.safe_load()`.
- XML — use `defusedxml`.
- MessagePack: `msgpack.unpackb(data, raw=False, strict_map_key=True)` — but watch out for object hooks that instantiate arbitrary classes.

## SSRF

For URL-fetching endpoints (webhooks, image proxies):
```python
from urllib.parse import urlparse
import socket, ipaddress

def is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"): return False
    try:
        addrs = socket.getaddrinfo(parsed.hostname, None)
    except socket.gaierror:
        return False
    for fam, _, _, _, sockaddr in addrs:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    return True
```
Then use `httpx.AsyncClient(follow_redirects=False)` and revalidate after each redirect.

## Security headers

FastAPI doesn't ship a security-headers middleware. Roll one or use `secure`:
```python
from secure import Secure
secure_headers = Secure()

@app.middleware("http")
async def set_secure_headers(request, call_next):
    response = await call_next(request)
    secure_headers.framework.fastapi(response)
    return response
```
Or write a one-shot middleware that sets `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.

## Logging & error handling

- Default exception handler returns `{"detail": "Internal Server Error"}` — that's good. Don't override it to include the exception text.
- Don't log full request bodies or headers — they contain auth tokens and PII. Use middleware that logs status, method, path, duration only.
- `HTTPException(detail=str(e))` leaks internal error messages — sanitize.
- For 500s, log the full traceback server-side but return a generic message client-side.

## Dependencies

- `pip-audit` in CI.
- Pin Pydantic, Starlette, FastAPI versions. Pydantic v1 → v2 migration changed validation semantics — partial migrations leave bypassable validators.
- Watch CVEs for `python-jose`, `PyJWT`, `cryptography`, `httpx`.

## Framework-specific footguns

- `Request.client.host` is the immediate connection IP. If you're behind a proxy, you must use `X-Forwarded-For` via `ProxyHeadersMiddleware` and trust only your proxy. Otherwise rate limiting / IP allowlists are user-spoofable.
- `BackgroundTasks` runs after the response is sent in the same worker — long-running ones block subsequent requests on that worker. Don't use them for security-critical workflows that need durability.
- Dependency overrides (`app.dependency_overrides`) intended for tests can leak into prod if not properly scoped — check that test setup doesn't run in prod startup.
- Path parameters: `{path:path}` matches across slashes including `..` — never use it for filesystem paths without explicit traversal checks.
- WebSocket endpoints don't go through HTTP middleware — auth has to be re-applied:
  ```python
  @app.websocket("/ws")
  async def ws(websocket: WebSocket, token: str = Query(...)):
      user = await verify_jwt(token)
      if not user: await websocket.close(code=1008); return
      await websocket.accept()
  ```
- `Form()` parameters require `python-multipart`, which has had CVEs — keep it updated.
- Pydantic v2 `model_validator(mode="before")` runs before type coercion — easy to write a check that operates on the wrong types.

## Review checklist

1. Every endpoint has an `auth` dependency or is explicitly public
2. Pydantic models on every input; `extra="forbid"` on create/update
3. `response_model=` set so internal fields don't leak
4. JWT decode pins `algorithms=[...]` and validates `exp`/`aud`/`iss`
5. No raw SQL with f-strings; SQLAlchemy `text()` uses bind params
6. NoSQL queries use validated Pydantic fields, not raw dicts
7. CORS origins explicit (not `*` with credentials)
8. `/docs`, `/redoc`, `/openapi.json` disabled or auth-gated in production
9. CSRF protection if cookies are used for auth
10. File uploads: size limit + magic-byte check + filename sanitization + path-traversal guard
11. Security headers middleware (CSP, HSTS, etc.)
12. Error responses don't include exception text or stack traces
13. WebSocket endpoints re-implement auth
14. SSRF protection on URL-fetcher endpoints
