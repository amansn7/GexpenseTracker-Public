# ASP.NET — Secure Coding

Covers ASP.NET Core 6/7/8 (LTS targets), MVC, Razor Pages, Web API, Minimal APIs, and Blazor (Server + WebAssembly). Most guidance applies across hosting models; framework-specific notes are called out.

## Injection

### SQL injection

Entity Framework Core parameterizes by default:
```csharp
// SAFE
var u = await db.Users.FirstOrDefaultAsync(x => x.Email == email);
var u2 = await db.Users.FromSqlInterpolated($"SELECT * FROM Users WHERE Email = {email}")
                       .FirstOrDefaultAsync();    // FormattableString → parameterized

// UNSAFE
var sql = $"SELECT * FROM Users WHERE Email = '{email}'";
var u3 = await db.Users.FromSqlRaw(sql).FirstOrDefaultAsync();   // raw string concat
```
`FromSqlRaw` with a concatenated string is the #1 EF Core injection pattern. Use `FromSqlInterpolated` (which auto-parameterizes) or `FromSqlRaw` with explicit `SqlParameter` arguments:
```csharp
db.Users.FromSqlRaw("SELECT * FROM Users WHERE Email = {0}", email)
```

For Dapper:
```csharp
// SAFE
var u = await conn.QueryFirstAsync<User>(
    "SELECT * FROM Users WHERE Email = @Email", new { Email = email });

// UNSAFE
var u = await conn.QueryFirstAsync<User>(
    $"SELECT * FROM Users WHERE Email = '{email}'");
```

For raw `SqlCommand`:
```csharp
var cmd = new SqlCommand("SELECT * FROM Users WHERE Email = @Email", conn);
cmd.Parameters.AddWithValue("@Email", email);
```

For dynamic ORDER BY columns, validate against an allowlist of column names — you can't parameterize identifiers.

### Command injection

```csharp
// UNSAFE: shell parsing, user input concatenated
Process.Start("cmd.exe", $"/c convert {filename} out.png");

// SAFE: argv-style, no shell
var psi = new ProcessStartInfo("convert") {
    ArgumentList = { filename, "out.png" },
    UseShellExecute = false,
    RedirectStandardOutput = true,
};
Process.Start(psi);
```
Use `ArgumentList` (added in .NET Core 2.1+), not `Arguments` (which is a single string and re-parsed by the OS).

### LDAP injection

```csharp
// UNSAFE
var search = new DirectorySearcher($"(uid={userInput})");

// SAFE: escape per RFC 4515
var safe = LdapFilterEncode(userInput);
var search = new DirectorySearcher($"(uid={safe})");
```
Use a vetted helper or `System.DirectoryServices.Protocols`.

### Razor / template injection

Razor's `@variable` HTML-encodes by default. The bypass is `@Html.Raw(userInput)` — never with user content. Same for `@MarkupString` in Blazor:
```razor
@* DANGEROUS: stored XSS *@
@((MarkupString)userBio)
```

## AuthN / AuthZ

### ASP.NET Core Identity

Use `Microsoft.AspNetCore.Identity` for password hashing — it uses PBKDF2 with HMAC-SHA256, key stretching iterations configurable. Don't roll your own:
```csharp
builder.Services.AddIdentity<AppUser, IdentityRole>(opts => {
    opts.Password.RequireDigit = true;
    opts.Password.RequiredLength = 12;
    opts.Lockout.MaxFailedAccessAttempts = 5;
    opts.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    opts.SignIn.RequireConfirmedEmail = true;
});
```

For external providers (OAuth/OIDC), use `Microsoft.AspNetCore.Authentication.*` packages — don't hand-roll OAuth flows.

### Cookies and sessions

```csharp
builder.Services.ConfigureApplicationCookie(opts => {
    opts.Cookie.HttpOnly = true;
    opts.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    opts.Cookie.SameSite = SameSiteMode.Lax;       // Strict if no cross-site flows
    opts.ExpireTimeSpan = TimeSpan.FromHours(8);
    opts.SlidingExpiration = true;
    opts.LoginPath = "/account/login";
});
```

For Web API JWT auth:
```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opts => {
        opts.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(keyBytes),
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });
```
Common JWT mistakes:
- `ValidateIssuerSigningKey = false` or all `Validate*` set to false — accepts any token.
- Algorithm confusion: only allow what your tokens are issued with (the JWT lib enforces matching the configured key type — keep it strict).
- Don't accept tokens via query string; require `Authorization` header.

