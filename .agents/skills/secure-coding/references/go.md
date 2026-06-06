# Go — Secure Coding

Covers Go 1.21+ with `net/http`, `database/sql`, and the popular routing libs Gin, Echo, Fiber, Chi. Go's standard library is generally secure by default, but its philosophy of "no defaults, build it yourself" means many security features (auth, CSRF, headers, rate limits) are explicit choices.

## Injection

### SQL injection

`database/sql` parameterizes via `?` (MySQL/SQLite) or `$1` (PostgreSQL) placeholders:
```go
// SAFE
db.QueryRow("SELECT * FROM users WHERE email = ?", email)
db.QueryRow("SELECT * FROM users WHERE email = $1", email)

// UNSAFE
db.QueryRow(fmt.Sprintf("SELECT * FROM users WHERE email = '%s'", email))
db.QueryRow("SELECT * FROM users WHERE email = '" + email + "'")
```

With `sqlx`:
```go
// SAFE — :name uses bound params via Rebind
nstmt, _ := db.PrepareNamed("SELECT * FROM users WHERE email = :email")
nstmt.Get(&u, map[string]any{"email": email})
```

With GORM:
```go
// SAFE
db.Where("email = ?", email).First(&u)
db.Where(&User{Email: email}).First(&u)

// UNSAFE
db.Where(fmt.Sprintf("email = '%s'", email)).First(&u)
db.Raw(fmt.Sprintf("SELECT * FROM users WHERE id = %d", id)).Scan(&u)
```

