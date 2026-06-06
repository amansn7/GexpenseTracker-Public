# TypeScript — Secure Coding

Covers TypeScript 5.x for both Node.js/backend code (Express, NestJS, Fastify, Koa, Hono, Next.js route handlers, Deno, Bun) and shared frontend+backend code. For framework-specific frontend guidance, also load `react.md`, `vue.md`, or `angular.md`.

TypeScript gives you *compile-time* type safety — NOT runtime safety. At every trust boundary (HTTP request, JSON parse, IPC message, file read, database row, user-provided config), TypeScript's types are unverified assumptions. You have to validate at the boundary with a runtime schema library (Zod, Valibot, ArkType, io-ts, TypeBox).

## The "TypeScript lies" problem

```ts
// At the type level, this is a safe User. At runtime, it's whatever the API sent.
const res = await fetch("/api/user");
const user: User = await res.json();   // no validation, cast is a lie
user.email.toLowerCase();              // crashes if email is undefined, exposes raw response in stack trace
```

Correct pattern:
```ts
import { z } from "zod";

const UserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
});
type User = z.infer<typeof UserSchema>;

const res = await fetch("/api/user");
const user = UserSchema.parse(await res.json());   // throws on mismatch
```

Trust boundaries that need runtime validation:
- HTTP request bodies / query / params / headers
- Environment variables (`process.env.X` is `string | undefined`, but can be any string)
- JSON from files, message queues, Redis, S3, WebSockets
- Return values from any third-party API
- IPC messages, service-worker `message` events, `postMessage`
- Unknown errors in `catch` clauses (use `unknown` not `any`)

## `tsconfig.json` — security-relevant compiler options

Turn these ON — they catch classes of bugs before code review:
```json
{
  "compilerOptions": {
    "strict": true,                       // enables all of the below by default
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUncheckedIndexedAccess": true,     // arr[i] typed as T | undefined — catches OOB reads
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "useUnknownInCatchVariables": true
  }
}
```

`noUncheckedIndexedAccess` is especially important: without it, `arr[999]` is typed as `T`, hiding out-of-bounds access. With it, you're forced to handle `undefined`.

Avoid:
- `"strict": false` anywhere in a production codebase
- `@ts-ignore` (silently suppresses; use `@ts-expect-error` which errors if the underlying issue is fixed)
- `as any` casts — they disable all type checking at the cast site
- `!` non-null assertion on user-derived data (`user!.email` hides an actual nullable value)

## `any` vs `unknown`

```ts
// BAD: any turns off the type system downstream
function handle(msg: any) {
  msg.user.role.toUpperCase();          // no checks, runtime crash if malformed
}

// GOOD: unknown forces validation before use
function handle(msg: unknown) {
  const parsed = MsgSchema.parse(msg);
  parsed.user.role.toUpperCase();
}
```

ESLint rules: `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-argument`, `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`.

## Injection

Same rules as any JavaScript backend:

### SQL injection

```ts
// UNSAFE: template literal interpolation into raw SQL
await db.query(`SELECT * FROM users WHERE email = '${email}'`);

// SAFE with pg
await db.query("SELECT * FROM users WHERE email = $1", [email]);

// SAFE with Prisma
await prisma.user.findUnique({ where: { email } });

// SAFE with Drizzle (parameterized tags)
await db.select().from(users).where(eq(users.email, email));

// DANGEROUS in Prisma — raw concatenation
await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${email}'`);

// SAFE — tagged template, parameterized
await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;
```

For dynamic ORDER BY columns, allowlist before passing to the query builder.

### Command injection

```ts
import { execFile, spawn } from "node:child_process";

// UNSAFE: shell parses input
exec(`convert ${filename} out.png`, callback);

// SAFE: argv form, no shell
execFile("convert", [filename, "out.png"], callback);
spawn("convert", [filename, "out.png"]);
```

`shell: true` on `spawn` re-enables shell parsing — avoid with user input.

### Prototype pollution

```ts
// UNSAFE: user-controlled keys merged into target
function merge(target: any, src: any) {
  for (const k in src) target[k] = src[k];
}
merge({}, JSON.parse('{"__proto__": {"isAdmin": true}}'));
```

Mitigations:
- Parse via Zod/similar and reject unexpected keys.
- Use `Map` instead of plain objects for dynamic key maps.
- `Object.create(null)` for base objects so there's no prototype.
- Keep `lodash` ≥ 4.17.21, `minimist` ≥ 1.2.6; both had pollution CVEs.
- Node 20+: `--disable-proto=delete` flag removes the `__proto__` accessor.

## Input validation patterns

With Zod on an Express route:
```ts
import { z } from "zod";

const Body = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150),
}).strict();                            // reject extra keys → mass-assignment protection

