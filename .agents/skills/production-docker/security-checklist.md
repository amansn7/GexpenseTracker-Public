# Docker Security Checklist

A concise security checklist for production Docker images. Extracted from the production-docker skill.

## Container User

- [ ] Container runs as a non-root user (`USER 65532` for distroless, or a dedicated `appuser` with explicit UID/GID)
- [ ] `USER` directive is set as late as possible in the Dockerfile (after all installs and copies)
- [ ] `COPY --chown` used to set correct file ownership for the non-root user
- [ ] Verified at runtime: `docker exec <container> whoami` does not return `root`

## Base Image

- [ ] Minimal base image selected (distroless, alpine, or `-slim` variant -- not full Ubuntu/Debian unless required)
- [ ] Base image pinned by minor version at minimum (e.g., `python:3.12-slim`), never `FROM <image>:latest`
- [ ] Consider pinning by digest (`@sha256:...`) for fully reproducible builds
- [ ] Base image update schedule established (monthly, or via Dependabot/Renovate)

## Secrets in Layers

- [ ] No secrets passed via `ARG` (visible in `docker history`)
- [ ] No secrets set via `ENV` (visible in `docker inspect`)
- [ ] No `.env` files, private keys, or credentials copied into the image with `COPY`
- [ ] BuildKit secret mounts used for build-time secrets (`RUN --mount=type=secret,id=...`)
- [ ] SSH agent forwarding used for private git repos (`RUN --mount=type=ssh`)
- [ ] Verified clean: `docker history --no-trunc <image>` shows no secret values

## .dockerignore

- [ ] `.dockerignore` file exists in every project with a Dockerfile
- [ ] `.git` directory excluded
- [ ] `.env` and `.env.*` files excluded
- [ ] `node_modules`, `.venv`, `venv`, `__pycache__` excluded
- [ ] Test directories, docs, IDE configs excluded
- [ ] Build context size verified under 50 MB (`docker build --no-cache .` and check output)

## Image Tagging

- [ ] Images tagged with git SHA or semantic version, never `:latest` for production
- [ ] OCI labels applied (`org.opencontainers.image.revision`, `org.opencontainers.image.created`)

## Health Checks

- [ ] `HEALTHCHECK` directive present in the Dockerfile
- [ ] Health endpoint verifies real functionality (database connection, not just 200 OK)
- [ ] Exec form used for the command (`CMD ["..."]`, not shell form)
- [ ] `--start-period` set generously enough for application boot time (migrations, model loading)
- [ ] No `curl` usage in distroless images (use the language runtime instead)

## Read-Only Filesystem

- [ ] Container runs with `read_only: true` (or `--read-only` flag)
- [ ] Writable paths explicitly declared via `tmpfs` mounts (`/tmp`, cache dirs, pid files)

## Capabilities and Privileges

- [ ] All capabilities dropped (`cap_drop: ALL`)
- [ ] Only required capabilities added back (e.g., `NET_BIND_SERVICE` if binding to ports below 1024)
- [ ] `no-new-privileges` security option set (`security_opt: [no-new-privileges:true]`)

## Multi-Stage Builds

- [ ] Multi-stage build used to separate builder from runtime
- [ ] No build tools (gcc, make, git) present in the runtime stage
- [ ] No dev dependencies in the production image
- [ ] Only final artifacts copied via `COPY --from=builder`

## Multi-Architecture Builds

- [ ] Images built for target architectures (e.g., `linux/amd64`, `linux/arm64`) if deploying across platforms
- [ ] `docker buildx` used for cross-platform builds

## Image Scanning

- [ ] Trivy (or equivalent) scans run on every build in CI
- [ ] Build fails on HIGH and CRITICAL severity findings (`--exit-code 1 --severity HIGH,CRITICAL`)
- [ ] `--ignore-unfixed` used to suppress CVEs with no available patch
- [ ] Both builder and runtime stages scanned for multi-stage builds
- [ ] `.trivyignore` file maintained for accepted risks (with justification comments)
- [ ] Trivy action/binary version pinned for reproducible scans
