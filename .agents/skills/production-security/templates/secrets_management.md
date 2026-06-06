# Secrets Management Reference

The #1 rule: **secrets never touch code, ever.** Not in variables, not in comments, not in "temporary" config files, not in Docker build args. If `git log -p` or `docker history --no-trunc` can reveal a secret, you have a breach waiting to happen.

---

## 1. Local Development: Environment Variables with Pydantic Settings

Use a `.env` file (always in `.gitignore`) loaded through Pydantic settings.  Required secrets have no default value, so the app crashes immediately on startup if they are missing.

```python
# settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str              # REQUIRED — no default, crash on startup if missing
    jwt_secret_key: str            # REQUIRED
    stripe_api_key: str            # REQUIRED
    redis_url: str = "redis://localhost:6379/0"
    environment: str = "development"
```

```bash
# .env — MUST be in .gitignore
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
JWT_SECRET_KEY=your-256-bit-secret-here
STRIPE_API_KEY=sk_test_...
```

**Key points:**

- Required fields have no default value. Pydantic raises `ValidationError` at startup if they are missing.
- `case_sensitive=False` lets you use either `DATABASE_URL` or `database_url` in `.env`.
- Never commit `.env` to version control.

---

## 2. Production: Secret Managers

Never use `.env` files in production. Use a proper secret manager that provides audit logs, access control, versioning, and rotation.

### GCP Secret Manager

```python
from google.cloud import secretmanager

def get_secret(project_id: str, secret_id: str, version: str = "latest") -> str:
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/{version}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")
```

### AWS Secrets Manager

```python
import boto3

def get_secret(secret_name: str, region: str = "us-east-1") -> str:
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    return response["SecretString"]
```

### Other Production-Grade Options

- **HashiCorp Vault** — self-hosted, full PKI and dynamic secrets
- **Doppler** — SaaS, good DX, syncs across environments
- **1Password Secrets Automation** — if your team already uses 1Password

---

## 3. Docker: BuildKit Secrets Only

Secrets must never appear in image layers. Use BuildKit's `--mount=type=secret` for build-time secrets.

### GOOD: BuildKit secret mount

```dockerfile
# syntax=docker/dockerfile:1

RUN --mount=type=secret,id=pip_index_url \
    PIP_INDEX_URL=$(cat /run/secrets/pip_index_url) \
    pip install --no-cache-dir -r requirements.txt
```

```bash
DOCKER_BUILDKIT=1 docker build --secret id=pip_index_url,src=.pip_credentials .
```

The secret is available only during that `RUN` instruction and never written to any layer.

### DANGEROUS: All of these leak secrets into image layers

```dockerfile
# NEVER DO THIS:
ARG DATABASE_URL=postgresql://...     # visible in docker history
ENV API_KEY=sk_live_...               # visible in docker inspect
COPY .env /app/.env                   # baked into a layer forever
COPY id_rsa /root/.ssh/               # private key in the image
```

Anyone with `docker pull` access can run `docker history --no-trunc` or extract the layer filesystem and read every one of these secrets.

---

## 4. Secret Rotation

Design for rotation from day one. Secrets will be compromised — the question is how fast you can rotate.

### Restart-Based Rotation (Minimum Viable)

Change the secret in your secret manager, then rolling-restart the service. Works if your deploy pipeline is fast (under 5 minutes).

### Zero-Downtime Rotation (Preferred)

Accept both old and new secret during a transition window:

```python
def verify_jwt(token: str) -> dict:
    """Try current key first, fall back to previous key."""
    for key in [settings.jwt_secret_key, settings.jwt_secret_key_previous]:
        if key is None:
            continue
        try:
            return jwt.decode(token, key, algorithms=["HS256"])
        except jwt.InvalidSignatureError:
            continue
    raise HTTPException(status_code=401, detail="Invalid token")
```

### Rotation Checklist

1. Generate new secret in the secret manager.
2. Deploy with both old and new secret accepted (dual-read).
3. Wait for all active sessions / tokens signed with the old key to expire.
4. Remove the old secret from the configuration.
5. Verify no errors related to the old secret in logs.

---

## 5. Pre-Commit Hooks: Catch Secrets Before They Ship

### detect-secrets (Yelp)

Scans staged files for high-entropy strings and known secret patterns. Maintains a baseline file so existing false positives are not flagged repeatedly.

### gitleaks

Fast regex-based scanner with built-in rules for hundreds of secret formats (AWS keys, Stripe keys, GitHub tokens, etc.).

### Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.5.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']

  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks
```

### Manual Scanning Commands

```bash
# Generate baseline (marks existing false positives)
detect-secrets scan > .secrets.baseline

# One-time scan for hardcoded secrets
gitleaks detect --source . --verbose

# Deep scan with TruffleHog (checks git history too)
trufflehog filesystem . --only-verified
```

---

## 6. Detection: Grep for Hardcoded Secrets

Run these on any codebase to find secrets that should not be there:

```bash
# Generic patterns
rg '(password|secret|api_key|token|private_key)\s*=\s*"[^"]{8,}"' -i --type py --type js --type ts
rg '(PASSWORD|SECRET|API_KEY|TOKEN)\s*=\s*"[^"]{8,}"'

# Provider-specific patterns
rg 'sk_(live|test)_[a-zA-Z0-9]{20,}'            # Stripe keys
rg 'AKIA[0-9A-Z]{16}'                            # AWS access keys
rg 'ghp_[a-zA-Z0-9]{36}'                         # GitHub personal access tokens
rg 'xox[bpas]-[a-zA-Z0-9-]+'                     # Slack tokens
rg '-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----'  # Private keys
```

---

## Quick Decision Matrix

| Environment | Method | Notes |
|---|---|---|
| Local dev | `.env` + Pydantic settings | `.env` in `.gitignore`, crash on missing |
| CI/CD | Pipeline secret variables | GitHub Actions secrets, GitLab CI variables |
| Production | Secret manager (GCP, AWS, Vault) | Audit log, versioning, IAM access control |
| Docker build | BuildKit `--mount=type=secret` | Never `ARG`, `ENV`, or `COPY` secrets |
| Rotation | Dual-read pattern | Accept old + new during transition window |
| Prevention | detect-secrets + gitleaks hooks | Block secrets before they enter git history |