For dynamic ORDER BY / LIMIT clauses (which can't be parameterized), validate against an allowlist of column names.

### Command injection

```go
// UNSAFE: shell parsing of user input
exec.Command("sh", "-c", "convert "+filename+" out.png").Run()

// SAFE: argv form
exec.Command("convert", filename, "out.png").Run()
```
Never pass user input to `sh -c`. Always use the argv form, and validate `filename` against a regex / allowlist.

### Template injection (`text/template` vs `html/template`)

For HTML output, ALWAYS use `html/template`, not `text/template` — `html/template` auto-escapes context-aware (different escaping for HTML body, attributes, JS, URL contexts):
```go
import "html/template"
t := template.Must(template.New("p").Parse("<a href={{.URL}}>{{.Name}}</a>"))
t.Execute(w, data)   // Name escaped for HTML, URL escaped for URL context
```

Don't compile templates from user input — that's RCE-equivalent for any function exposed to the template (which can include arbitrary calls if you registered them).

### LDAP, XPath, NoSQL

For MongoDB via `mongo-go-driver`:
```go
// UNSAFE if username comes from raw JSON map
coll.FindOne(ctx, bson.M{"username": userInput})  // userInput could be a map with $ne

// SAFE: type as string in your input struct
type LoginIn struct { Username string `json:"username"` }
coll.FindOne(ctx, bson.M{"username": in.Username})
```

LDAP: use a library that supports parameterized filters (e.g., `go-ldap/ldap`'s `EscapeFilter`).

## AuthN / AuthZ

### Session and cookie config

```go
// stdlib net/http
http.SetCookie(w, &http.Cookie{
    Name:     "session",
    Value:    sessID,
    Path:     "/",
    HttpOnly: true,
    Secure:   true,
    SameSite: http.SameSiteLaxMode,    // or StrictMode if no cross-site flows
    MaxAge:   8 * 3600,
})
```

For `gorilla/sessions` or similar:
- Use a separate `store.Options` per security domain.
- Rotate session keys with key rotation lists (gorilla supports old + new keys for grace period).

### Password storage

```go
import "golang.org/x/crypto/bcrypt"

hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
err := bcrypt.CompareHashAndPassword(hash, []byte(attempt))
```
For Argon2 use `golang.org/x/crypto/argon2`. Never SHA/MD5.

### JWT

```go
import "github.com/golang-jwt/jwt/v5"

token, err := jwt.Parse(tokenString, func(t *jwt.Token) (any, error) {
    if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
        return nil, errors.New("unexpected signing method")
    }
    return []byte(secret), nil
})
```
Critical pieces:
- ALWAYS check the signing method matches what you expect (the keyfunc above does it).
- Validate `exp`, `nbf`, `aud`, `iss` via `jwt.WithAudience`, `jwt.WithIssuer`, etc.
- Don't accept `none`. The library doesn't accept `none` by default — keep it that way.

### Authorization

Go has no standard auth framework. Patterns:
- Wrap handlers in middleware that loads the user from session/JWT, then check role/permission inside the handler.
- For Chi: `r.With(requireRole("admin")).Post("/admin/users", deleteUser)`.

```go
func requireAuth(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        user, err := authFromRequest(r)
        if err != nil {
            http.Error(w, "unauthorized", 401)
            return
        }
        ctx := context.WithValue(r.Context(), userKey, user)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### IDOR

```go
// UNSAFE: any authed user can fetch any order
order, err := db.GetOrder(orderID)

// SAFE
order, err := db.GetOrderForUser(orderID, userID)
if err != nil || order == nil {
    http.Error(w, "not found", 404)   // 404, not 403, to avoid id enumeration
    return
}
```

## CSRF

Stdlib `net/http` has no CSRF protection. Add `gorilla/csrf` or `nosurf`:
```go
import "github.com/gorilla/csrf"

csrfMW := csrf.Protect(
    []byte("32-byte-key-from-secrets-manager"),
    csrf.Secure(true),
    csrf.HttpOnly(true),
    csrf.SameSite(csrf.SameSiteLaxMode),
)
http.ListenAndServe(":8080", csrfMW(handler))
```

For pure Bearer-token APIs (no cookies for auth), CSRF isn't needed because there's no ambient credential. But if you mix cookies for sessions and Bearer tokens for some endpoints, audit carefully.

## Input validation

Use `go-playground/validator` for struct validation:
```go
type CreateUser struct {
    Email string `json:"email" validate:"required,email"`
    Age   int    `json:"age" validate:"min=0,max=150"`
}

var in CreateUser
if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
    http.Error(w, "bad json", 400); return
}
if err := validate.Struct(in); err != nil {
    http.Error(w, err.Error(), 400); return  // sanitize err.Error() if exposing
}
```

JSON decoding pitfalls:
- `json.NewDecoder(r.Body).Decode(&in)` allows extra fields by default. Call `dec.DisallowUnknownFields()` for strict APIs (prevents mass-assignment-style attacks if you later add fields).
- `Decode` reads only the first JSON value; if request body has a second one, you've missed it. For strict APIs, also call `dec.Decode(&junk)` and verify it returns `io.EOF`.
- Limit body size: wrap `r.Body` with `http.MaxBytesReader(w, r.Body, maxSize)` before decoding.

## CORS

Use `rs/cors` or framework-specific middleware:
```go
c := cors.New(cors.Options{
    AllowedOrigins:   []string{"https://app.example.com"},
    AllowedMethods:   []string{"GET", "POST"},
    AllowedHeaders:   []string{"Authorization", "Content-Type"},
    AllowCredentials: true,
})
```
`AllowedOrigins: []string{"*"}` with `AllowCredentials: true` is rejected by browsers — list explicit origins.

## Secrets & config

- Use env vars or a secrets manager (Vault, AWS SM, GCP SM). Never commit secrets.
- For development, use `.env` files with `joho/godotenv` — but never check in `.env`.
- Build flags: don't compile secrets in via `-ldflags "-X main.secret=..."` unless the binary is secret too.
- `os.Getenv("SECRET")` returns "" if missing — fail loudly:
  ```go
  s := os.Getenv("SECRET")
  if s == "" { log.Fatal("SECRET not set") }
  ```

## Crypto

- Random: `crypto/rand`, never `math/rand`. For tokens:
  ```go
  b := make([]byte, 32)
  _, _ = rand.Read(b)
  token := base64.RawURLEncoding.EncodeToString(b)
  ```
- AES-GCM: use `crypto/cipher.NewGCM`, generate fresh nonce per message. Never AES-CBC without a separate MAC.
- Constant-time comparison: use `crypto/subtle.ConstantTimeCompare` for tokens / MACs.
- TLS: `crypto/tls.Config` — `MinVersion: tls.VersionTLS12` (or 1.3), set `CipherSuites` if you need to drop weak ones.

## File upload & path traversal

```go
const maxUpload = 5 << 20   // 5 MB

func upload(w http.ResponseWriter, r *http.Request) {
    r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
    if err := r.ParseMultipartForm(maxUpload); err != nil {
        http.Error(w, "too big", 413); return
    }
    f, hdr, err := r.FormFile("file")
    if err != nil { http.Error(w, "bad", 400); return }
    defer f.Close()

    // Sniff content type from first 512 bytes
    buf := make([]byte, 512)
    n, _ := f.Read(buf)
    f.Seek(0, io.SeekStart)
    mime := http.DetectContentType(buf[:n])
    if mime != "image/png" && mime != "image/jpeg" {
        http.Error(w, "bad type", 400); return
    }

    // Sanitize filename
    name := filepath.Base(hdr.Filename)         // strip path components
    if strings.ContainsAny(name, "/\\..") || name == "" || name == "." {
        http.Error(w, "bad name", 400); return
    }

    base := "/var/app/uploads"
    target := filepath.Join(base, name)
    abs, _ := filepath.Abs(target)
    baseAbs, _ := filepath.Abs(base)
    if !strings.HasPrefix(abs, baseAbs+string(os.PathSeparator)) {
        http.Error(w, "bad path", 400); return
    }
    out, _ := os.Create(target)
    defer out.Close()
    io.Copy(out, f)
}
```

`filepath.Join("/base", "../../etc/passwd")` does NOT clean out traversal — it returns `/etc/passwd`. The `Abs + HasPrefix` check is essential.

For Go 1.21+, `os.Root` (added in Go 1.24) and `os.OpenInRoot` provide a safer rooted-path API — use them when available.

## Deserialization

- JSON via `encoding/json` is safe.
- `encoding/gob` deserializes Go-native types — but `gob.Decode` into `interface{}` allows arbitrary registered types. Don't use gob with untrusted data unless you fully understand the registered type set.
- YAML: `gopkg.in/yaml.v3` is safe (doesn't auto-instantiate Go types). The older `yaml.v2` had issues — prefer v3.
- XML: `encoding/xml` is safe; XXE not applicable since Go's XML parser doesn't process external entities.
- `gopkg.in/mgo.v2` (deprecated): some BSON unmarshaling allowed type confusion — migrate to `mongo-go-driver`.

## SSRF

For URL-fetching features:
```go
func safeFetch(url string) (*http.Response, error) {
    parsed, err := url.Parse(url)
    if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
        return nil, errors.New("bad url")
    }
    ips, err := net.LookupIP(parsed.Hostname())
    if err != nil { return nil, err }
    for _, ip := range ips {
        if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
           ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
            return nil, errors.New("forbidden host")
        }
        // Block AWS/GCP metadata
        if ip.Equal(net.IPv4(169, 254, 169, 254)) {
            return nil, errors.New("forbidden host")
        }
    }
    client := &http.Client{
        Timeout: 5 * time.Second,
        CheckRedirect: func(*http.Request, []*http.Request) error {
            return http.ErrUseLastResponse  // disallow redirects, or revalidate
        },
    }
    return client.Get(url)
}
```
TOCTOU note: DNS can return different IPs on the actual fetch. For high-assurance, use a custom `Transport.DialContext` that revalidates the IP at connect time.

## Security headers

Go has no default headers. Add middleware:
```go
func secureHeaders(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        h := w.Header()
        h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        h.Set("Content-Security-Policy", "default-src 'self'; object-src 'none'")
        h.Set("X-Content-Type-Options", "nosniff")
        h.Set("X-Frame-Options", "DENY")
        h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
        next.ServeHTTP(w, r)
    })
}
```
Or use `unrolled/secure`.

## Logging & error handling

- Don't log `r.Header` wholesale (`Authorization`, `Cookie` headers leak credentials).
- Don't include `err.Error()` directly in HTTP responses — sanitize:
  ```go
  log.Printf("internal error: %v", err)         // server-side
  http.Error(w, "internal error", 500)          // client-side
  ```
- `panic`/`recover`: ensure recovery middleware doesn't leak stack traces to clients (log them server-side instead).
- `r.PostForm` reading after `r.ParseForm()` returns the raw form — be careful what you log.

## Dependencies

- `govulncheck` (the official Go vulnerability scanner) in CI:
  ```bash
  go install golang.org/x/vuln/cmd/govulncheck@latest
  govulncheck ./...
  ```
- Pin `go.mod` versions; commit `go.sum`.
- Prefer stdlib over third-party where possible (it has the strictest security review).
- Minimize transitive deps: each one is supply-chain risk.

## Framework-specific footguns

### `net/http` & general
- `http.HandleFunc(pattern, h)` registers global handlers — easy to leak handler from one binary into another via shared init.
- `http.ServeMux` (Go 1.22+) supports method-matching; older muxes match all methods, easy to expose POST endpoints accidentally on GET.
- `r.Form` includes both URL params and body params — if a handler reads `r.FormValue("user_id")` expecting body, attacker can supply via query string.
- `r.ParseMultipartForm(maxMemory)` doesn't enforce a hard size limit — wrap `r.Body` with `http.MaxBytesReader`.
- `http.FileServer(http.Dir("./public"))` serves any file in `./public`, including dotfiles. Use `http.FS(fs.Sub(...))` with an embed.FS for more control.

### Gin
- `c.Bind(&v)` returns an error and writes a 400 response — but doesn't abort the chain. Always `c.Bind(); if err != nil { return }`.
- `gin.SetMode(gin.DebugMode)` in production logs full request bodies — use `ReleaseMode`.
- `c.HTML(200, "user.tmpl", gin.H{"X": userInput})` — uses `html/template`, safe if templates use `{{.X}}`. Don't switch to `text/template` for HTML.

### Echo
- `c.Bind(v)` works similarly to Gin's; check for errors.
- Echo's CSRF middleware is opt-in.

### Fiber
- Fiber wraps fasthttp, which has different semantics from net/http (no per-request goroutines for some paths). Header parsing differs. Be cautious with libraries written for net/http.
- `c.SendFile(path)` with user-controlled path = path traversal — sanitize first.

### Chi
- Chi route patterns like `r.Get("/files/{path:.*}", h)` match across slashes — traversal vector if you join `path` with a base directory naively.

### General
- Goroutine leaks via cancellation context not propagated — security risk if a long-running request keeps fetching after the user disconnects (especially for SSRF flows). Always pass `r.Context()` to outbound requests and respect cancellation.
- `unsafe.Pointer` and `cgo` bypass Go's memory safety — review carefully in security-relevant code.
- `time.AfterFunc` with no cancellation can keep auth tokens alive past their intended TTL.

## Review checklist

1. No `fmt.Sprintf` SQL or string-concat queries
2. `exec.Command` uses argv form, never `sh -c` with user input
3. `html/template` used for HTML output (not `text/template`)
4. Auth middleware enforced; ownership check in every fetch-by-id handler
5. `http.MaxBytesReader` wraps request body in upload handlers
6. JSON decoder uses `DisallowUnknownFields` for strict APIs
7. Cookies: `Secure`, `HttpOnly`, `SameSite` set
8. CORS origins explicit (not `*` with credentials)
9. CSRF protection if cookie-authenticated (gorilla/csrf or nosurf)
10. JWT decoding pins signing method; validates `exp`/`aud`/`iss`
11. File uploads: size limit + `DetectContentType` + `filepath.Base` + abs-path containment check
12. URL fetchers protected against SSRF (private-IP rejection + redirect handling)
13. Secrets from env/secrets manager, never compiled in
14. Security headers middleware (CSP, HSTS, etc.)
15. `govulncheck` clean; `go.sum` committed
