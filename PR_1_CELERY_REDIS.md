# PR #1: Add Celery + Redis for Task Queue

## Summary

This PR replaces the **in-memory task queue** with **Celery + Redis** to enable:
- **Task persistence** (survives restarts)
- **Horizontal scaling** (multiple workers)
- **Better reliability** (retries, monitoring)

## Changes

### 1. Updated `app/workers/queue.py`
- Replaced `TaskQueue` with Celery app
- Added Celery task decorators for `sync` and `fetch_range`
- Removed in-memory idempotency (handled by Celery)

### 2. Updated `app/scheduler.py`
- Replaced `task_queue.enqueue()` with Celery `delay()`
- Removed idempotency cleanup job (handled by Celery)

### 3. Updated `docker-compose.yml`
- Added Redis service
- Updated `app` service to depend on Redis

### 4. Updated `requirements.txt`
- Added `celery`, `redis`, `flower` (for monitoring)

### 5. Updated `app/main.py`
- Added Celery worker startup in `lifespan`

## Testing

### Local Testing
1. Start services:
   ```bash
   docker-compose up --build
   ```
2. Trigger a sync:
   ```bash
   curl -X POST http://localhost:8000/api/sync/trigger -H "Authorization: Bearer YOUR_TOKEN"
   ```
3. Monitor Celery tasks:
   ```bash
   celery -A app.workers.queue flower --port=5555
   ```
   Visit `http://localhost:5555` to see active tasks.

### CI Testing
- The CI pipeline will automatically test Celery tasks using the Redis service.

## Migration Notes

### Breaking Changes
- **None**: The API remains unchanged. This is a **drop-in replacement** for the in-memory queue.

### Deprecations
- The in-memory `TaskQueue` is **deprecated** and will be removed in a future PR.

### Upgrade Path
1. Deploy Redis
2. Deploy updated `app` service
3. Monitor Celery tasks via Flower

## Checklist

- [x] Replace in-memory queue with Celery + Redis
- [x] Update scheduler to use Celery tasks
- [x] Add Redis to `docker-compose.yml`
- [x] Add Celery dependencies to `requirements.txt`
- [x] Test locally with `docker-compose`
- [x] Update CI to include Redis service
- [x] Add monitoring with Flower