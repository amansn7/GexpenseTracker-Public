# C# — Secure Coding

Covers C# 10/11/12 on .NET 6/7/8 for **non-web** contexts: console apps, background services, Worker Services, desktop (WPF, WinForms, MAUI), libraries, CLIs, and shared business logic. For ASP.NET Core web APIs, MVC, Razor Pages, Blazor, and auth middleware, load `aspnet.md`.

Language-level security in C# is strong — memory-safe, garbage-collected, strong typing. Most issues come from misusing APIs (crypto, serialization, `Process`), mishandling secrets, or skipping runtime validation at trust boundaries.

## Type safety at trust boundaries

C#'s strong typing is compile-time. Data coming from files, network, pipes, named pipes, gRPC, inter-process messaging, etc. needs runtime validation:

```csharp
// BAD: cast through dynamic, no checks
dynamic msg = JsonSerializer.Deserialize<dynamic>(incoming);
ProcessUser(msg.UserId);                      // no type/shape checks

// GOOD: typed DTO + data annotations / FluentValidation
public sealed class UserMessage {
    [Required, Range(1, int.MaxValue)] public int UserId { get; init; }
    [Required, RegularExpression(@"^[\w.-]+$")] public string Name { get; init; }
}
var msg = JsonSerializer.Deserialize<UserMessage>(incoming)
    ?? throw new InvalidDataException();
Validator.ValidateObject(msg, new ValidationContext(msg), validateAllProperties: true);
```

Use `record` or `record class` with `init`-only properties for immutable DTOs.

## Injection

### SQL (outside ASP.NET)

Apps using ADO.NET, Dapper, EF Core for background jobs or consoles have the same rules as web apps. See `aspnet.md` for Dapper / EF patterns. Short version:

- `SqlCommand` with `Parameters.AddWithValue` (or better, `Parameters.Add(name, SqlDbType.X).Value = v`)
- Dapper with named parameters: `new { Email = email }`
- EF Core: `FromSqlInterpolated` (auto-parameterized) — never `FromSqlRaw($"...")`

### Command injection

```csharp
// UNSAFE: Arguments is one string, re-parsed by OS shell rules
Process.Start("cmd.exe", $"/c convert {filename} out.png");
Process.Start(new ProcessStartInfo("convert") {
    Arguments = $"{filename} out.png",
    UseShellExecute = true,
});

// SAFE: ArgumentList, no shell
var psi = new ProcessStartInfo("convert") {
    UseShellExecute = false,
    RedirectStandardOutput = true,
};
psi.ArgumentList.Add(filename);
psi.ArgumentList.Add("out.png");
Process.Start(psi);
```

`UseShellExecute = true` changes behavior depending on platform (on Windows, invokes shell; on .NET Core, defaults differently). Always `false` for security-sensitive code, and use `ArgumentList`.

### LDAP and XPath

- LDAP: escape filter inputs per RFC 4515. `System.DirectoryServices.Protocols` + manual escaping, or `Novell.Directory.Ldap`.
- XPath: use `XPathNavigator.SelectSingleNode(expression, XmlNamespaceManager)` with parameterized expressions via `XsltArgumentList`. Or switch to LINQ to XML (`XDocument`) for user-controlled queries.

## Input validation

```csharp
public sealed class CreateRequest {
    [Required, EmailAddress] public string Email { get; init; }
    [Range(0, 150)] public int Age { get; init; }
    [StringLength(100, MinimumLength = 1)]
    [RegularExpression(@"^[\w\s\-']+$")]
    public string Name { get; init; }
}

var req = JsonSerializer.Deserialize<CreateRequest>(json)
    ?? throw new InvalidDataException();
var ctx = new ValidationContext(req);
Validator.ValidateObject(req, ctx, validateAllProperties: true);
```

Or FluentValidation for more expressive rules.

Mass assignment in non-web contexts still applies — don't deserialize directly into entity types that have internal/admin fields. Use dedicated DTOs.

## Cryptography

### Randomness

```csharp
// BAD: deterministic, not cryptographic
var r = new Random();
r.NextBytes(buf);

// GOOD
RandomNumberGenerator.Fill(buf);                       // .NET 6+
var token = RandomNumberGenerator.GetHexString(32);    // .NET 9+
// For older: RandomNumberGenerator.Create().GetBytes(buf);
```

