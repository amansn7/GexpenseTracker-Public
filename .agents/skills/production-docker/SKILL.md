---
name: production-docker
description: "Docker production hardening — multi-stage builds, non-root users, distroless images, BuildKit secrets, layer optimization, security scanning, and compose best practices. Use this skill when the user is creating or modifying Dockerfiles, docker-compose files, .dockerignore, or containerizing applications. Triggers on any Dockerfile, docker-compose.yml, .dockerignore, or when user mentions Docker, containers, or images. Also trigger when user says /production docker."
---

# Production Docker Hardening

This skill transforms demo-quality Docker setups into production-grade container infrastructure. Every recommendation here comes from real incidents: breached containers running as root, 2GB images that take 8 minutes to deploy, secrets leaked into image layers. Follow this guide and none of that happens on your watch.

---

## 1. Multi-Stage Builds

Single-stage builds ship compilers, build tools, and source code to production. Multi-stage builds fix this by separating the build environment from the runtime environment.

**Python example (builder + distroless):**

```dockerfile
# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --no-compile --prefix=/install -r requirements.txt

FROM gcr.io/distroless/python3-debian12
COPY --from=builder /install /usr/local
COPY --chown=65532:65532 ./app /app
WORKDIR /app
USER 65532
ENTRYPOINT ["python", "-m", "app.main"]
```

**Node.js example (builder + slim runtime):**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-slim AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --production

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder --chown=node:node /build/dist ./dist
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/package.json ./
USER node
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
```

**Size impact:** A typical Python app goes from ~1.2GB (python:3.12 with build deps) to ~120MB (distroless). That is a 90%+ reduction.

**Rules:**
- The builder stage installs dependencies and compiles code
- The runtime stage copies only the final artifacts
- Never install build tools (gcc, make, git) in the runtime stage
- Use `COPY --from=builder` to cherry-pick what you need

---

## 2. Base Image Selection

Choose the smallest image that supports your runtime. Each option has tradeoffs:

| Image | Size | Shell | Package Manager | Use When |
|-------|------|-------|-----------------|----------|
| `gcr.io/distroless/...` | ~20-50MB | No | No | Production services, maximum security |
| `alpine:3.x` | ~7MB | Yes (ash) | apk | Need shell for debugging, musl is acceptable |
| `python:3.12-slim` / `node:22-slim` | ~150-200MB | Yes (bash) | apt | Need glibc compatibility, some native extensions |
| `ubuntu:24.04` | ~75MB | Yes (bash) | apt | Complex native dependency chains |

**Pinning rules:**
- Pin by digest for reproducible builds: `FROM python:3.12-slim@sha256:abc123...`
- Pin by minor version at minimum: `FROM python:3.12-slim`, never `FROM python:latest`
- Never use `latest` — it is a moving target that breaks builds silently
- Update digests on a schedule (monthly or via Dependabot/Renovate)

**Distroless advantages:**
- No shell means attackers who get code execution cannot spawn a shell
- No package manager means no installing tools post-exploitation
- Minimal filesystem reduces vulnerability surface to near zero
- CVE scan results are dramatically cleaner

---

## 3. Non-Root Execution

Running as root inside a container is the single most common Docker security mistake. If an attacker escapes the container with UID 0, they have root on the host.

**Distroless (use the built-in nonroot user):**

```dockerfile
USER 65532
```

**Debian/Ubuntu (create a dedicated user):**

```dockerfile
RUN groupadd --gid 10001 appuser && \
    useradd --uid 10001 --gid appuser --shell /bin/false --create-home appuser
USER appuser
```

**Alpine (create a dedicated user):**

```dockerfile
RUN addgroup -g 10001 -S appuser && \
    adduser -u 10001 -S -G appuser -s /bin/false appuser
USER appuser
```

**Rules:**
- Set `USER` as late as possible in the Dockerfile (after all installs and copies)
- Use `--chown` on COPY instructions to set correct ownership
- Ensure the app directory and any writable paths are owned by the non-root user
- If the app needs to bind to port 80/443, use a reverse proxy or set `CAP_NET_BIND_SERVICE` — do not run as root
- Verify at runtime: `docker exec <container> whoami` should never return `root`

---

## 4. BuildKit Secrets

Secrets (API keys, tokens, private repo credentials) must never appear in image layers. Anyone with `docker history` or `docker save` can extract them.

**The correct way — BuildKit secret mounts:**

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=pip_index_url \
    PIP_INDEX_URL=$(cat /run/secrets/pip_index_url) \
    pip install --no-cache-dir -r requirements.txt
```

