# Python Flask — Secure Coding

Covers Flask 2.x and 3.x with common extensions: Flask-SQLAlchemy, Flask-Login, Flask-WTF, Flask-CORS, Flask-Limiter.

Flask is intentionally minimal — it gives you fewer secure defaults than Django, so you have to bring them in deliberately.

## Injection

### SQL injection

With SQLAlchemy ORM, parameterization is automatic:
```python
# SAFE
User.query.filter_by(email=email).first()
db.session.execute(text("SELECT * FROM users WHERE email = :e"), {"e": email})

# UNSAFE
db.session.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))
db.engine.execute(f"DELETE FROM logs WHERE id < {oldest_id}")
```

For raw `sqlite3`/`psycopg2`:
```python
# SAFE
cur.execute("SELECT * FROM users WHERE id = %s", (uid,))
# UNSAFE
cur.execute(f"SELECT * FROM users WHERE id = {uid}")
```

Dynamic ORDER BY: validate against an allowlist of column names before passing to SQLAlchemy `order_by()`.

### Command injection

```python
# UNSAFE
os.system(f"convert {fname} out.png")
subprocess.run(f"convert {fname} out.png", shell=True)

# SAFE
subprocess.run(["convert", fname, "out.png"], check=True)
```

### Template injection (SSTI)

Jinja2 auto-escapes when files end in `.html`/`.htm`/`.xml`/`.xhtml` — but not `.txt` or arbitrary names. The classic Flask vulnerability is rendering a string template with user input:

```python
# CRITICAL: SSTI → RCE
return render_template_string(f"Hello {request.args['name']}")
return render_template_string(request.args["template"])

# SAFE
return render_template_string("Hello {{ name }}", name=request.args["name"])
```

Same for `Template(user_string).render()`. Never feed user input as the template *itself*.

`|safe` and `Markup()` disable escaping — never apply to user input.

## AuthN / AuthZ

### Use Flask-Login or Flask-Security-Too

Don't roll session management. Flask-Login provides `login_user`, `logout_user`, `current_user`, `@login_required`. Flask-Security-Too adds password hashing, token generation, and role decorators.

Password hashing with `werkzeug.security`:
```python
from werkzeug.security import generate_password_hash, check_password_hash
hash = generate_password_hash(password, method="scrypt")   # or "argon2" via passlib
check_password_hash(hash, attempt)
```
Never use `hashlib.sha256(password)` to store passwords.

### Authorization

Flask has no built-in roles. Roll a decorator:
```python
def require_role(role):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated or role not in current_user.roles:
                abort(403)
            return fn(*args, **kwargs)
        return wrapper
    return deco
```
Apply to every route, including ones you "know" only admins use.

### IDOR

```python
# UNSAFE: any logged-in user can fetch any order
order = Order.query.get_or_404(order_id)

# SAFE
order = Order.query.filter_by(id=order_id, user_id=current_user.id).first_or_404()
```

### Session & cookie config

```python
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",      # 'Strict' if no cross-site redirects
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    REMEMBER_COOKIE_SECURE=True,
    REMEMBER_COOKIE_HTTPONLY=True,
)
```

Flask sessions are **client-side signed cookies**, not server-side state. Don't put sensitive data (other users' info, secrets, server-only flags) in `session` — the user can read it, just not modify it. For server-side sessions, use `Flask-Session` with Redis/DB backend.

## CSRF

Flask has no built-in CSRF protection. Add **Flask-WTF**:
```python
from flask_wtf.csrf import CSRFProtect
csrf = CSRFProtect(app)
```
This protects all `POST`/`PUT`/`PATCH`/`DELETE` routes by default. To exempt an API blueprint:
```python
csrf.exempt(api_blueprint)   # only for token-authed APIs
```

For SPAs, expose the CSRF token via a meta tag or `/csrf` endpoint and have the SPA send it as `X-CSRFToken`.

## XSS / output encoding

- Jinja2's `{{ var }}` auto-escapes in HTML templates.
- `{{ var | safe }}`, `{% autoescape off %}`, and `Markup(user_input)` disable it.
- `jsonify()` is safe. Don't manually format JSON with f-strings.
- When embedding JSON in `<script>` tags, use `tojson` filter: `<script>const data = {{ data | tojson }};</script>`.

## CORS

```python
from flask_cors import CORS
CORS(app,
     origins=["https://app.example.com"],     # not "*"
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST"])
```
`origins="*"` with `supports_credentials=True` is silently downgraded by Flask-CORS to safe behavior, but don't rely on that — list explicit origins.

## Secrets & config

- `SECRET_KEY` must be set in production and rotated carefully (rotation invalidates all sessions).
- Use `os.environ`, `python-dotenv`, or a secrets manager. Never commit `.env`.
- Don't ship `app.run(debug=True)` to prod — it enables the Werkzeug debugger which gives anyone with the PIN a Python REPL on your server.

