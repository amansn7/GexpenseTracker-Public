#!/bin/sh
set -e

PORT="${PORT:-8000}"

# Skip TCP wait on Railway (managed Postgres) or Local mode (SQLite)
if [ -z "${RAILWAY_ENVIRONMENT}" ] && [ "${LOCAL_MODE}" != "true" ]; then
  DB_HOST="${DB_HOST:-db}"
  DB_PORT="${DB_PORT:-5432}"
  echo "Waiting for database at ${DB_HOST}:${DB_PORT}..."
  until python -c "
import socket, sys
try:
    s = socket.create_connection(('${DB_HOST}', ${DB_PORT}), timeout=2)
    s.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
    echo "  db not ready, retrying in 1s..."
    sleep 1
  done
fi

echo "Running migrations..."
alembic upgrade head
echo "Starting app..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
