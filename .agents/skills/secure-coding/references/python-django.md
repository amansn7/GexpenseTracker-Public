# Python Django — Secure Coding

Covers Django 3.2 LTS, 4.2 LTS, and 5.x. Most guidance applies to all three; version-specific notes are called out.

## Injection

### SQL injection

The ORM is parameterized by default. SQL injection in Django almost always comes from one of these:

```python
# UNSAFE
User.objects.raw(f"SELECT * FROM auth_user WHERE username = '{name}'")
User.objects.extra(where=[f"name = '{name}'"])
cursor.execute(f"SELECT * FROM users WHERE id = {uid}")

# UNSAFE: format/concat in annotations
.annotate(score=RawSQL(f"compute({uid})", []))
```

Safe equivalents:
```python
User.objects.raw("SELECT * FROM auth_user WHERE username = %s", [name])
User.objects.extra(where=["name = %s"], params=[name])
cursor.execute("SELECT * FROM users WHERE id = %s", [uid])
.annotate(score=RawSQL("compute(%s)", [uid]))
```

`extra()` is deprecated and dangerous — prefer `Func`, `RawSQL` with params, or `annotate(... = Subquery(...))`.

For dynamic ORDER BY (`order_by(user_input)`), validate against an allowlist of column names — Django will silently accept anything.

### Command / shell injection

```python
# UNSAFE
os.system(f"convert {filename} out.png")
subprocess.run(f"convert {filename} out.png", shell=True)

# SAFE: argv list, no shell
subprocess.run(["convert", filename, "out.png"], shell=False, check=True)
```

### Template injection

Django templates auto-escape — but `{% autoescape off %}`, `|safe`, and `mark_safe()` disable it. Never apply them to user input. `format_html()` is the safe way to interpolate HTML around user data:

```python
# SAFE
format_html("<a href='{}'>{}</a>", url, name)

# DANGEROUS
mark_safe(f"<a href='{url}'>{name}</a>")
```

## AuthN / AuthZ

### Use the auth app

`django.contrib.auth` handles password hashing (PBKDF2 by default; you can switch to argon2 by adding `argon2-cffi` and listing `Argon2PasswordHasher` first in `PASSWORD_HASHERS`). Don't roll your own — and don't store passwords in custom fields without using `set_password()`.

### Permission decorators

```python
from django.contrib.auth.decorators import login_required, permission_required

@login_required
@permission_required("orders.view_order", raise_exception=True)
def view_order(request, order_id):
    ...
```

Class-based views: `LoginRequiredMixin`, `PermissionRequiredMixin`, `UserPassesTestMixin`.

DRF: `permission_classes = [IsAuthenticated, ...]` on every view, and set `DEFAULT_PERMISSION_CLASSES = ['rest_framework.permissions.IsAuthenticated']` in `REST_FRAMEWORK` settings so the default is deny.

### IDOR

`get_object_or_404(Order, pk=order_id)` does not check ownership. Always filter by user:
```python
order = get_object_or_404(Order, pk=order_id, owner=request.user)
```
Or override `get_queryset()` in a `DetailView`/`ViewSet`.

### Session & cookie config

```python
# settings.py — production
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True       # Django default
SESSION_COOKIE_SAMESITE = "Lax"      # 'Strict' if no cross-site flows
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True          # only matters if SPA reads it from JS — see CSRF section
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SESSION_COOKIE_AGE = 60 * 60 * 8     # 8h is a reasonable default
SESSION_EXPIRE_AT_BROWSER_CLOSE = False
```

Run `python manage.py check --deploy` in CI — it catches most missing hardening settings.

## CSRF

Django enables CSRF middleware by default for unsafe HTTP methods. Common misuses:

- `@csrf_exempt` is a footgun. Only use it on endpoints that are actually safe to be CSRF-exempt (typically a JSON API authenticated by a Bearer token, not a session cookie).
- For SPAs sharing a session cookie with the Django backend: `CSRF_COOKIE_HTTPONLY = False` so JS can read `csrftoken`, then send it as `X-CSRFToken` header. This is the supported pattern.
- Don't disable `CsrfViewMiddleware` globally to "make APIs work" — exempt specific views, document why.

DRF's `SessionAuthentication` enforces CSRF; `TokenAuthentication` and `JWTAuthentication` (e.g., `djangorestframework-simplejwt`) don't, by design.

## XSS / output encoding

- Django templates auto-escape `{{ var }}` to HTML.
- `|safe`, `mark_safe()`, `{% autoescape off %}` disable it — audit every usage.
- `JsonResponse` is safe; rendering JSON inside `<script>` blocks is not — use `json_script` template filter (Django 2.1+) which produces `<script type="application/json">` so it can't break out.
- DRF responses default to safe content-types.

## CORS

Django doesn't ship CORS middleware — use `django-cors-headers`:
```python
INSTALLED_APPS = [..., "corsheaders"]
MIDDLEWARE = ["corsheaders.middleware.CorsMiddleware", ...]   # before CommonMiddleware

CORS_ALLOWED_ORIGINS = ["https://app.example.com"]
CORS_ALLOW_CREDENTIALS = True
# Avoid: CORS_ALLOW_ALL_ORIGINS = True (especially with credentials)
```

## Secrets & config

- `SECRET_KEY` must be unique per environment, never committed. Rotating it invalidates sessions and password reset tokens — that's a feature.
- Use `django-environ` or `os.environ` to read secrets; never hardcode in `settings.py`.
- `DEBUG = True` in production leaks template source, settings, and stack traces — and disables `ALLOWED_HOSTS` enforcement. Always `DEBUG = False` in prod.
- `ALLOWED_HOSTS` must list real hostnames; don't use `["*"]` in production (enables Host header attacks).