## Crypto

- Use `secrets` module for tokens: `secrets.token_urlsafe(32)`.
- `itsdangerous` (Flask's signing lib) for signed tokens; `URLSafeTimedSerializer` for expiring tokens (e.g., password reset).
- Use `cryptography` library for AES; never roll your own.

## File upload & path traversal

```python
from werkzeug.utils import secure_filename
import os

ALLOWED = {"png", "jpg", "jpeg"}

@app.route("/upload", methods=["POST"])
def upload():
    f = request.files["file"]
    if not f or "." not in f.filename: abort(400)
    ext = f.filename.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED: abort(400)
    name = secure_filename(f.filename)

    # Validate magic bytes
    head = f.stream.read(2048); f.stream.seek(0)
    import magic
    if magic.from_buffer(head, mime=True) not in {"image/png", "image/jpeg"}:
        abort(400)

    target = os.path.join(app.config["UPLOAD_DIR"], name)
    target = os.path.realpath(target)
    if not target.startswith(os.path.realpath(app.config["UPLOAD_DIR"]) + os.sep):
        abort(400)
    f.save(target)
```

Set `app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024` to cap request size. Never serve user-uploaded files from a route that interpolates a user-supplied path — use `send_from_directory(safe_dir, validated_name)`.

## Deserialization

- `pickle.loads()` / `marshal.loads()` / `shelve` on untrusted data = RCE. Never.
- `yaml.load()` is unsafe — use `yaml.safe_load()`.
- `xml.etree.ElementTree` is mostly safe but `xml.dom.minidom` and `lxml` need entity expansion disabled. Use `defusedxml` for any user-supplied XML.

## SSRF

Flask apps that fetch user-supplied URLs (URL previewers, webhook senders, image proxies) need SSRF defenses. See the Django reference's SSRF section — same rules: resolve host, reject private/loopback/link-local/metadata IPs, disable redirects or revalidate, set timeouts.

## Security headers

Flask doesn't set any by default. Use **Flask-Talisman**:
```python
from flask_talisman import Talisman
Talisman(app,
    content_security_policy={
        "default-src": "'self'",
        "script-src": "'self'",
        "object-src": "'none'",
    },
    force_https=True,
    strict_transport_security=True,
    strict_transport_security_max_age=31536000,
    frame_options="DENY",
    referrer_policy="strict-origin-when-cross-origin",
)
```

## Logging & error handling

- `app.debug = False` in production. With debug on, exceptions render an interactive Werkzeug debugger that runs arbitrary Python.
- Custom error handlers should return generic messages — don't leak `repr(exception)` to clients.
- Don't log `request.headers`, `request.form`, or `request.json` wholesale — they contain auth tokens, passwords, PII. Pick fields explicitly.
- Use `logging.Formatter` that doesn't include local variables; if shipping to centralized logs, scrub before send.

## Dependencies

- `pip-audit` in CI.
- Track Flask security advisories on its GitHub Security tab.
- Pin extension versions — Flask extensions are sometimes unmaintained and have CVEs (e.g., older Flask-Security versions).

## Framework-specific footguns

- `app.run(host="0.0.0.0")` exposes the dev server on all interfaces — use a real WSGI server (gunicorn, uWSGI) for anything beyond local dev.
- `before_request` returning `None` does NOT block the request — only returning a response does. Easy to write an auth middleware that doesn't actually enforce.
- `g` object is per-request; don't put cross-request caches there or in module-level globals (workers don't share them).
- `request.json` / `request.get_json(force=True)` will parse JSON regardless of `Content-Type` if `force=True` — don't trust it for content-type validation.
- `app.url_map.strict_slashes = False` plus weird middleware can lead to auth bypass via trailing-slash variants — keep slashes consistent.
- Werkzeug's `redirect(url)` doesn't validate the URL — open redirect risk. Validate against allowed hosts.
- Jinja2 templates loaded from user-controlled paths via `render_template(user_input)` enable template injection. Always use a fixed template name and pass user data as variables.

## Review checklist

1. `SECRET_KEY` from env; `DEBUG = False` in prod
2. CSRF protection (Flask-WTF) enabled; exemptions justified
3. No `render_template_string(f"...{user_input}...")` and no `Template(user_input)`
4. No raw SQL with f-strings; SQLAlchemy `text()` uses bind params
5. Session cookie `Secure`, `HttpOnly`, `SameSite`
6. Flask-Login or equivalent on every protected route; ownership checks for IDOR
7. CORS origins explicit
8. File upload: extension allowlist + magic-byte check + sanitized filename + path-traversal guard + `MAX_CONTENT_LENGTH`
9. Flask-Talisman or manual security headers (CSP, HSTS, X-Frame-Options)
10. `pickle.loads` / `yaml.load` not used on untrusted data; XML via `defusedxml`
11. Error handlers don't leak stack traces
12. URL-fetcher endpoints validated against SSRF
