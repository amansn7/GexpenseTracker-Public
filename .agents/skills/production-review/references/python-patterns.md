# Python Production Anti-Patterns

Concrete patterns that cause production incidents in Python web services. Organized by framework, then general Python patterns.

---

## FastAPI

### BaseHTTPMiddleware Breaks contextvars

`BaseHTTPMiddleware` (and the `@app.middleware("http")` decorator, which uses it) runs the endpoint in a separate `anyio` task. This breaks `contextvars` — meaning request-scoped context (correlation IDs, user context, database sessions) silently becomes `None` or carries stale values from a previous request.

```python
# BAD: This breaks contextvars propagation
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_ctx.set(request_id)  # this won't propagate to the endpoint
        response = await call_next(request)
        return response

# ALSO BAD: Same problem, different syntax
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id_ctx.set(str(uuid.uuid4()))  # broken in the endpoint
    response = await call_next(request)
    return response

# GOOD: Use a pure ASGI middleware instead
class RequestIDMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            request_id = dict(scope.get("headers", [])).get(
                b"x-request-id", str(uuid.uuid4()).encode()
            ).decode()
            request_id_ctx.set(request_id)
        await self.app(scope, receive, send)

app.add_middleware(RequestIDMiddleware)
```

**Detection**: Grep for `BaseHTTPMiddleware`, `@app.middleware("http")`. If found alongside `contextvars`, it is broken.

### Synchronous Calls in Async Endpoints

FastAPI runs `async def` endpoints on the main event loop. Any blocking call (synchronous I/O, CPU-heavy computation, `time.sleep`) blocks the entire event loop and stalls all other requests.

```python
# BAD: Blocking call in async endpoint
import requests  # synchronous HTTP library

@app.get("/external-data")
async def get_external_data():
    response = requests.get("https://api.example.com/data")  # blocks event loop
    return response.json()

# BAD: Synchronous file I/O in async endpoint
@app.get("/report")
async def get_report():
    with open("large_report.csv") as f:  # blocks event loop
        data = f.read()
    return {"data": data}

# BAD: time.sleep in async endpoint
@app.post("/retry-later")
async def retry():
    time.sleep(5)  # blocks entire event loop for 5 seconds
    return {"status": "done"}

# GOOD: Use async HTTP client
import httpx

@app.get("/external-data")
async def get_external_data():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.example.com/data", timeout=5.0)
    return response.json()

# GOOD: Use async file I/O
import aiofiles

@app.get("/report")
async def get_report():
    async with aiofiles.open("large_report.csv") as f:
        data = await f.read()
    return {"data": data}

# GOOD: Use asyncio.sleep
@app.post("/retry-later")
async def retry():
    await asyncio.sleep(5)
    return {"status": "done"}

# ALSO GOOD: Use sync def — FastAPI will run it in a threadpool automatically
@app.get("/external-data")
def get_external_data():  # no async — runs in threadpool
    response = requests.get("https://api.example.com/data", timeout=5.0)
    return response.json()
```

**Detection**: In files with `async def` endpoints, grep for `import requests`, `time.sleep`, `open(` without `aiofiles`, `subprocess.run`, `subprocess.call`. Any synchronous I/O in an `async def` is a bug.

### Missing Lifespan for Resource Management

Without a lifespan handler, database connection pools, HTTP client sessions, and background tasks are not properly initialized on startup or cleaned up on shutdown. This causes connection leaks, orphaned background tasks, and inconsistent state after deploys.

```python
# BAD: Resources created at module level, never cleaned up
app = FastAPI()
db_pool = create_pool("postgresql://...")  # created on import, never closed
http_client = httpx.AsyncClient()          # never closed

# BAD: Using deprecated on_event decorators
@app.on_event("startup")
async def startup():
    app.state.db = create_pool(...)

@app.on_event("shutdown")
async def shutdown():
    await app.state.db.close()

# GOOD: Use lifespan context manager
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize resources
    app.state.db_pool = await asyncpg.create_pool(settings.DATABASE_URL)
    app.state.http_client = httpx.AsyncClient(timeout=10.0)

    yield  # application runs here

    # Shutdown: clean up resources
    await app.state.http_client.aclose()
    await app.state.db_pool.close()

app = FastAPI(lifespan=lifespan)
```

**Detection**: Grep for `on_event("startup")`, `on_event("shutdown")` — these are deprecated. Check if there is a `lifespan` parameter on the `FastAPI()` constructor. If neither exists, resource management is missing entirely.

### Missing Request Validation

FastAPI validates request bodies automatically via Pydantic, but path parameters, query parameters, and headers need explicit constraints.