app.post("/users", async (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });
  // parsed.data is fully typed + validated
});
```

Same for query params and URL params. Never trust `req.body`, `req.query`, `req.params`, or `req.headers` as typed data.

For NestJS, use `class-validator` + `class-transformer` with `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — those options strip extra fields and enforce types.

## Authentication

Don't roll your own JWT. Libraries:
- `jsonwebtoken` — pin `algorithms: ["HS256"]` (or RS256) on `verify`. Never accept `none`.
- `jose` — modern; strict by default.

```ts
import jwt from "jsonwebtoken";
const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as { sub: string };
// Immediately validate the payload shape with Zod, don't trust the cast
const p = JwtPayloadSchema.parse(payload);
```

Password hashing: `argon2` (preferred), `bcrypt`. Never custom SHA.

## Environment variables

```ts
// BAD: any env var is silently undefined
const port = parseInt(process.env.PORT);   // NaN if unset

// GOOD: validate at startup
const env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
}).parse(process.env);
```

Crash at startup if required vars are missing — much better than "login sometimes fails in production."

## Node-specific (Express / NestJS / Fastify)

### Security middleware

```ts
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

app.use(helmet());                        // sensible security headers
app.use(cors({
  origin: ["https://app.example.com"],    // not "*"
  credentials: true,
}));
app.use(rateLimit({ windowMs: 60_000, max: 100 }));
app.use(express.json({ limit: "100kb" }));   // reject huge bodies
```

Fastify has built-in rate limiting (`@fastify/rate-limit`) and `@fastify/helmet`. NestJS wraps Express or Fastify — apply helmet and rate limiting globally in `main.ts`.

### CSRF

- Cookie-authed apps: use `csurf` (deprecated but widely used — audit replacements like `@fastify/csrf-protection` or roll double-submit-cookie).
- Bearer-token APIs: CSRF not required (no ambient credential).

### File upload

With `multer`:
```ts
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg)$/.test(file.mimetype)) return cb(new Error("bad type"));
    cb(null, true);
  },
});
```

The `mimetype` is user-supplied — sniff magic bytes after upload for actual validation (`file-type` package).

Never use `req.file.originalname` as a filesystem path component without sanitization:
```ts
import path from "node:path";
const safe = path.basename(req.file.originalname).replace(/[^\w.\-]/g, "_");
const target = path.resolve(UPLOAD_DIR, safe);
if (!target.startsWith(UPLOAD_DIR + path.sep)) throw new Error("traversal");
```

### Deserialization

- `JSON.parse(body)` is safe (no code execution). But `JSON.parse(body, reviver)` with a user-controlled reviver is dangerous — don't.
- `eval`, `Function(string)`, `vm.runInNewContext(str)` — never with user input; all are RCE.
- YAML: `js-yaml` — always use `yaml.load(data)` (default `FAILSAFE_SCHEMA` in recent versions) or `yaml.load(data, { schema: yaml.CORE_SCHEMA })`; never custom tag resolvers on untrusted data.
- `serialize-javascript` / `node-serialize`: the latter's deserialize is RCE via `_$$ND_FUNC$$_` — don't use.

### SSRF

Node's `fetch`, `axios`, `got`, `undici` will hit any URL. For user-supplied URLs:
```ts
import { lookup } from "node:dns/promises";
import net from "node:net";

async function isSafeUrl(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) return false;
  const { address } = await lookup(u.hostname);
  const ip = net.isIP(address) ? address : null;
  if (!ip) return false;
  // Reject private, loopback, link-local, metadata
  if (/^10\./.test(ip) || /^127\./.test(ip) || /^192\.168\./.test(ip) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      /^169\.254\./.test(ip) || ip === "::1") return false;
  return true;
}
```

Set short timeouts and disable redirects (or revalidate after each).

## Error handling

```ts
// BAD: swallow error, leak raw message to client
app.use((err, req, res, next) => {
  res.status(500).send(err.message);     // exposes internals
});

// GOOD
app.use((err, req, res, next) => {
  logger.error({ err }, "request failed");
  res.status(500).json({ error: "internal error" });
});
```

`process.on("uncaughtException")` and `"unhandledRejection"` — log + exit, don't try to "recover." A process in an unknown state can leak data.

With `useUnknownInCatchVariables`:
```ts
try { /* ... */ }
catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error({ msg });
}
```

## Secrets

- Never `console.log(process.env)` — ships all env vars to logs, including secrets.
- Don't commit `.env` files. Use `.env.example` with blank values.
- For the browser, `REACT_APP_*` / `VITE_*` / `NEXT_PUBLIC_*` are bundled — only put non-secret, client-safe values there (see `react.md`, `vue.md`).
- Logging: scrub fields like `password`, `token`, `secret`, `Authorization` before logging request bodies/headers. `pino` has redaction built in (`redact: ["password", "*.password", "headers.authorization"]`).

## Timing attacks