Build command:

```bash
DOCKER_BUILDKIT=1 docker build --secret id=pip_index_url,src=.pip_credentials .
```

**For private git repos:**

```dockerfile
RUN --mount=type=ssh pip install git+ssh://git@github.com/org/private-repo.git
```

Build command:

```bash
docker build --ssh default .
```

**What NEVER to do:**
- `ARG MY_SECRET=...` — visible in `docker history`
- `ENV MY_SECRET=...` — visible in `docker inspect`
- `COPY .env /app/.env` — baked into a layer forever
- `COPY id_rsa /root/.ssh/` — private key in the image

**Rule:** If `docker history --no-trunc <image>` shows any secret value, the image is compromised and must be rebuilt.

---

## 5. Layer Optimization

Docker caches layers top-down. When a layer changes, all subsequent layers are invalidated. Order your Dockerfile to maximize cache hits.

**Optimal layer order:**

```dockerfile
# 1. Base image (changes rarely)
FROM python:3.12-slim AS builder

# 2. System dependencies (changes rarely)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 3. App dependencies (changes occasionally)
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --no-compile -r requirements.txt

# 4. Application code (changes frequently)
COPY . .
```

**Rules:**
- Copy dependency manifests (requirements.txt, package.json) before application code
- Install dependencies in a separate layer from code copying
- Combine related RUN commands with `&&` to reduce layer count
- Always clean up in the same layer: `apt-get install ... && rm -rf /var/lib/apt/lists/*`
- Use `--no-cache-dir` with pip to avoid caching wheels in the layer
- Use `--no-compile` with pip to skip .pyc generation in the builder

---

## 6. .dockerignore

Without `.dockerignore`, `COPY . .` sends everything to the Docker daemon — including .git (potentially hundreds of MB), .env (secrets), node_modules, and test fixtures.

**Mandatory exclusions:**

```
.git
.gitignore
.env
.env.*
*.pyc
__pycache__
.venv
venv
node_modules
.npm
.idea
.vscode
*.swp
*.swo
tests/
test/
docs/
*.md
!README.md
docker-compose*.yml
Dockerfile*
.dockerignore
.coverage
htmlcov/
.pytest_cache/
.mypy_cache/
.ruff_cache/
```

**Rules:**
- Every project with a Dockerfile MUST have a .dockerignore
- Start restrictive, add exceptions with `!` prefix as needed
- Test with: `docker build --no-cache .` and check context size in output
- Context size over 50MB usually means .dockerignore is missing entries

---

## 7. Health Checks

Without health checks, Docker (and orchestrators) have no way to know if your app is actually serving requests. A container can be "running" with a completely hung process.

**HTTP health check (preferred for web services):**

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
```

**For Node.js:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://localhost:3000/health').then(r => { if (!r.ok) process.exit(1) })"]
```

**For distroless (no curl/wget):**

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
```

**Tuning guidelines:**
- `--interval`: 30s for most services, 10s for critical path
- `--timeout`: 5s usually sufficient; increase for services with slow health endpoints
- `--start-period`: Time for the app to boot. Set this generously (migrations, model loading)
- `--retries`: 3 is standard. Fewer for fast-failing services

**Rules:**
- Every production Dockerfile must have a HEALTHCHECK
- The health endpoint must verify real functionality (DB connection, not just "200 OK")
- Do not use `curl` in distroless images (it does not exist)
- Use the exec form `CMD ["..."]` not shell form `CMD ...`

---

## 8. Security Scanning

Every image must be scanned before deployment. Trivy is the industry standard — it is fast, free, and catches CVEs in OS packages and language dependencies.

**Local scan:**

```bash
trivy image --severity HIGH,CRITICAL your-image:tag
```

**CI pipeline (fail the build on findings):**

```yaml
# GitHub Actions example
- name: Scan image with Trivy
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ${{ env.IMAGE }}
    format: table
    exit-code: 1
    severity: HIGH,CRITICAL
    ignore-unfixed: true