`Guid.NewGuid()` is NOT cryptographically random on all versions/platforms — don't use for tokens. Always `RandomNumberGenerator`.

### Hashing

Passwords: use `PasswordHasher<T>` from `Microsoft.AspNetCore.Identity` (available outside ASP.NET too) or BCrypt.Net / Konscious.Security.Cryptography (Argon2). Never `SHA256(password)` or `MD5`.

Data integrity: `HMACSHA256` for keyed hashing. Never raw SHA for MACs — that's vulnerable to length extension.

### Symmetric encryption

```csharp
// AES-GCM — AEAD, preferred
using var aesGcm = new AesGcm(key, tagSizeInBytes: 16);
var nonce = new byte[12];
RandomNumberGenerator.Fill(nonce);
var tag = new byte[16];
var ciphertext = new byte[plaintext.Length];
aesGcm.Encrypt(nonce, plaintext, ciphertext, tag, associatedData);
```

Never `AesManaged` (deprecated), never ECB mode, never CBC without a separate MAC and constant-time MAC comparison.

### Constant-time comparison

```csharp
// BAD: short-circuits, leaks timing
if (storedHmac.SequenceEqual(providedHmac)) { ... }

// GOOD: constant-time
if (CryptographicOperations.FixedTimeEquals(storedHmac, providedHmac)) { ... }
```

### Clearing secrets

```csharp
// Clear after use — ordinary Array.Clear gets optimized into memset, which may be optimized away
// .NET provides:
CryptographicOperations.ZeroMemory(keyBytes);
```

For strings holding secrets, consider `SecureString` (limitations: not truly secure on modern platforms, mostly a .NET Framework carry-over). The practical answer is: keep secrets as `byte[]`, zero after use, and minimize lifetime.

## Serialization

### System.Text.Json (safe default)

`JsonSerializer.Deserialize<T>(data)` is safe — doesn't instantiate arbitrary types. Watch for:
- `JsonSerializerOptions { TypeInfoResolver = ... }` with polymorphic type resolvers — review what's allowed.
- `[JsonDerivedType]` polymorphism: restrict with an explicit closed list of subtypes.
- Large / deeply-nested inputs can DoS. Set `MaxDepth` (default 64) appropriately and validate input size.

### Newtonsoft.Json (Json.NET)

Same rules as in `aspnet.md`:
- `TypeNameHandling.None` (default) is safe.
- `TypeNameHandling.All` / `.Auto` / `.Objects` — **DANGEROUS** on untrusted input. RCE via gadget chains. Never on user data.
- If polymorphism is needed, use a `SerializationBinder` that allowlists known types, not `TypeNameHandling.*`.

### Deprecated / dangerous

- `BinaryFormatter` — **unsafe, deprecated, being removed**. RCE-class vulnerabilities. Replace with `System.Text.Json` or `DataContractSerializer`.
- `SoapFormatter`, `NetDataContractSerializer`, `LosFormatter`, `ObjectStateFormatter`, `ResourceReader` on user input — all unsafe.
- `XmlSerializer` is generally safe BUT requires XML hardening (see XML section).
- `DataContractSerializer` is safe; `NetDataContractSerializer` is NOT (it embeds .NET type info, gadget risk).

### XML

Disable external entities and DTD processing:
```csharp
var settings = new XmlReaderSettings {
    DtdProcessing = DtdProcessing.Prohibit,
    XmlResolver = null,
    MaxCharactersFromEntities = 1024,
};
using var reader = XmlReader.Create(stream, settings);
```

`XmlDocument.XmlResolver = null;` before `Load` for the old XmlDocument API.

## File I/O

### Path traversal

```csharp
// UNSAFE: user controls part of the path
var path = Path.Combine("/var/data", userInput);   // "../../etc/passwd" still resolves

// SAFE: canonicalize + containment
var baseDir = Path.GetFullPath("/var/data");
var full = Path.GetFullPath(Path.Combine(baseDir, userInput));
if (!full.StartsWith(baseDir + Path.DirectorySeparatorChar))
    throw new UnauthorizedAccessException();
```

`Path.GetFileName(userInput)` strips directory components but accepts special characters on some platforms — sanitize further.

### Temporary files

```csharp
// SAFE: atomic create with random name
var tempFile = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.tmp");
using var fs = new FileStream(tempFile, FileMode.CreateNew, FileAccess.Write);
```