```python
# BAD: No validation on query params — allows negative page, huge page_size
@app.get("/users")
async def list_users(page: int = 1, page_size: int = 100):
    return db.query(User).offset((page - 1) * page_size).limit(page_size).all()

# GOOD: Explicit constraints
from fastapi import Query

@app.get("/users")
async def list_users(
    page: int = Query(default=1, ge=1, le=10000),
    page_size: int = Query(default=20, ge=1, le=100),
):
    return db.query(User).offset((page - 1) * page_size).limit(page_size).all()
```

---

## Django

### N+1 Queries with the ORM

The most common Django performance issue. Accessing related objects in templates or serializers triggers a separate query for each row.

```python
# BAD: N+1 — one query for orders, then one query per order for customer
def order_list(request):
    orders = Order.objects.all()  # SELECT * FROM orders
    for order in orders:
        print(order.customer.name)  # SELECT * FROM customers WHERE id = ? (per order)

# GOOD: select_related for ForeignKey/OneToOne (SQL JOIN)
def order_list(request):
    orders = Order.objects.select_related("customer").all()
    # Single query: SELECT * FROM orders JOIN customers ON ...

# GOOD: prefetch_related for ManyToMany/reverse ForeignKey (separate query, Python join)
def customer_list(request):
    customers = Customer.objects.prefetch_related("orders").all()
    # Two queries: SELECT * FROM customers; SELECT * FROM orders WHERE customer_id IN (...)
```

**Detection**: In views, serializers, and templates, look for access to related fields (e.g., `order.customer`, `user.profile`, `post.comments.all()`) without a corresponding `select_related` or `prefetch_related` on the queryset. Use `django-debug-toolbar` or `nplusone` to detect at runtime.

### Unsafe Migrations

Migrations that work fine on a dev database but lock tables or break rolling deploys on a production database with millions of rows.

```python
# BAD: Adding NOT NULL column without default — full table lock
class Migration(migrations.Migration):
    operations = [
        migrations.AddField(
            model_name="user",
            name="phone",
            field=models.CharField(max_length=20),  # NOT NULL, no default
        ),
    ]

# GOOD: Add nullable first, then backfill, then add constraint
# Migration 1: Add nullable column
migrations.AddField(
    model_name="user",
    name="phone",
    field=models.CharField(max_length=20, null=True),
)
# Migration 2 (data migration): Backfill in batches
# Migration 3: ALTER to NOT NULL after backfill

# BAD: Renaming a column — breaks previous code version during rolling deploy
migrations.RenameField(model_name="user", old_name="email", new_name="email_address")

# GOOD: Add new column, backfill, update code, remove old column in a later release
```

**Detection**: In migration files, grep for `null=False` without `default=`, `RenameField`, `RemoveField`, `AlterField` changing from nullable to non-nullable. See `production-postgres` for the complete safe migration playbook.

### Missing Error Handlers

Without custom error handlers, Django returns HTML error pages (or worse, full debug pages) to API clients.

```python
# BAD: No custom error handlers — returns HTML 404/500 pages to API clients

# GOOD: Custom JSON error handlers in urls.py
# urls.py
handler400 = "myapp.views.errors.bad_request"
handler403 = "myapp.views.errors.forbidden"
handler404 = "myapp.views.errors.not_found"
handler500 = "myapp.views.errors.server_error"

# myapp/views/errors.py
from django.http import JsonResponse

def not_found(request, exception=None):
    return JsonResponse({"error": "not_found", "message": "Resource not found"}, status=404)

def server_error(request):
    return JsonResponse({"error": "internal_error", "message": "Internal server error"}, status=500)
```

### Global State and Settings Issues

```python
# BAD: Mutable default in settings that gets modified at runtime
MIDDLEWARE_CONFIG = {"rate_limit": 100, "cache": {}}  # shared mutable state

# BAD: Accessing settings dynamically without django.conf.settings
import myproject.settings
print(myproject.settings.DEBUG)  # bypasses override mechanism

# GOOD: Always use django.conf.settings
from django.conf import settings
print(settings.DEBUG)  # respects DJANGO_SETTINGS_MODULE and overrides
```

---

## Flask

### Global State Issues

Flask uses thread-local proxies for request context. Misunderstanding this leads to data leaks between requests.

```python
# BAD: Module-level mutable state — shared across all requests
user_cache = {}  # this grows forever and leaks data between users

@app.route("/profile")
def profile():
    user = get_user()
    user_cache[user.id] = user  # memory leak + cross-user data contamination
    return render_template("profile.html", user=user)

# BAD: Storing request-specific state on the app object
@app.route("/process")
def process():
    app.current_task = start_task()  # shared across all concurrent requests
    return "Processing"

# GOOD: Use Flask's g object for request-scoped state
from flask import g

@app.before_request
def load_user():
    g.user = get_user_from_token(request.headers.get("Authorization"))

# GOOD: Use a proper cache for cross-request caching
from flask_caching import Cache
cache = Cache(app, config={"CACHE_TYPE": "redis"})

@cache.cached(timeout=300, key_prefix="user_profile")
def get_profile(user_id):
    return db.session.get(User, user_id)
```