### Authorization

`[Authorize]` everywhere by default — flip the default with the global filter:
```csharp
builder.Services.AddAuthorization(opts => {
    opts.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
```
Then opt out with `[AllowAnonymous]` on public endpoints. This prevents the "forgot to add `[Authorize]`" class of bug.

For role/policy:
```csharp
[Authorize(Roles = "Admin")]
[Authorize(Policy = "CanEditOrders")]
```
Define policies in `AddAuthorization` with claim-based requirements — avoid scattering authorization logic across handlers.

### IDOR

```csharp
// UNSAFE: any authed user can fetch any order
var order = await db.Orders.FindAsync(id);

// SAFE: filter by owner
var order = await db.Orders
    .FirstOrDefaultAsync(o => o.Id == id && o.UserId == User.GetUserId());
if (order == null) return NotFound();
```
Or use resource-based authorization:
```csharp
var auth = await _authz.AuthorizeAsync(User, order, "OrderOwnerPolicy");
if (!auth.Succeeded) return Forbid();
```

## CSRF / antiforgery

ASP.NET Core's antiforgery is on by default for Razor Pages (every form gets a token automatically). For MVC, the `[ValidateAntiForgeryToken]` attribute (or `AutoValidateAntiforgeryTokenAttribute` globally) enforces it.

Common mistakes:
- `[IgnoreAntiforgeryToken]` on POST endpoints that change state — only valid for token-authed APIs.
- Razor Pages with manual JavaScript fetch must include the antiforgery token. Inject via `@inject IAntiforgery Antiforgery` and emit as a hidden input or header.

For Web API endpoints authenticated by Bearer JWT, antiforgery is not needed (no ambient credential). For cookie-authed APIs called from the browser, antiforgery is required.

## Input validation

Use data annotations or FluentValidation:
```csharp
public class CreateUserRequest {
    [Required, EmailAddress]
    public string Email { get; set; }

    [Range(0, 150)]
    public int Age { get; set; }

    [StringLength(100, MinimumLength = 1)]
    [RegularExpression(@"^[\w\s\-']+$")]
    public string Name { get; set; }
}
```
With `[ApiController]`, validation runs automatically and returns 400 on failure.

Mass assignment / over-posting:
```csharp
// UNSAFE: User entity has IsAdmin, EmailConfirmed, etc. — all bindable
public IActionResult Update(int id, User user) { ... }

// SAFE: dedicated DTO
public class UpdateUserDto { public string Name { get; set; } }
public IActionResult Update(int id, UpdateUserDto dto) { ... }
```
Or use `[Bind]` to allowlist properties: `[Bind("Name", "Email")] User user`. Never trust raw entity binding for user input.

## CORS

```csharp
builder.Services.AddCors(opts => {
    opts.AddPolicy("api", p => p
        .WithOrigins("https://app.example.com")    // not AllowAnyOrigin
        .AllowCredentials()
        .WithMethods("GET", "POST")
        .WithHeaders("Authorization", "Content-Type"));
});
app.UseCors("api");
```
`AllowAnyOrigin().AllowCredentials()` is rejected by ASP.NET — list explicit origins. `SetIsOriginAllowed(_ => true).AllowCredentials()` is the dangerous workaround — never use it in production.

## Secrets & config

- Use **User Secrets** in dev (`dotnet user-secrets`), Key Vault / Secrets Manager / Parameter Store in prod.
- `appsettings.json` for non-secret config; `appsettings.Production.json` overrides; environment variables override both.
- Never commit `appsettings.Production.json` with real secrets.
- `Configuration["ConnectionStrings:Default"]` returns null silently if missing — fail loudly:
  ```csharp
  var cs = config.GetConnectionString("Default")
      ?? throw new InvalidOperationException("Default connection string not set");
  ```

## Crypto

- `RandomNumberGenerator.GetBytes(32)` for tokens, never `Random`.
- `System.Security.Cryptography.AesGcm` for authenticated encryption; never `AesCng` ECB or CBC without HMAC.
- `Rfc2898DeriveBytes` for password-derived keys; for password storage prefer Identity's hasher or `PasswordHasher<T>`.
- Data Protection API (`IDataProtector`) for app-level token signing/encryption — use it instead of rolling your own. Configure key persistence to file/Azure/Redis so keys survive restarts (otherwise issued tokens become invalid):
  ```csharp
  builder.Services.AddDataProtection()
      .PersistKeysToFileSystem(new DirectoryInfo("/var/keys"))
      .ProtectKeysWithCertificate(cert);
  ```