`Path.GetTempFileName()` creates the file (good) but the name is only 65k possibilities — on shared systems there's a collision risk. Prefer `Guid.NewGuid()`-based names.

### Symlink / reparse point attacks

On Windows, `FileStream` can follow reparse points. On Linux, symlinks are followed by default. If opening a user-supplied path:
- Use `FileStream` with `FileOptions.None` and validate the final path.
- Consider opening via a handle to the parent directory and then `OpenAt`-equivalent APIs (.NET 8 added `File.OpenHandle` with flags).

## Process / exec

Same as command injection section: `ArgumentList` not `Arguments`, `UseShellExecute = false`.

For long-running subprocesses, set timeouts and kill on timeout:
```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(30));
using var p = Process.Start(psi)!;
await p.WaitForExitAsync(cts.Token);
```

Read stdout/stderr asynchronously to avoid deadlocks on large output (pipe buffer fills, child blocks writing).

## HTTP client (outside ASP.NET)

```csharp
// For background services / clients — still applies
using var client = new HttpClient {
    Timeout = TimeSpan.FromSeconds(30),
};
// Validate TLS: by default HttpClient validates; don't turn it off
// Don't:
var handler = new HttpClientHandler {
    ServerCertificateCustomValidationCallback = (_,_,_,_) => true,   // disables validation
};
```

`ServicePointManager.ServerCertificateValidationCallback = (...) => true;` is the legacy equivalent — same problem. Never disable cert validation "to make dev easier" — test with a proper CA or pinned cert.

For SSRF-prone features (user-supplied URL fetchers), the same IP-range-reject logic applies (see `aspnet.md` SSRF section).

## Secrets and config

- Use the .NET **Secret Manager** (`dotnet user-secrets`) in development — stores outside the project folder.
- In production, use Azure Key Vault, AWS Secrets Manager, HashiCorp Vault, or environment variables populated by the orchestrator.
- `appsettings.json` for non-secret config. Don't commit `appsettings.Production.json` with real secrets.
- `Environment.GetEnvironmentVariable("X")` returns null silently — fail loudly at startup if required.

## Logging

- Use `Microsoft.Extensions.Logging` structured logging with placeholders:
  ```csharp
  _log.LogInformation("User {UserId} action {Action}", userId, action);
  // NOT: _log.LogInformation($"User {userId} action {action}");   // kills structure
  ```
- Don't log `HttpRequestMessage.Headers`, `Authorization`, connection strings, or full exception details that include local variables.
- Configure log filters to exclude EF Core's `Microsoft.EntityFrameworkCore.Database.Command` at `Information` (logs parameter values) — use `Warning` in production.
- `ex.ToString()` includes stack trace; log server-side, return a generic message to callers.

## Concurrency

- `lock (obj)` on a public object (or `this`) can deadlock with external code. Use a `private readonly object` lock.
- `async void` methods can't be awaited; exceptions propagate to `SynchronizationContext` and may crash the process. Use `async Task` unless implementing an event handler.
- `ConfigureAwait(false)` in libraries to avoid context capture — not security per se but avoids unexpected thread affinity that can mask auth-context bugs.
- `Task.Result` / `Task.Wait()` in async code can deadlock in single-threaded contexts; also swallows `AggregateException` layering.

## P/Invoke and unsafe

- `[DllImport]` calls into native code — anything returned is outside the CLR's type/memory safety. Validate before use.
- `unsafe` / `fixed` blocks: same risks as C. Use only when necessary (interop, high-perf), and bound carefully.
- `Marshal.Copy`, `Marshal.AllocHGlobal` — explicit native allocation that won't be GC'd. Always paired with `FreeHGlobal` in `finally`.
- `Span<T>` / `Memory<T>` are safe wrappers over possibly-native memory — bounds-checked. Prefer over raw pointers.

## Regular expressions

.NET regex is backtracking by default — catastrophic backtracking on adversarial input:
```csharp
// POTENTIAL REDOS
new Regex("(a+)+$").IsMatch(userInput);

// Mitigations:
// 1) RegexOptions.NonBacktracking (.NET 7+) — linear time
new Regex(pattern, RegexOptions.NonBacktracking);

// 2) Explicit timeout
new Regex(pattern, RegexOptions.None, TimeSpan.FromMilliseconds(100));
```

