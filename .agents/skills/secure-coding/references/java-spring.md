# Java Spring / Spring Boot — Secure Coding

Covers Spring Framework 5/6, Spring Boot 2/3, Spring Security 5/6, Spring Data JPA, Spring WebMVC and WebFlux.

## Injection

### SQL injection

**Unsafe:**
```java
// String concatenation in JdbcTemplate
jdbc.queryForList("SELECT * FROM users WHERE name = '" + name + "'");

// Concatenation in JPQL/HQL
em.createQuery("SELECT u FROM User u WHERE u.email = '" + email + "'");

// Spring Data @Query with concatenation via SpEL
@Query("SELECT u FROM User u WHERE u.role = ?#{[0]}")  // SpEL can be abused
```

**Safe:**
```java
// JdbcTemplate with parameter binding
jdbc.queryForList("SELECT * FROM users WHERE name = ?", name);
namedJdbc.queryForList("SELECT * FROM users WHERE name = :name", Map.of("name", name));

// JPA criteria or named parameters
em.createQuery("SELECT u FROM User u WHERE u.email = :email", User.class)
  .setParameter("email", email);

// Spring Data — derived queries or @Query with named params
@Query("SELECT u FROM User u WHERE u.role = :role")
List<User> findByRole(@Param("role") String role);
```

For **dynamic ORDER BY / column names** (which can't be parameterized), validate against an allowlist before interpolating.

### Command injection

```java
// UNSAFE: shell metacharacters in user input
Runtime.getRuntime().exec("ping " + host);

// SAFE: argv form, no shell interpretation
new ProcessBuilder("ping", "-c", "1", host).start();
```
Never pass user input to `Runtime.exec(String)` (string form invokes a shell parser). Always use the `String[]` / `ProcessBuilder` argv form and validate `host` against an allowlist or strict regex.

### LDAP injection

Use `LdapTemplate` with `LdapQueryBuilder.query().where("uid").is(username)` rather than concatenating filter strings. If you must build a filter string, use `org.springframework.ldap.support.LdapEncoder.filterEncode(value)`.

### Expression / SpEL injection

Never evaluate user input as SpEL:
```java
// CRITICAL: RCE
ExpressionParser parser = new SpelExpressionParser();
parser.parseExpression(userInput).getValue();
```
Same applies to Thymeleaf `th:utext` with user input, and to MVEL/OGNL expressions. If you must evaluate expressions, use `SimpleEvaluationContext.forReadOnlyDataBinding().build()` (not `StandardEvaluationContext`).

## AuthN / AuthZ

### Spring Security configuration

For Spring Security 6+ (lambda DSL):
```java
@Bean
SecurityFilterChain chain(HttpSecurity http) throws Exception {
    return http
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/public/**").permitAll()
            .requestMatchers("/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated())            // default-deny
        .csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
        .headers(h -> h.contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'")))
        .build();
}
```

Key rules:
- End the chain with `.anyRequest().authenticated()` so any forgotten endpoint is denied by default.
- Order matters — first match wins. Put specific patterns before broad ones.
- Don't use `permitAll()` on actuator endpoints in production. Use `EndpointRequest.toAnyEndpoint()` and require an admin role.

### Method security

Enable `@EnableMethodSecurity(prePostEnabled = true)` and use `@PreAuthorize` on service methods, not just controllers — controllers can be bypassed by other entry points.

```java
@PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal.id")
public User getUser(Long userId) { ... }
```

### Password storage

Use `PasswordEncoder` — never raw SHA/MD5:
```java
@Bean
PasswordEncoder passwordEncoder() {
    // Argon2 preferred; bcrypt is acceptable
    return new BCryptPasswordEncoder(12);
}
```
For migration from legacy hashes, use `DelegatingPasswordEncoder` so old hashes still work and get re-hashed on login.

### Session & cookies

In `application.yml`:
```yaml
server:
  servlet:
    session:
      cookie:
        secure: true
        http-only: true
        same-site: lax     # use 'strict' if no cross-site flows
      timeout: 30m
```
Spring Security defaults to `Strict` SameSite in 6.x — verify if your OAuth/SSO redirect-back flow still works.

### IDOR

Spring Data and `@PathVariable` make IDOR easy. Always check ownership in the service layer:
```java
@PreAuthorize("@orderService.isOwner(#orderId, authentication)")
@GetMapping("/orders/{orderId}")
public Order get(@PathVariable Long orderId) { ... }
```

## CSRF

Spring Security enables CSRF protection by default for state-changing requests. **Don't disable it** unless you're building a stateless API authenticated by Bearer tokens. The common antipattern:

```java
// AVOID unless you understand the implications
http.csrf(AbstractHttpConfigurer::disable);
```
For SPAs, use `CookieCsrfTokenRepository.withHttpOnlyFalse()` and have the SPA echo the cookie value in the `X-XSRF-TOKEN` header.

For pure stateless JWT APIs CSRF can be disabled, but only because there's no ambient credential — make sure tokens are sent in `Authorization`, not cookies. If you put JWTs in cookies, CSRF protection is required.

## XSS / output encoding

- **Thymeleaf**: `th:text` auto-escapes. `th:utext` does NOT — never use it with user input.
- **JSP**: `<c:out value="${x}"/>` escapes; `${x}` directly does not.
- **JSON responses** via `@RestController` are safe by default (Jackson encodes), but never set `Content-Type: text/html` on a response containing user data without escaping.

## CORS

```java
@Bean
CorsConfigurationSource cors() {
    CorsConfiguration c = new CorsConfiguration();
    c.setAllowedOrigins(List.of("https://app.example.com"));     // not "*"
    c.setAllowedMethods(List.of("GET","POST"));
    c.setAllowCredentials(true);                                  // requires explicit origins
    UrlBasedCorsConfigurationSource s = new UrlBasedCorsConfigurationSource();
    s.registerCorsConfiguration("/api/**", c);
    return s;
}
```
Never combine `allowedOriginPatterns("*")` with `allowCredentials(true)` — Spring will silently allow any origin to make credentialed requests.

## Secrets & config

- Never commit `application.properties` / `application.yml` with real secrets. Use Spring Cloud Config, Vault, or env vars (`${MY_SECRET}`).
- `@Value("${secret}")` on a field with a default (`${secret:fallback}`) hides missing-config errors — be explicit.
- The Actuator `/env` and `/configprops` endpoints leak config values — sanitize via `management.endpoint.env.show-values: NEVER` (Spring Boot 3+) or restrict access.

## Crypto

- Random IDs / tokens: `SecureRandom`, never `java.util.Random` or `Math.random()`.
- AES: `AES/GCM/NoPadding` with a unique 96-bit IV per message. Avoid `AES/ECB/*` and `AES/CBC/PKCS5Padding` (the latter is vulnerable to padding-oracle attacks if you decrypt without a separate MAC).
- Don't roll your own JWT — use `jjwt` or Spring Authorization Server. Verify `alg` is what you expect (reject `none` and HMAC-vs-RSA confusion).

## File upload & path traversal

```java
// Reject filenames with path separators or .. segments
String name = Paths.get(originalFilename).getFileName().toString();
if (name.contains("..") || name.startsWith(".")) throw new BadRequestException();

// Resolve and verify the final path stays inside the base
Path target = baseDir.resolve(name).normalize();
if (!target.startsWith(baseDir)) throw new SecurityException();
```
Set max file size:
```yaml
spring:
  servlet:
    multipart:
      max-file-size: 5MB
      max-request-size: 10MB
```
Validate content type by **sniffing magic bytes** (e.g., Apache Tika), not by trusting the client-supplied `Content-Type`.

## Deserialization

- **Java native serialization (`ObjectInputStream`)** is dangerous — gadget chains in libraries like commons-collections lead to RCE. Avoid it for untrusted data. If unavoidable, use a `ObjectInputFilter` allowlist.
- **Jackson**: avoid `enableDefaultTyping()` / `@JsonTypeInfo(use = Id.CLASS)` on user input (CVE-2017-7525 lineage). If polymorphism is needed, use `@JsonTypeInfo(use = Id.NAME)` with a closed `@JsonSubTypes` list.
- **YAML**: SnakeYAML's default `Yaml()` constructor allows arbitrary class instantiation. Use `new Yaml(new SafeConstructor(new LoaderOptions()))`.
- **XML**: disable DTDs and external entities to prevent XXE:
  ```java
  factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
  factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
  factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
  ```

## SSRF

`RestTemplate` / `WebClient` will follow redirects and resolve any URL the user gives them. For webhook / URL-fetcher features:
- Parse the URL, resolve the host, and reject private IP ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7) and metadata endpoints (169.254.169.254).
- Disable redirect following or re-validate after each redirect.
- Set short connect/read timeouts.