## File upload & path traversal

```csharp
[HttpPost("upload"), RequestSizeLimit(5 * 1024 * 1024)]
public async Task<IActionResult> Upload([FromForm] IFormFile file) {
    if (file is null || file.Length == 0) return BadRequest();
    if (file.Length > 5 * 1024 * 1024) return BadRequest("too big");

    var allowedMime = new[] { "image/png", "image/jpeg" };
    var buf = new byte[512];
    using (var s = file.OpenReadStream()) {
        await s.ReadAsync(buf);
        s.Position = 0;
        var sniffed = MimeMapping.GuessContentType(buf);   // or use MimeDetective
        if (!allowedMime.Contains(sniffed)) return BadRequest("bad type");
    }

    var safeName = Path.GetFileName(file.FileName);    // strips path components
    if (safeName != file.FileName || safeName.Contains("..")) return BadRequest();

    var baseDir = Path.GetFullPath("/var/app/uploads");
    var target = Path.GetFullPath(Path.Combine(baseDir, safeName));
    if (!target.StartsWith(baseDir + Path.DirectorySeparatorChar))
        return BadRequest("bad path");

    using var fs = System.IO.File.Create(target);
    await file.CopyToAsync(fs);
    return Ok();
}
```

`FormOptions` for global limits:
```csharp
builder.Services.Configure<FormOptions>(o => {
    o.MultipartBodyLengthLimit = 10 * 1024 * 1024;
    o.ValueCountLimit = 1024;
});
```

## Deserialization

- `System.Text.Json` (default) is safe — doesn't deserialize arbitrary types.
- `Newtonsoft.Json` (Json.NET) with `TypeNameHandling.All` or `Auto` is **dangerous** — RCE via gadget chains. Always `TypeNameHandling.None` (default) for untrusted input.
- `BinaryFormatter` is **deprecated and unsafe** — RCE-class. Microsoft has been removing it. Don't use; if you find it in legacy code, replace with `System.Text.Json` or DataContractSerializer.
- `XmlSerializer` is generally safe but external entities in XML must be disabled:
  ```csharp
  var settings = new XmlReaderSettings {
      DtdProcessing = DtdProcessing.Prohibit,
      XmlResolver = null,
  };
  ```
- `SoapFormatter`, `NetDataContractSerializer`, `LosFormatter`, `ObjectStateFormatter` — all unsafe, all deprecated.

## SSRF

For URL-fetching features:
```csharp
public async Task<HttpResponseMessage> SafeFetchAsync(string url) {
    if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) throw new ArgumentException();
    if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        throw new ArgumentException();

    var addrs = await Dns.GetHostAddressesAsync(uri.Host);
    foreach (var ip in addrs) {
        if (IPAddress.IsLoopback(ip) || IsPrivate(ip) || IsLinkLocal(ip) ||
            ip.Equals(IPAddress.Parse("169.254.169.254"))) {
            throw new ArgumentException("forbidden host");
        }
    }
    var handler = new HttpClientHandler { AllowAutoRedirect = false };
    using var client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(5) };
    return await client.GetAsync(uri);
}
```
Use `IHttpClientFactory` rather than `new HttpClient()` per call (socket exhaustion + DNS staleness). Configure SSRF protection in a `DelegatingHandler` so it's applied uniformly.

## Security headers

ASP.NET Core sets some defaults but not CSP. Use middleware:
```csharp
app.UseHsts();   // adds Strict-Transport-Security
app.UseHttpsRedirection();
app.Use(async (ctx, next) => {
    var h = ctx.Response.Headers;
    h["Content-Security-Policy"] = "default-src 'self'; object-src 'none'";
    h["X-Content-Type-Options"] = "nosniff";
    h["X-Frame-Options"] = "DENY";
    h["Referrer-Policy"] = "strict-origin-when-cross-origin";
    await next();
});
```
Or use `NetEscapades.AspNetCore.SecurityHeaders` library.

## Logging & error handling

- `app.UseDeveloperExceptionPage()` only in Development environment — never in Production. It exposes full stack traces, source code, environment.
- `app.UseExceptionHandler("/error")` for production — returns a generic error response.
- Don't log `HttpContext.Request.Headers` wholesale — `Authorization`, `Cookie` carry credentials.
- Configure log filters in `appsettings.Production.json` to exclude `Microsoft.EntityFrameworkCore.Database.Command` (logs SQL with parameters) at Information level — `Warning` is safer in prod.
- For exception messages in API responses, use `ProblemDetails` with sanitized messages, not `ex.ToString()`.

