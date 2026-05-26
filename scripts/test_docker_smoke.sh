#!/usr/bin/env bash
# Docker image smoke test script.
#
# Usage:
#   ./scripts/test_docker_smoke.sh
#
# Tests:
#   1. Builds the Docker image
#   2. Runs a container with SQLite
#   3. Waits for /health to respond 200
#   4. Tests a simple API call
#   5. Cleans up

set -euo pipefail

HERE="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$HERE"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Check prerequisites
if ! command -v docker &>/dev/null; then
    fail "Docker is not installed."
    exit 1
fi

IMAGE_NAME="${IMAGE_NAME:-moneyflow-test}"
CONTAINER_NAME="${CONTAINER_NAME:-moneyflow-smoke}"
HOST_PORT="${HOST_PORT:-8000}"

SECRET_KEY="${SECRET_KEY:-test-secret-key-for-smoke-test-min-32-chars!!}"
FERNET_KEY="${FERNET_KEY:-dGVzdC1mZXJuZXQta2V5LWZvci1zbW9rZS10ZXN0LW5vdC1iYXNlNjQ=}"

cleanup() {
    info "Cleaning up..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    docker rmi "$IMAGE_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# ──────────────────────────────────────────────
# 1. Build the Docker image
# ──────────────────────────────────────────────
info "Step 1: Building Docker image '${IMAGE_NAME}'..."
if docker build -t "$IMAGE_NAME" . 2>&1; then
    pass "Docker image built successfully."
else
    fail "Docker image build failed."
    exit 1
fi

# ──────────────────────────────────────────────
# 2. Run a container with SQLite
# ──────────────────────────────────────────────
info "Step 2: Starting container with SQLite..."
docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${HOST_PORT}:8000" \
    -e "DATABASE_URL=sqlite+aiosqlite:///./data/test.db" \
    -e "SECRET_KEY=${SECRET_KEY}" \
    -e "FERNET_KEY=${FERNET_KEY}" \
    -e "GOOGLE_CLIENT_ID=test" \
    -e "GOOGLE_CLIENT_SECRET=test" \
    "$IMAGE_NAME" 2>&1

# Give the container a moment to start
sleep 5

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    pass "Container is running."
else
    fail "Container failed to start."
    docker logs "$CONTAINER_NAME" 2>&1 || true
    exit 1
fi

# ──────────────────────────────────────────────
# 3. Wait for /health to return 200
# ──────────────────────────────────────────────
info "Step 3: Waiting for /health endpoint..."
for i in $(seq 1 30); do
    if curl -sf "http://localhost:${HOST_PORT}/health" >/dev/null 2>&1; then
        pass "/health returned 200."
        break
    fi
    if [ "$i" -eq 30 ]; then
        fail "/health did not respond within 30 seconds."
        docker logs "$CONTAINER_NAME" 2>&1 | tail -30 || true
        exit 1
    fi
    sleep 1
done

# Also test the detailed health endpoint
if curl -sf "http://localhost:${HOST_PORT}/health/ready" >/dev/null 2>&1; then
    pass "/health/ready returned 200."
else
    warn "/health/ready did not respond (expected if auth is required)."
fi

# ──────────────────────────────────────────────
# 4. Test a simple API call
# ──────────────────────────────────────────────
info "Step 4: Testing API endpoints..."

# Health endpoint should return JSON
HEALTH_JSON=$(curl -s "http://localhost:${HOST_PORT}/health")
if echo "$HEALTH_JSON" | python3 -c "import sys,json; json.load(sys.stdin); print('valid JSON')" 2>/dev/null; then
    pass "/health returns valid JSON: $(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','?'))")"
else
    fail "/health did not return valid JSON."
fi

# OpenAPI docs should be accessible
if curl -sf "http://localhost:${HOST_PORT}/docs" >/dev/null 2>&1; then
    pass "/docs (OpenAPI) is accessible."
else
    warn "/docs is not accessible (acceptable if behind auth)."
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════"

# Capture logs for debugging
docker logs "$CONTAINER_NAME" 2>&1 | tail -20 || true

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
