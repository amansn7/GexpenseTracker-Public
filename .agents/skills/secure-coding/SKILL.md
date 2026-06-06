---
name: secure-coding
description: Apply secure coding practices when writing, reviewing, or refactoring code in Java Spring/Spring Boot, Django, Flask, FastAPI, Ruby on Rails, React, Vue, Angular, Go, ASP.NET, C, C++, TypeScript, C#, or Terraform. Use this skill whenever the user adds a new endpoint, handles user input, writes a query, sets up authentication/authorization, configures CORS or session cookies, processes file uploads, calls an external URL, renders user-controlled HTML, deserializes data, builds login flows, writes systems/memory-managed code (C/C++), defines infrastructure (Terraform), or asks for a security review of code in any of these languages or frameworks — even when they don't explicitly say "secure" or "security". Also use when reviewing PRs, modifying middleware/filters/interceptors, configuring framework security settings (Spring Security, Django settings, Rails initializers, ASP.NET Identity), tightening tsconfig/compiler flags, writing code that touches secrets, crypto, subprocess execution, raw pointers, or HTTP headers, or defining cloud resources, IAM policies, or security groups in HCL.
---

# Secure Coding

A skill for writing and reviewing secure code in popular web frameworks. Each framework has idiomatic safe patterns and signature footguns; generic OWASP advice is not enough — apply framework-specific guidance.

## When to apply

Trigger this skill when working in any of the following languages or frameworks:

| Reference | Language / Framework |
| --- | --- |
| `references/java-spring.md` | Java Spring / Spring Boot |
| `references/python-django.md` | Python Django |
| `references/python-flask.md` | Python Flask |
| `references/python-fastapi.md` | Python FastAPI |
| `references/ruby-on-rails.md` | Ruby on Rails |
| `references/react.md` | React (incl. Next.js) |
| `references/vue.md` | Vue (incl. Nuxt) |
| `references/angular.md` | Angular |
| `references/go.md` | Go (net/http, Gin, Echo, Fiber, Chi) |
| `references/aspnet.md` | ASP.NET (Core, MVC, Web API, Razor, Blazor) |
| `references/c.md` | C (C99–C23, systems / embedded / kernel-adjacent) |
| `references/cpp.md` | C++ (C++17/20/23) |
| `references/typescript.md` | TypeScript (Node/Express/NestJS/Fastify/Deno/Bun + shared frontend) |
| `references/csharp.md` | C# language (non-web contexts — console, services, desktop, libs) |
| `references/terraform.md` | Terraform / OpenTofu (AWS, Azure, GCP IaC) |

## Workflow

1. **Identify the language/framework(s)** in scope. Look at `package.json`, `tsconfig.json`, `pom.xml`, `build.gradle`, `requirements.txt`, `Pipfile`, `pyproject.toml`, `Gemfile`, `go.mod`, `*.csproj`, `*.sln`, `Makefile`/`CMakeLists.txt`, `*.tf`/`*.tfvars`, or imports and file extensions in the file at hand. If multiple are present (e.g., a React+TypeScript frontend with a Django backend deployed via Terraform), load each relevant reference.
2. **Load only the relevant reference file(s).** Each reference is self-contained and covers the framework's most common security pitfalls plus the idiomatic safe patterns.
3. **Apply guidance to the specific change.** Don't dump the full checklist into a PR — focus on the categories the change actually touches (e.g., a new endpoint that accepts JSON: input validation, authn/authz, output encoding; a new file upload: storage path, content-type, size limits).
4. **When reviewing code**, walk the changed lines through the reference's "review checklist" section and call out concrete issues with file:line references and a suggested fix.
5. **When writing new code**, prefer the "safe pattern" snippets from the reference over inventing your own.

## What each reference covers

Web-framework references (Spring, Django, Flask, FastAPI, Rails, React, Vue, Angular, Go, ASP.NET) are organized around the same categories:

- **Injection** — SQL, NoSQL, command, LDAP, template, header injection
- **AuthN / AuthZ** — login flows, session/cookie config, password storage, role checks, IDOR
- **CSRF** — when it applies, framework defaults, common ways to disable it accidentally
- **XSS / output encoding** — auto-escaping defaults and how to bypass them safely vs. dangerously
- **CORS** — restrictive defaults, common misconfigurations
- **Secrets & config** — where secrets should and shouldn't live, framework-specific config pitfalls
- **Crypto** — what the framework gives you and what to avoid rolling yourself
- **File upload & path traversal** — safe storage, content-type handling, filename sanitization
- **Deserialization** — safe parsers, dangerous formats (Pickle, Marshal, BinaryFormatter, ObjectInputStream, YAML.load)
- **SSRF** — outbound HTTP calls, URL fetchers, webhooks
- **Security headers** — CSP, HSTS, X-Frame-Options, Referrer-Policy, framework-specific helpers
- **Logging & error handling** — what to log, what NOT to log (PII, secrets, tokens), stack-trace exposure
- **Dependencies** — known-bad versions, advisory database links, upgrade paths
- **Framework-specific footguns** — the gotchas that bite even experienced developers

Language references focus on issues that transcend frameworks:

- **C / C++** — memory safety (buffer/heap overflows, UAF, double-free), integer overflow/underflow, format strings, string/path APIs, TOCTOU, command injection via `system`/`exec`, crypto-library usage, compiler hardening (`-D_FORTIFY_SOURCE`, stack protectors, ASAN/UBSAN/fuzzing)
- **TypeScript** — type safety as a compile-time-only guarantee, runtime validation at trust boundaries (Zod/Valibot/class-validator), strict `tsconfig.json`, `any`-vs-`unknown`, Node-specific topics (Express/NestJS/Fastify middleware, prototype pollution, `eval`/`vm`/`Function(str)`, supply chain)
- **C# (non-web)** — `Process.Start` argv handling, cryptography API usage (RNG, hashing, AEAD), serialization dangers (`BinaryFormatter`, `Newtonsoft.Json` `TypeNameHandling`), XML entity hardening, secret clearing, `HttpClient` TLS, reflection/`CSharpScript` RCE surfaces, ReDoS
- **Terraform** — secrets in `.tf`/state, public-resource misconfigurations (S3, security groups, firewalls), IAM wildcards and trust-policy `Condition` blocks, encryption-at-rest/in-transit defaults, module/provider pinning, dangerous provisioners, policy-as-code in CI (tfsec, checkov, trivy config)

## How to use the references

- For **focused tasks** (e.g., "review this login controller"), load one reference and search for the relevant section.
- For **broad reviews** (e.g., "audit this Spring Boot service"), load the reference and walk the full checklist at the bottom.
- For **multi-stack apps** (e.g., React + FastAPI), load both — frontend and backend security concerns rarely overlap perfectly (CSRF, CORS, and auth-token storage all live at the seam between them).

## Output style for reviews

When reviewing code, structure findings as:

```
[Severity] <Category> — <file>:<line>
What: <one-sentence description of the issue>
Why it matters: <concrete impact>
Fix: <minimal code change or pattern reference from the framework guide>
```

Severity scale: **Critical** (RCE, auth bypass, mass data exposure) / **High** (privilege escalation, IDOR, stored XSS) / **Medium** (reflected XSS, CSRF on state change, info disclosure) / **Low** (missing defense-in-depth, hardening gaps).

Don't pad the report with passing checks — list what's wrong, what's missing, and what to do about it.

## When the language/framework isn't in the list

If the user is working in a language or framework not covered (e.g., Rust, Kotlin, Phoenix, Laravel, NestJS, Pulumi, CloudFormation), apply the closest analogue and tell the user explicitly that you're extrapolating, so they can verify framework-specific behaviors. Rough analogues:

- **Rust** ≈ C/C++ for unsafe blocks / FFI; otherwise memory-safe by default — focus on `unsafe`, crypto crate usage (RustCrypto / ring), and web-framework specifics (Axum/Actix).
- **Kotlin (JVM)** ≈ `java-spring.md` for Spring Boot / Ktor; same crypto & serialization pitfalls as Java.
- **NestJS** ≈ `typescript.md` for the language layer + `angular.md`-style DI/decorator patterns.
- **Phoenix (Elixir)** ≈ `ruby-on-rails.md` — similar defaults (CSRF protection, parameter binding), different idioms.
- **Laravel (PHP)** ≈ `ruby-on-rails.md` — comparable MVC and convention-over-configuration security defaults.
- **Pulumi / CloudFormation / Bicep** ≈ `terraform.md` — same IaC concerns (secrets, state, public resources, IAM).