## Crypto

- Use `django.utils.crypto.get_random_string(length, allowed_chars)` for tokens — uses `secrets` module under the hood. Never `random`.
- `signing.Signer` / `signing.dumps()` for signed tokens (HMAC + timestamps).
- Don't roll AES — use `cryptography` (Fernet for simple symmetric, or AES-GCM directly).
- `make_password()` / `check_password()` for password hashing if you're not using the User model.

## File upload & path traversal

```python
# Validate extension AND content
import magic
mime = magic.from_buffer(uploaded.read(2048), mime=True)
uploaded.seek(0)
if mime not in {"image/png", "image/jpeg"}: raise ValidationError("bad type")

# Sanitize filename
from django.utils.text import get_valid_filename
safe_name = get_valid_filename(uploaded.name)

# Always store in MEDIA_ROOT via storage API; don't os.path.join with user input
default_storage.save(f"uploads/{request.user.id}/{safe_name}", uploaded)
```

In settings:
```python
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 1000   # default
```

Serving uploaded files: don't proxy them through Django views that take a filename from the URL — that's a path-traversal magnet. Use `MEDIA_URL` with the web server, or X-Accel-Redirect / X-Sendfile.

## Deserialization

- `pickle.loads()` on untrusted data = RCE. Never. Includes `django.core.signing.loads(serializer=PickleSerializer)`.
- `yaml.load()` is dangerous — use `yaml.safe_load()`.
- DRF's default JSON parser is safe. The XML parser (`rest_framework_xml`) defers to `defusedxml` — keep it that way.
- `marshal`, `shelve`, and `dill` are also unsafe for untrusted data.

## SSRF

`requests.get(url)` on a user-supplied URL hits any host on your network — including cloud metadata (`169.254.169.254`) and internal services. Mitigations:
- Resolve the URL's host, reject private/loopback/link-local IPs.
- Use a denylist proxy (e.g., `requests` with custom `HTTPAdapter` that validates the resolved IP), or a forward proxy that enforces an allowlist.
- For webhook callbacks, consider an isolated egress network.
- Disable redirects or revalidate after each: `requests.get(url, allow_redirects=False)`.

## Security headers

`SecurityMiddleware` handles HSTS, content-type-nosniff, referrer-policy. CSP requires `django-csp`:
```python
MIDDLEWARE = [..., "csp.middleware.CSPMiddleware"]
CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'",)
CSP_STYLE_SRC = ("'self'",)
CSP_OBJECT_SRC = ("'none'",)
```
For X-Frame-Options, Django defaults to `DENY` via `XFrameOptionsMiddleware` — keep it unless you need iframes.

## Logging & error handling

- Don't log `request.POST`, `request.headers["Authorization"]`, session data, or full tracebacks containing local variables to user-accessible logs.
- `LOGGING` config in production should not write debug info to stdout if stdout is shipped to a less-trusted system.
- `ADMINS` get emails on 500 errors with full tracebacks — make sure the email channel is secure and the addresses are correct.
- `DisallowedHost` exceptions (Host header attacks) flood logs — silence with `LOGGING` filter or fix `ALLOWED_HOSTS`.

## Dependencies

- `pip-audit` or `safety` in CI.
- Watch CVE history for: Django itself (subscribe to django-announce), `Pillow` (image parsing), `requests`, `urllib3`, `pyyaml`, `jinja2`.

## Framework-specific footguns

- `ModelForm` with `Meta.fields = "__all__"` exposes every model field for mass assignment, including ones you didn't intend (e.g., `is_admin`). Always list fields explicitly.
- `TemplateView` rendering user-controlled template names = RCE via template injection. Never `template_name = request.GET["t"]`.
- `redirect(request.GET["next"])` is an open redirect. Use `url_has_allowed_host_and_scheme(url, allowed_hosts={request.get_host()})` before redirecting.
- Admin: `admin.site.register(MyModel)` with no permission overrides exposes full CRUD to any staff user. Restrict via `has_*_permission` methods.
- DRF browsable API in production exposes endpoints to anyone hitting `/api/` in a browser. Either limit `DEFAULT_RENDERER_CLASSES` to JSON in prod, or rely on auth.
- `request.META["HTTP_X_FORWARDED_FOR"]` is user-controlled unless your proxy strips it. Use `SECURE_PROXY_SSL_HEADER` and a vetted middleware (e.g., `django-ipware`) to derive client IP.
- `select_for_update()` outside a transaction is a no-op — easy to miss in race-condition fixes.

## Review checklist

1. `DEBUG = False`, `ALLOWED_HOSTS` set, `SECRET_KEY` from env
2. `python manage.py check --deploy` passes
3. No `extra()`, no f-string SQL, no `cursor.execute(f"...")`
4. No `subprocess.*` with `shell=True` and user input
5. CSRF middleware active; `@csrf_exempt` audited
6. `ModelForm` fields are explicit, never `"__all__"` for user-facing forms
7. Every `get_object_or_404` includes ownership filter where appropriate
8. File uploads: type sniffed, filename sanitized, size limited
9. CORS uses explicit origins, not `*` with credentials
10. Security headers + CSP middleware enabled
11. No `pickle.loads` / `yaml.load` on untrusted data
12. Admin permissions reviewed for staff users
13. URL fetchers (webhooks) protected against SSRF