### Not Using the App Factory Pattern

Without the app factory pattern, circular imports are common, testing requires complex monkeypatching, and you cannot run multiple app configurations.

```python
# BAD: App created at module level
# app.py
from flask import Flask
app = Flask(__name__)
app.config.from_object("config.ProductionConfig")

from . import routes  # circular import risk

# GOOD: App factory
# app.py
from flask import Flask

def create_app(config_class="config.ProductionConfig"):
    app = Flask(__name__)
    app.config.from_object(config_class)

    from . import routes
    app.register_blueprint(routes.bp)

    from . import errors
    app.register_blueprint(errors.bp)

    return app
```

### Missing Error Handlers

```python
# BAD: No error handlers — Flask returns HTML error pages
app = Flask(__name__)

# GOOD: JSON error handlers for APIs
@app.errorhandler(400)
def bad_request(e):
    return jsonify(error="bad_request", message=str(e)), 400

@app.errorhandler(404)
def not_found(e):
    return jsonify(error="not_found", message="Resource not found"), 404

@app.errorhandler(500)
def internal_error(e):
    app.logger.exception("Unhandled exception")
    return jsonify(error="internal_error", message="Internal server error"), 500

@app.errorhandler(Exception)
def unhandled_exception(e):
    app.logger.exception("Unhandled exception")
    return jsonify(error="internal_error", message="Internal server error"), 500
```

---

## General Python Anti-Patterns

### Blocking I/O in Async Code

Any synchronous I/O call in async code blocks the event loop. This is the single most common production issue in async Python services.

**Synchronous libraries that must not be used in async contexts:**
- `requests` — use `httpx` or `aiohttp`
- `psycopg2` — use `asyncpg` or `psycopg[async]`
- `pymongo` — use `motor`
- `redis-py` (sync) — use `redis.asyncio`
- `open()` — use `aiofiles`
- `time.sleep()` — use `asyncio.sleep()`
- `subprocess.run()` — use `asyncio.create_subprocess_exec()`
- `smtplib` — use `aiosmtplib`
- `boto3` — use `aioboto3` or run in executor

**Detection**: In any file with `async def`, grep for imports of synchronous libraries.

```python
# BAD: Synchronous database call in async function
async def get_users():
    conn = psycopg2.connect(DATABASE_URL)  # blocks event loop
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users")
    return cursor.fetchall()

# GOOD: Async database call
async def get_users():
    async with asyncpg_pool.acquire() as conn:
        return await conn.fetch("SELECT * FROM users")
```

### Missing Timeouts

Every external call must have an explicit timeout. Default timeouts are either infinite or unreasonably long (e.g., `requests` has no default timeout). A stuck external call ties up a worker forever.

```python
# BAD: No timeout — if the service hangs, this worker hangs forever
response = requests.get("https://api.example.com/data")
response = httpx.get("https://api.example.com/data")

# BAD: Only connect timeout, no read timeout
response = requests.get(url, timeout=5)  # this is connect timeout only in older versions

# GOOD: Explicit connect and read timeout
response = requests.get(url, timeout=(3.0, 10.0))  # (connect, read)

# GOOD: httpx with timeout
async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=3.0)) as client:
    response = await client.get(url)

# GOOD: Database query timeout
from sqlalchemy import text
result = session.execute(
    text("SELECT * FROM big_table WHERE condition = :val").execution_options(
        timeout=5  # statement timeout in seconds
    ),
    {"val": value},
)
```

**Detection**: Grep for `requests.get(`, `requests.post(`, `httpx.get(`, `httpx.post(`, `aiohttp.ClientSession().get(` and check if `timeout=` is present.

### Exception Swallowing

Catching exceptions and doing nothing is the most dangerous anti-pattern. Silent failures cause data corruption, inconsistent state, and impossible-to-debug production issues.

```python
# BAD: Silent failure — data may be partially written
try:
    save_to_database(data)
    send_notification(data)
except Exception:
    pass  # if save succeeds but notification fails, we'll never know

# BAD: Logging but not re-raising on critical path
try:
    charge_customer(order)
except Exception as e:
    logger.error(f"Payment failed: {e}")
    # order continues as if payment succeeded

# GOOD: Handle specific exceptions, let unexpected ones propagate
try:
    charge_customer(order)
except PaymentDeclinedError as e:
    logger.warning("payment_declined", order_id=order.id, reason=str(e))
    raise HTTPException(402, "Payment declined")
except PaymentGatewayError as e:
    logger.error("payment_gateway_error", order_id=order.id, error=str(e))
    raise HTTPException(502, "Payment service unavailable")
# unexpected exceptions propagate to the global error handler
```