## Security headers

Spring Security 6 enables sensible defaults (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`). Add CSP and HSTS explicitly:
```java
http.headers(h -> h
    .httpStrictTransportSecurity(hsts -> hsts.maxAgeInSeconds(31536000).includeSubDomains(true))
    .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'; object-src 'none'"))
    .referrerPolicy(rp -> rp.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)));
```

## Logging & error handling

- Don't log `request.getParameterMap()`, `Authorization` headers, session IDs, or response bodies that might contain PII.
- `@ExceptionHandler` should return a generic message in production. Don't expose stack traces — set `server.error.include-stacktrace: never` and `server.error.include-message: never` in `application.yml`.
- SLF4J parameterized logging (`log.info("user {}", id)`) avoids accidental string concat and log-injection if `id` contains newlines — but for high-risk fields, also strip CR/LF.

## Dependencies

- Run `./mvnw dependency-check:check` (OWASP Dependency-Check) or use `dependency-track` in CI.
- Watch advisories for: log4j (CVE-2021-44228), Spring4Shell (CVE-2022-22965), spring-cloud-function (CVE-2022-22963), Jackson polymorphic types, SnakeYAML.

## Framework-specific footguns

- `@RequestMapping` on a class without an explicit method matches all HTTP verbs — use `@GetMapping`/`@PostMapping`.
- Spring Boot Actuator exposes `/actuator/heapdump` and `/actuator/env` — do not expose to the internet.
- `@CrossOrigin` annotation on a controller bypasses your global CORS config — pick one place to define it.
- Property binding can populate fields the user shouldn't control. Use `@ConstructorBinding` records or DTOs with explicit fields, never `@ModelAttribute` directly on entity classes.
- `WebSecurityConfigurerAdapter` is removed in Spring Security 6 — migrate to `SecurityFilterChain` beans.

## Review checklist

1. Every state-changing endpoint behind `@PreAuthorize` or filter-chain rule
2. CSRF enabled (or explicitly justified for stateless APIs)
3. No string-concat SQL/JPQL anywhere
4. No `Runtime.exec(String)` with user input
5. CORS is not `*` with credentials
6. Actuator endpoints not exposed publicly
7. File uploads have size limit, type sniffing, sanitized filename, path-traversal check
8. Jackson default typing disabled
9. Passwords via `PasswordEncoder` (bcrypt/argon2), never raw hash
10. Cookies: `Secure`, `HttpOnly`, `SameSite` set
11. CSP and HSTS headers configured
12. Stack traces and Actuator details not exposed in error responses