## Dependencies

- `dotnet list package --vulnerable` and `--deprecated` — run in CI.
- NuGet Audit (built into .NET 8 SDK) flags vulnerable packages at restore time.
- Watch CVEs for: `System.IdentityModel.Tokens.Jwt`, `Newtonsoft.Json`, `Microsoft.AspNetCore.*`, `Microsoft.Data.SqlClient`.

## Framework-specific footguns

### General
- `[ApiController]` enables automatic 400 on validation failures — but *not* on Razor Pages or non-API controllers. Without it, `ModelState.IsValid` must be checked manually.
- Minimal APIs: `app.MapGet("/x/{id}", (int id) => ...)` — parameter binding is implicit; antiforgery is opt-in via `RequireAntiforgery()`.
- Razor Pages handlers (`OnPost`, `OnGet`) bind public properties to form fields — same mass-assignment risk as MVC. Mark non-input properties with `[BindNever]`.
- `Url.Action("X", "Y", new { user = User.Identity.Name })` URL-encodes parameters; manual string-building like `$"/profile/{User.Identity.Name}"` does not.
- `[FromQuery]`, `[FromBody]`, `[FromHeader]` should be explicit on public endpoints — implicit binding can pull values from unexpected sources.
- `HttpContext.Request.Headers["X-Forwarded-For"]` is user-controlled unless your proxy is trusted via `ForwardedHeadersOptions.KnownProxies`.

### Razor / MVC
- `@Html.Raw` is the obvious one; also `IHtmlString` / `HtmlString` constructed from user data.
- `Html.ActionLink(linkText, action, controller, routeValues)` — `linkText` is HTML-encoded; route values are URL-encoded. Don't bypass with `Html.Raw(Html.ActionLink(...))`.
- `Url.Content("~/file/" + userInput)` doesn't sanitize traversal — combine with explicit path validation.

### Blazor
- `@((MarkupString)userHtml)` renders raw HTML — XSS vector.
- Blazor Server: each circuit is per-user. Don't store secrets in static fields (shared across all circuits in the app).
- Blazor WebAssembly runs entirely in the browser — anything in the WASM binary is public. No secrets, no server-only logic.
- `JSInterop` calls execute in the browser — same XSS / DOM-injection risks as any JS.

### EF Core
- `IgnoreFilters()` bypasses query filters that you set up for multi-tenancy — easy to leak across tenants.
- `AsNoTracking()` is faster but doesn't auto-apply changes — fine for reads, not for security-critical writes that need concurrency tokens.
- `Include` and projection: be careful what you ship to the client — entire entity graphs may include sensitive fields.

### SignalR
- Hub methods are auth-gated by `[Authorize]` on the hub class or method — easy to forget.
- `Clients.All.SendAsync(...)` broadcasts to every connected user — careful with what you send.
- Connection strings / hub URLs in JS clients are public — don't put secrets there.

## Review checklist

1. No `FromSqlRaw($"...{var}...")`; only `FromSqlInterpolated` or parameterized `FromSqlRaw`
2. No `Process.Start("cmd /c ...")` with user input; use `ArgumentList`
3. `[Authorize]` enforced globally with `FallbackPolicy`; `[AllowAnonymous]` audited
4. Ownership check or resource-based authorization for fetch-by-id endpoints
5. Mass assignment prevented (DTOs, `[Bind]`, `[BindNever]`)
6. Antiforgery on cookie-authed state-changing endpoints
7. Cookies: `HttpOnly`, `SecurePolicy = Always`, `SameSite`
8. JWT validation has all `Validate*` flags set; pinned issuer/audience/key
9. CORS uses explicit origins (no `AllowAnyOrigin().AllowCredentials()`)
10. File uploads: size limit + magic-byte sniff + `Path.GetFileName` + abs-path containment check
11. Razor: no `@Html.Raw` / `MarkupString` with user input
12. Newtonsoft.Json: `TypeNameHandling = None`; no `BinaryFormatter`
13. XML reader: `DtdProcessing = Prohibit`, `XmlResolver = null`
14. Security headers middleware (CSP, HSTS, etc.)
15. `UseDeveloperExceptionPage` only in Development
16. `dotnet list package --vulnerable` clean
