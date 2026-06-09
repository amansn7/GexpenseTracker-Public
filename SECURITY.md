# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in MoneyFlow, please report it privately.

**Do not** open a public GitHub issue. Instead, email the maintainer or open a GitHub Security Advisory draft at:

https://github.com/your-username/moneyflow/security/advisories

You should receive a response within 48 hours. If not, follow up to ensure receipt.

## Scope

- The backend (`app/`) — API endpoints, auth, data handling
- The frontend (`static/src/`, `templates/`) — XSS, CSRF, CSP
- OAuth and JWT flows
- Database queries (SQL injection)

## Out of Scope

- Third-party LLM providers (report issues to their respective projects)
- Gmail API (Google's responsibility)
- Railway deployment infrastructure

## Supported Versions

The latest commit on `main` is the only supported version. There are no LTS releases.