**Detection**: Grep for `except.*:.*pass`, `except Exception:`, bare `except:`. Each instance needs manual review — some are legitimate (e.g., cleanup code), most are bugs.

### Mutable Default Arguments in Config

```python
# BAD: Mutable default argument — shared across all callers
def create_app(config={}):
    config["initialized"] = True  # modifies the default dict
    return config

# The second call sees {"initialized": True} as the default
# This is a classic Python gotcha that causes subtle bugs in production

# GOOD: Use None as default, create a new dict inside
def create_app(config=None):
    config = config or {}
    config["initialized"] = True
    return config

# BAD: Mutable default in dataclass/Pydantic model
from pydantic import BaseModel

class AppConfig(BaseModel):
    allowed_origins: list = ["http://localhost"]  # shared mutable reference

# GOOD: Use Field with default_factory
from pydantic import BaseModel, Field

class AppConfig(BaseModel):
    allowed_origins: list = Field(default_factory=lambda: ["http://localhost"])
```

### Improper Signal Handling

```python
# BAD: No graceful shutdown — in-flight requests get terminated
import uvicorn
uvicorn.run(app, host="0.0.0.0", port=8000)

# GOOD: Graceful shutdown with signal handling
import signal
import asyncio

shutdown_event = asyncio.Event()

def handle_sigterm(signum, frame):
    shutdown_event.set()

signal.signal(signal.SIGTERM, handle_sigterm)

# In lifespan:
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # cleanup here runs on shutdown
    logger.info("shutting_down", reason="SIGTERM")
    await drain_connections()

# Configure uvicorn with proper shutdown
uvicorn.run(
    app,
    host="0.0.0.0",
    port=8000,
    timeout_graceful_shutdown=30,  # seconds to finish in-flight requests
)
```

### Resource Leaks

```python
# BAD: File handle leak on error
def process_file(path):
    f = open(path)
    data = json.load(f)  # if this throws, f is never closed
    f.close()
    return data

# GOOD: Context manager guarantees cleanup
def process_file(path):
    with open(path) as f:
        return json.load(f)

# BAD: Database connection leak
def get_user(user_id):
    session = SessionLocal()
    user = session.query(User).get(user_id)
    session.close()  # never reached if query throws
    return user

# GOOD: Context manager for sessions
def get_user(user_id):
    with SessionLocal() as session:
        return session.query(User).get(user_id)

# BAD: HTTP client never closed (connection pool leak)
async def fetch_data():
    client = httpx.AsyncClient()
    response = await client.get(url)
    return response.json()
    # client is never closed — connections leak

# GOOD: Context manager for HTTP clients
async def fetch_data():
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(url)
        return response.json()
```

### Startup Validation

```python
# BAD: Config validated on first request — fails at 3 AM when a user hits the endpoint
DATABASE_URL = os.getenv("DATABASE_URL")  # might be None

@app.get("/users")
async def get_users():
    conn = await asyncpg.connect(DATABASE_URL)  # fails here, not at startup

# GOOD: Validate config at startup — fails at deploy time, not at runtime
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str  # required — startup fails if missing
    REDIS_URL: str
    JWT_SECRET_KEY: str
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]
    DEBUG: bool = False

    model_config = {"env_file": ".env"}

settings = Settings()  # fails immediately on import if required vars are missing
```

---

## Detection Checklist for Reviewers

Quick grep commands to run on any Python codebase:

```bash
# Sync I/O in async code
rg "import requests" --type py       # should use httpx in async codebases
rg "time\.sleep" --type py           # check if in async context
rg "open\(" --type py                # check if in async context without aiofiles

# Missing timeouts
rg "requests\.(get|post|put|delete|patch)\(" --type py  # check for timeout=
rg "httpx\.(get|post|put|delete|patch)\(" --type py     # check for timeout=

# Exception issues
rg "except:$" --type py
rg "except.*:.*pass$" --type py
rg "except Exception" --type py      # review each — are they re-raising?

# FastAPI-specific
rg "BaseHTTPMiddleware" --type py
rg "@app\.middleware" --type py
rg "on_event\(" --type py            # deprecated

# Django-specific
rg "\.objects\.(all|filter|exclude)\(\)" --type py  # check for missing select_related
rg "null=False" skills/ --type py                    # in migrations, check for default

# Config issues
rg "os\.getenv\(" --type py          # check for missing defaults or validation
rg "localhost" --type py              # hardcoded URLs
rg "127\.0\.0\.1" --type py
rg "DEBUG.*=.*True" --type py

# Secrets
rg "(password|secret|api_key|token)\s*=\s*\"" --type py -i
```