Comparing secrets (session IDs, HMAC signatures, password hashes) with `===` leaks timing. Use `crypto.timingSafeEqual`:
```ts
import { timingSafeEqual } from "node:crypto";
// Buffers must be same length
if (a.length !== b.length) return false;
return timingSafeEqual(Buffer.from(a), Buffer.from(b));
```

## Dependencies and supply chain

- `npm audit` / `pnpm audit` / `yarn audit` in CI; treat `high` and above as release blockers.
- Pin via lockfile; commit it. Dependabot / Renovate for upgrades.
- Scrutinize postinstall scripts. `npm ci --ignore-scripts` in CI (then allow-list known-good packages).
- Supply-chain scanners: `socket.dev`, `snyk`, `npq`.
- Typosquatting: verify package names before installing (`coffescript` vs `coffeescript`).
- Avoid micro-packages; prefer well-maintained, widely-used deps.
- Use the official `@types/*` for runtime libs you import, or packages with bundled types.

## TypeScript-specific footguns

- `as` is a static cast. `value as Foo` tells the compiler "trust me" — no runtime check. Especially dangerous across type boundaries. Prefer Zod's `parse` (throws) or `safeParse` (discriminated result).
- `enum`: numeric enums can be reverse-mapped; strings come out as runtime strings, but a user passing a non-enum string matches at runtime if you cast. Validate.
- `Record<string, T>` claims no `undefined`, but `rec["anything"]` returns `T` even when the key is missing. Use `noUncheckedIndexedAccess` to get `T | undefined`.
- `readonly` is compile-time only; no runtime enforcement. A consumer with a mutable reference can still mutate.
- `type` aliases are erased at runtime. You can't `instanceof MyType`. Use classes or runtime schemas when you need runtime discrimination.
- Template literal types are static-only. `type URL = \`https://${string}\`` doesn't validate at runtime.
- `satisfies` operator (TS 4.9+): preferred over `as` for object literals — keeps the narrow type while checking conformance.
- Function parameter bivariance (with `--strictFunctionTypes` off): can let incompatible handlers be assigned. Use methods (`foo(x: T): void`) vs arrow properties (`foo: (x: T) => void`) intentionally.
- `Object.keys(obj)` returns `string[]`, not `(keyof T)[]`. Iterating and indexing back into `obj` needs a cast — safer to iterate with `for (const k of Object.keys(obj) as (keyof T)[])` after validating.
- `JSON.parse` returns `any`. Prefer `JSON.parse(text) as unknown` and then validate.
- `async` function return types are `Promise<T>`. Returning a naked value wraps it; returning a Promise is "unwrapped." Missing `await` on a Promise that throws causes unhandled rejection.
- `Array<T>` methods like `.find` / `.at` return `T | undefined`; forgetting to handle the undefined branch causes runtime crashes.
- Class fields: `#private` is true private (runtime-enforced); `private` is compile-time only. Secret fields (signing keys, tokens) should use `#private` if you care about encapsulation.
- Decorators: experimental vs stage 3 decorators behave differently. Be explicit in `tsconfig.json` with `experimentalDecorators` and `emitDecoratorMetadata`.

## Deno / Bun specifics

- **Deno**: permission model (`--allow-net`, `--allow-read`, etc.) is a real security boundary. Run with minimum permissions. Deno 2.x keeps the model.
- **Bun**: generally matches Node APIs but with some divergent behaviors (e.g., faster `fetch`, slightly different streams). Validate your security libs work as expected.

## Review checklist

1. `tsconfig.json` has `"strict": true` + `noUncheckedIndexedAccess` + `useUnknownInCatchVariables`
2. No `as any`, no `@ts-ignore`; `@ts-expect-error` used instead when needed
3. Every trust-boundary input validated via Zod / Valibot / class-validator; `.strict()` / `whitelist: true` rejects extra keys
4. `unknown` used in `catch`; errors narrowed before use
5. SQL via parameterized APIs (Prisma, Drizzle, pg placeholders); no template-literal interpolation into raw SQL
6. `execFile` / `spawn` (no `shell: true`) — never `exec` with user input
7. JWT verified with pinned `algorithms`; payload re-validated with schema
8. Env vars validated at startup
9. Helmet + CORS (explicit origins) + rate limiting + body-size limits on HTTP servers
10. File uploads: size + MIME + magic-byte sniff + path sanitization
11. No `eval` / `new Function(str)` / `vm.run*` with user input
12. `crypto.timingSafeEqual` for secret comparison
13. SSRF guards on URL-fetcher endpoints
14. `.env` not committed; `console.log(process.env)` audit clean
15. `npm audit` (or pnpm/yarn) clean at `high+`; lockfile committed; `--ignore-scripts` in CI where feasible
16. Prototype-pollution hardening: `Object.create(null)` for dynamic maps, lodash/minimist current