```

**Rules:**
- Scan in CI on every build — not just occasionally
- Set `--exit-code 1` so builds fail on HIGH/CRITICAL findings
- Use `--ignore-unfixed` to suppress CVEs with no available fix
- Pin the Trivy action/binary version for reproducible scans
- Scan both the builder stage and runtime stage if using multi-stage
- Maintain a `.trivyignore` file for accepted risks (with justification comments)

---

## 9. Compose Best Practices

Docker Compose for production requires explicit resource limits, health checks, and network isolation. The default "everything talks to everything" is a security problem.

**Service dependencies with health checks:**

```yaml
services:
  api:
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

**Resource limits (prevent runaway containers):**

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M
```

**Network isolation:**

```yaml
networks:
  frontend:
  backend:

services:
  api:
    networks: [frontend, backend]
  postgres:
    networks: [backend]  # Not accessible from frontend
```

**Rules:**
- Always set `mem_limit` / deploy resource limits — a memory leak should not take down the host
- Use `restart: unless-stopped` for production services
- Use named volumes for persistent data, never bind mounts in production
- Use `env_file` for environment variables, never hardcode secrets in compose files
- Pin image tags in compose, same as Dockerfiles
- Separate compose files for dev vs production: `docker-compose.yml` + `docker-compose.prod.yml`

---

## 10. Runtime Hardening

The image is only half the story. Runtime flags add defense-in-depth.

**Read-only filesystem:**

```yaml
services:
  api:
    read_only: true
    tmpfs:
      - /tmp
      - /app/tmp
```

**Drop capabilities:**

```yaml
services:
  api:
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE  # Only if binding to ports < 1024
```

**No new privileges:**

```yaml
services:
  api:
    security_opt:
      - no-new-privileges:true
```

**Docker run equivalent:**

```bash
docker run \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --user 65532 \
  your-image:tag
```

**Rules:**
- Start with `cap_drop: ALL`, add back only what is needed
- `no-new-privileges` prevents setuid binaries from escalating
- Read-only filesystem forces you to explicitly declare writable paths
- Use `tmpfs` for directories that need to be writable (tmp, cache, pid files)

---

## Anti-Patterns

These are the most common mistakes found in production Docker setups. Each one is a real incident waiting to happen.

| Anti-Pattern | Why It Is Bad | Fix |
|---|---|---|
| Running as root | Container escape = host root | `USER 65532` or dedicated user |
| `FROM python:latest` | Breaks builds unpredictably, unreproducible | Pin version + digest |
| `COPY . .` without .dockerignore | Sends .git, .env, node_modules to daemon | Add comprehensive .dockerignore |
| `ARG SECRET_KEY=...` | Visible in `docker history` | BuildKit `--mount=type=secret` |
| Single-stage build | Ships compilers, source code, build tools | Multi-stage: builder + runtime |
| Dev dependencies in prod | Larger image, more CVEs, larger attack surface | `--only=production` / separate requirements |
| No .dockerignore | Bloated context, potential secret leak | Always create .dockerignore |
| `pip install` without `--no-cache-dir` | Caches wheels in image layer, wasted space | Always use `--no-cache-dir` |
| `apt-get install` without cleanup | Package lists remain in layer | `&& rm -rf /var/lib/apt/lists/*` in same RUN |
| No HEALTHCHECK | Orchestrator cannot detect hung processes | Add HEALTHCHECK with proper tuning |
| Hardcoded ENV secrets in compose | Secrets in version control | Use `env_file` or Docker secrets |
| No resource limits | One container can OOM the entire host | Set `mem_limit` and `cpus` |
| Using `docker-compose` (v1) | Deprecated, missing features | Use `docker compose` (v2, plugin) |
| `EXPOSE` without binding to 0.0.0.0 | App binds to 127.0.0.1, unreachable | Bind app to `0.0.0.0` inside container |

---

## Quick Reference

**Build command (production):**

```bash
DOCKER_BUILDKIT=1 docker build \
  --target runtime \
  --tag myapp:$(git rev-parse --short HEAD) \
  --label org.opencontainers.image.revision=$(git rev-parse HEAD) \
  --label org.opencontainers.image.created=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  .
```

**Verify non-root:**

```bash
docker run --rm myapp:latest whoami
# Expected: nonroot or appuser, NEVER root
```

**Check image size:**

```bash
docker images myapp --format "{{.Repository}}:{{.Tag}} {{.Size}}"
```

**Scan for secrets in layers:**

```bash
docker history --no-trunc myapp:latest | grep -iE "(key|secret|password|token)"
```
