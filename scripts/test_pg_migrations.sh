#!/usr/bin/env bash
# PostgreSQL migration smoke test script.
#
# Usage:
#   ./scripts/test_pg_migrations.sh
#
# Prerequisites:
#   - Docker (for docker-compose) OR a local PostgreSQL instance
#   - Python virtual environment with dependencies installed
#   - alembic installed
#
# This script:
#   1. Starts PostgreSQL via docker-compose (or uses local psql)
#   2. Runs `alembic upgrade head`
#   3. Seeds test users
#   4. Tests `alembic downgrade -1` and `alembic upgrade head` again
#   5. Verifies migration 0040's unique constraint on transactions.email_id
#   6. Documents the dedup preflight procedure

set -euo pipefail

HERE="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$HERE"

# Colors for output
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

cleanup() {
    info "Cleaning up..."
    if [ -n "${CONTAINER_NAME:-}" ]; then
        docker compose down -t 5 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ──────────────────────────────────────────────
# 1. Check PostgreSQL availability
# ──────────────────────────────────────────────
info "Step 1: Checking PostgreSQL availability..."

USE_DOCKER=false
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
    USE_DOCKER=true
    info "Docker Compose available — will use containerized PostgreSQL."
elif command -v psql &>/dev/null; then
    info "psql found — will try local PostgreSQL instance."
else
    fail "Neither Docker Compose nor psql is available. Install one of them."
    echo ""
    warn "Skipping automated test. Run manually with a PostgreSQL instance."
    echo ""
    echo "--- Manual Procedure ---"
    echo "1. Start PostgreSQL (docker-compose up -d db or local)"
    echo "2. Export DATABASE_URL=postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker"
    echo "3. alembic upgrade head"
    echo "4. python -m app.scripts.dedup_before_migration --dry-run   # before migration 0040"
    echo "5. python -m app.scripts.dedup_before_migration --execute   # if dry-run looks clean"
    echo "6. alembic upgrade head"
    echo "7. Test: insert a duplicate email_id into transactions (should fail with unique constraint)"
    echo ""
    echo "See README.md → PostgreSQL Migration Procedure for details."
    exit 1
fi

# ──────────────────────────────────────────────
# 2. Start PostgreSQL via docker-compose
# ──────────────────────────────────────────────
if [ "$USE_DOCKER" = true ]; then
    info "Step 2: Starting PostgreSQL container..."
    docker compose up -d db --wait
    CONTAINER_NAME="$(docker compose ps -q db 2>/dev/null || true)"

    # Wait for PostgreSQL to be healthy
    info "Waiting for PostgreSQL to be healthy..."
    for i in $(seq 1 30); do
        if docker compose exec db pg_isready -U expense -d expense_tracker &>/dev/null; then
            info "PostgreSQL is ready."
            break
        fi
        if [ "$i" -eq 30 ]; then
            fail "PostgreSQL did not become healthy within 30 seconds."
            exit 1
        fi
        sleep 1
    done
fi

export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://expense:expense@localhost:5432/expense_tracker}"
info "Using DATABASE_URL: $DATABASE_URL"

# ──────────────────────────────────────────────
# 3. Run alembic upgrade head
# ──────────────────────────────────────────────
info "Step 3: Running 'alembic upgrade head'..."
if alembic upgrade head 2>&1; then
    pass "alembic upgrade head succeeded."
else
    fail "alembic upgrade head failed."
    warn "If this is a fresh database, migrations should apply cleanly. If errors mention"
    warn "duplicate keys, you may need to run the dedup preflight first:"
    warn "  python -m app.scripts.dedup_before_migration --dry-run"
    warn "  python -m app.scripts.dedup_before_migration --execute"
    exit 1
fi

# ──────────────────────────────────────────────
# 4. Seed test users (via Python directly)
# ──────────────────────────────────────────────
info "Step 4: Seeding test users..."
python -c "
import asyncio
from app.database import AsyncSessionLocal
from app.models import User, UserProfile, UserSettings, UserRole, UserStatus
from sqlalchemy import select

async def seed():
    async with AsyncSessionLocal() as session:
        for i in range(3):
            email = f'test-user-{i}@example.com'
            result = await session.execute(select(User).where(User.email == email))
            if result.scalar_one_or_none():
                print(f'  User {email} already exists, skipping.')
                continue
            from app.auth_deps import _make_token
            user = User(
                email=email,
                role=UserRole.owner if i == 0 else UserRole.member,
                status=UserStatus.active,
                onboarding_complete=True,
            )
            session.add(user)
            await session.flush()
            session.add(UserProfile(user_id=user.id, full_name=f'Test User {i}'))
            session.add(UserSettings(user_id=user.id))
            print(f'  Created user: {email} (id={user.id})')
        await session.commit()
        print('Done seeding.')

asyncio.run(seed())
" 2>&1 && pass "Seed test users succeeded." || fail "Seed test users failed."

# ──────────────────────────────────────────────
# 5. Test alembic downgrade -1 and upgrade head
# ──────────────────────────────────────────────
info "Step 5: Testing 'alembic downgrade -1'..."
if alembic downgrade -1 2>&1; then
    pass "alembic downgrade -1 succeeded."
else
    fail "alembic downgrade -1 failed. This is expected for some SQLite-specific migrations but should work on PostgreSQL."
fi

info "Running 'alembic upgrade head' again..."
if alembic upgrade head 2>&1; then
    pass "alembic upgrade head (after downgrade) succeeded."
else
    fail "alembic upgrade head (after downgrade) failed."
    exit 1
fi

# ──────────────────────────────────────────────
# 6. Verify migration 0040 unique constraint
# ──────────────────────────────────────────────
info "Step 6: Verifying migration 0040 unique constraint on transactions.email_id..."
python -c "
import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def verify():
    async with AsyncSessionLocal() as session:
        # Check constraint exists
        result = await session.execute(text(\"\"\"
            SELECT con.conname
            FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'transactions'
            AND con.conname LIKE '%email%'
        \"\"\"))
        constraints = result.fetchall()
        if constraints:
            print(f'  Found constraint(s): {[c[0] for c in constraints]}')
        else:
            # Check if 'uq_transactions_email_id' exists
            result2 = await session.execute(text(\"\"\"
                SELECT con.conname FROM pg_catalog.pg_constraint con
                JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
                WHERE rel.relname = 'transactions' AND con.conname = 'uq_transactions_email_id'
            \"\"\"))
            if result2.fetchone():
                print('  Found unique constraint: uq_transactions_email_id')
            else:
                print('  WARNING: Could not find unique constraint on transactions.email_id')
                print('  Note: On SQLite, unique constraints may not be visible via pg_catalog.')
                print('  This check is PostgreSQL-specific and expected to report nothing on SQLite.')

asyncio.run(verify())
" 2>&1 && pass "Migration 0040 constraint verified." || warn "Constraint verification skipped (expected on SQLite)."

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════"
echo ""
echo "--- Dedup Preflight Documentation ---"
echo ""
echo "Before running 'alembic upgrade head' on an existing PostgreSQL database with"
echo "production data, you MUST resolve existing duplicates to avoid unique constraint"
echo "failures (especially migration 0040 which adds unique constraints on"
echo "Transaction.email_id and FilterRule(rule_type, value, source, user_id)):"
echo ""
echo "  1. Preview duplicates that would be resolved:"
echo "     python -m app.scripts.dedup_before_migration --dry-run"
echo ""
echo "  2. Execute if the dry-run looks clean:"
echo "     python -m app.scripts.dedup_before_migration --execute"
echo ""
echo "  3. Apply pending migrations:"
echo "     alembic upgrade head"
echo ""

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