Always set a timeout on regexes that match untrusted input. `Regex.CacheSize` is global — don't assume one regex's timeout applies to another.

## Dependencies and supply chain

- `dotnet list package --vulnerable` and `--deprecated` in CI.
- NuGet Audit (.NET 8+ SDK) surfaces vulnerable packages at restore time.
- Pin to specific versions or use floating with `<PackageReference>` + `CentralPackageManagement` for consistency.
- Signed packages: prefer signed-by-author packages; verify via NuGet client tooling.
- Watch CVEs for: `Newtonsoft.Json`, `System.Text.Encodings.Web`, `System.IdentityModel.Tokens.Jwt`, `Microsoft.Data.SqlClient`.

## Reflection and dynamic code

```csharp
// DANGEROUS: user-controlled type loading = arbitrary code execution
var t = Type.GetType(userInput);
Activator.CreateInstance(t);

// DANGEROUS: user-controlled assembly loading
Assembly.LoadFrom(userPath);

// DANGEROUS: user-controlled MSIL / expression tree
CSharpScript.EvaluateAsync(userInput);         // Microsoft.CodeAnalysis.Scripting
```

Never load assemblies, types, or execute scripts from user-controlled paths or strings. If you must support a plugin system, use `AssemblyLoadContext` with isolation and load only from signed, verified locations.

## Framework-specific footguns

- `Guid.NewGuid()` for IDs is fine; for **tokens / secrets**, use `RandomNumberGenerator` + Base64URL.
- `DateTime.Now` vs `DateTime.UtcNow` — use UTC for security-relevant timestamps (token expiry, audit logs). `Now` depends on local TZ which may be spoofed in containers.
- `HashCode.Combine` and `Object.GetHashCode()` — NOT cryptographic. Never use for HMAC-equivalent checks.
- `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` is short-circuit; leaks timing for security comparisons.
- `StringBuilder` for secrets — resizes reallocate and leave copies on heap until GC. Use `byte[]` for secret data and zero after use.
- `Environment.Exit` from a library skips `finally` in some contexts — avoid in finalizers / security-critical cleanup paths.
- `Task.Run` + captured async lambdas can outlive the request context; be careful with auth principals (they don't always flow).
- `AppDomain` (framework only — gone in .NET Core+): don't rely on it for isolation.
- `CultureInfo`: locale-dependent formatting can cause `string.ToUpper()` to produce unexpected characters (Turkish-I problem). Use `.ToUpperInvariant()` for security-sensitive comparisons, and better: use `StringComparison.Ordinal` for case-insensitive equality.
- `HttpUtility.UrlDecode` / `Uri.UnescapeDataString` — double-decoding user input before validation can bypass filters. Decode once, then validate.
- Expression tree compilation (`Expression.Compile()`) executes generated IL — don't build expression trees from untrusted source.

## Review checklist

1. DTOs (records) for all external data; runtime validation via DataAnnotations / FluentValidation
2. No `dynamic` on trust-boundary data; no deserialize-to-`object` without explicit allowlist
3. `Process.Start` uses `ArgumentList`, never string-concat Arguments; `UseShellExecute = false`
4. SQL via parameterized APIs; no `FromSqlRaw($"...")`
5. `RandomNumberGenerator` for tokens; never `Random` or `Guid.NewGuid()` for security
6. Password hashing via `PasswordHasher<T>` / BCrypt / Argon2
7. `CryptographicOperations.FixedTimeEquals` for secret comparison
8. AES-GCM for symmetric crypto; no ECB, no CBC-without-MAC
9. `CryptographicOperations.ZeroMemory` after handling secrets
10. Newtonsoft `TypeNameHandling = None`; no `BinaryFormatter`, `NetDataContractSerializer`, `SoapFormatter`
11. XML: `DtdProcessing = Prohibit`, `XmlResolver = null`
12. Path traversal: `Path.GetFullPath` + containment check
13. `HttpClient` TLS validation not disabled; sensible timeout
14. Secrets via Secret Manager / Key Vault / env vars — never in appsettings committed to repo
15. Structured logging via placeholders, not string interpolation; sensitive fields not logged
16. Regex on untrusted input uses `NonBacktracking` or explicit timeout
17. No reflection-based type/assembly loading from user input; no `CSharpScript` / Expression compilation of untrusted strings
18. `dotnet list package --vulnerable` clean
