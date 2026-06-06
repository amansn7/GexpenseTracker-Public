"""
Production PostgreSQL Connection Pooling Templates

Complete configurations for asyncpg, SQLAlchemy async engine, PgBouncer,
connection health monitoring, and pool exhaustion handling.

Extracted from production-postgres SKILL.md Section 2.
"""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import AsyncIterator

import asyncpg
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. asyncpg Pool Setup
# ---------------------------------------------------------------------------


@dataclass
class AsyncpgPoolConfig:
    """Configuration for asyncpg connection pool.

    Defaults follow the recommendations in SKILL.md Section 2:
    - min_size=5, max_size=20 for typical OLTP workloads
    - max_inactive_connection_lifetime=300s to recycle idle connections
    - command_timeout=30s to kill runaway queries
    """

    dsn: str
    min_size: int = 5
    max_size: int = 20
    max_inactive_connection_lifetime: float = 300.0
    command_timeout: float = 30.0
    # Per-database safety nets (mirror SET on the database)
    statement_timeout_ms: int = 30_000
    idle_in_transaction_timeout_ms: int = 30_000


async def create_asyncpg_pool(config: AsyncpgPoolConfig) -> asyncpg.Pool:
    """Create and return a configured asyncpg connection pool.

    Sets session-level statement_timeout and idle_in_transaction_session_timeout
    on every new connection via the init callback.
    """

    async def _init_connection(conn: asyncpg.Connection) -> None:
        await conn.execute(
            f"SET statement_timeout = '{config.statement_timeout_ms}'"
        )
        await conn.execute(
            f"SET idle_in_transaction_session_timeout = "
            f"'{config.idle_in_transaction_timeout_ms}'"
        )

    pool = await asyncpg.create_pool(
        dsn=config.dsn,
        min_size=config.min_size,
        max_size=config.max_size,
        max_inactive_connection_lifetime=config.max_inactive_connection_lifetime,
        command_timeout=config.command_timeout,
        init=_init_connection,
    )
    logger.info(
        "asyncpg pool created (min=%d, max=%d)", config.min_size, config.max_size
    )
    return pool


# ---------------------------------------------------------------------------
# 2. SQLAlchemy Async Engine Configuration
# ---------------------------------------------------------------------------


@dataclass
class SQLAlchemyAsyncConfig:
    """Configuration for SQLAlchemy async engine.

    Mirrors the synchronous recommendations from SKILL.md Section 2
    but uses the asyncpg driver (postgresql+asyncpg).

    pool_pre_ping=True catches stale connections after PgBouncer restarts
    or network blips. pool_recycle=3600 rotates connections hourly.
    """

    database_url: str  # postgresql+asyncpg://user:pass@host/dbname
    pool_size: int = 10
    max_overflow: int = 5
    pool_pre_ping: bool = True
    pool_recycle: int = 3600
    pool_timeout: int = 30
    echo: bool = False


def create_async_engine_from_config(config: SQLAlchemyAsyncConfig) -> AsyncEngine:
    """Create a production-configured SQLAlchemy async engine."""
    engine = create_async_engine(
        config.database_url,
        pool_size=config.pool_size,
        max_overflow=config.max_overflow,
        pool_pre_ping=config.pool_pre_ping,
        pool_recycle=config.pool_recycle,
        pool_timeout=config.pool_timeout,
        echo=config.echo,
    )
    logger.info(
        "SQLAlchemy async engine created (pool_size=%d, max_overflow=%d)",
        config.pool_size,
        config.max_overflow,
    )
    return engine


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create a session factory bound to the given engine."""
    return async_sessionmaker(engine, expire_on_commit=False)


@asynccontextmanager
async def get_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Provide a transactional session scope.

    Commits on success, rolls back on exception.
    """
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# 3. PgBouncer Configuration Snippet
# ---------------------------------------------------------------------------

PGBOUNCER_INI_TEMPLATE = """\
;; pgbouncer.ini -- production configuration
;; Use transaction mode for web applications (SKILL.md Section 2).
;; Session-scoped features (prepared statements, advisory locks,
;; SET commands, LISTEN/NOTIFY, temp tables) do NOT work in
;; transaction mode unless PgBouncer >= 1.21 with
;; max_prepared_statements enabled.

[databases]
{db_name} = host={db_host} port={db_port} dbname={db_name}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt

;; Pool mode: transaction is the default recommendation for OLTP.
pool_mode = transaction

;; Pool sizing: start at 20-30 for OLTP.
;; Monitor cl_waiting in SHOW POOLS -- if consistently > 0, increase.
;; PostgreSQL degrades past ~100-200 active connections.
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3

;; Client limits
max_client_conn = 1000

;; Timeouts
server_idle_timeout = 300
server_connect_timeout = 5
query_timeout = 30
client_idle_timeout = 600

;; Logging
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1

;; PgBouncer 1.21+: prepared statement support in transaction mode
;; Uncomment if your application uses prepared statements.
; max_prepared_statements = 100
"""


def render_pgbouncer_config(
    db_name: str = "myapp",
    db_host: str = "localhost",
    db_port: int = 5432,
) -> str:
    """Render a production PgBouncer configuration file."""
    return PGBOUNCER_INI_TEMPLATE.format(
        db_name=db_name, db_host=db_host, db_port=db_port
    )


# ---------------------------------------------------------------------------
# 4. Connection Health Monitoring
# ---------------------------------------------------------------------------


@dataclass
class HealthStatus:
    healthy: bool
    latency_ms: float
    pool_size: int
    pool_free: int
    pool_used: int
    details: str = ""


async def check_asyncpg_pool_health(pool: asyncpg.Pool) -> HealthStatus:
    """Check asyncpg pool health by executing a simple query and
    reporting pool utilization metrics.

    Returns a HealthStatus with latency, pool size, and free/used counts.
    """
    start = time.monotonic()
    try:
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        latency_ms = (time.monotonic() - start) * 1000

        size = pool.get_size()
        free = pool.get_idle_size()
        used = size - free

        return HealthStatus(
            healthy=True,
            latency_ms=round(latency_ms, 2),
            pool_size=size,
            pool_free=free,
            pool_used=used,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        return HealthStatus(
            healthy=False,
            latency_ms=round(latency_ms, 2),
            pool_size=pool.get_size(),
            pool_free=pool.get_idle_size(),
            pool_used=pool.get_size() - pool.get_idle_size(),
            details=str(exc),
        )


async def check_sqlalchemy_engine_health(engine: AsyncEngine) -> HealthStatus:
    """Check SQLAlchemy async engine health.

    Uses pool status to report utilization and runs a lightweight query.
    """
    pool = engine.pool
    start = time.monotonic()
    try:
        async with engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        latency_ms = (time.monotonic() - start) * 1000

        size = pool.size()
        checked_out = pool.checkedout()
        overflow = pool.overflow()

        return HealthStatus(
            healthy=True,
            latency_ms=round(latency_ms, 2),
            pool_size=size + overflow,
            pool_free=size - checked_out,
            pool_used=checked_out + overflow,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - start) * 1000
        return HealthStatus(
            healthy=False,
            latency_ms=round(latency_ms, 2),
            pool_size=0,
            pool_free=0,
            pool_used=0,
            details=str(exc),
        )


# ---------------------------------------------------------------------------
# 5. Pool Exhaustion Handling
# ---------------------------------------------------------------------------


@dataclass
class PoolExhaustionConfig:
    """Thresholds and behavior for pool exhaustion detection."""

    # Percentage of pool in use that triggers a warning (0.0 - 1.0).
    warn_threshold: float = 0.8
    # Percentage of pool in use that triggers critical alert.
    critical_threshold: float = 0.95
    # Maximum seconds to wait for a connection before giving up.
    acquire_timeout: float = 5.0
    # How many times to retry on pool exhaustion before raising.
    max_retries: int = 2
    # Backoff between retries in seconds.
    retry_backoff: float = 0.5


class PoolExhaustionError(Exception):
    """Raised when the connection pool is exhausted after retries."""


@asynccontextmanager
async def acquire_with_exhaustion_handling(
    pool: asyncpg.Pool,
    config: PoolExhaustionConfig | None = None,
) -> AsyncIterator[asyncpg.Connection]:
    """Acquire a connection from an asyncpg pool with exhaustion handling.

    - Logs warnings when pool utilization exceeds warn_threshold.
    - Retries with backoff when the pool is fully exhausted.
    - Raises PoolExhaustionError after max_retries failures.
    """
    if config is None:
        config = PoolExhaustionConfig()

    # Check utilization before acquiring
    size = pool.get_size()
    free = pool.get_idle_size()
    if size > 0:
        utilization = (size - free) / size
        if utilization >= config.critical_threshold:
            logger.critical(
                "Pool near exhaustion: %d/%d connections in use (%.0f%%)",
                size - free,
                size,
                utilization * 100,
            )
        elif utilization >= config.warn_threshold:
            logger.warning(
                "Pool utilization high: %d/%d connections in use (%.0f%%)",
                size - free,
                size,
                utilization * 100,
            )

    last_error: Exception | None = None
    for attempt in range(config.max_retries + 1):
        try:
            async with asyncio.timeout(config.acquire_timeout):
                conn = await pool.acquire()
            try:
                yield conn
            finally:
                await pool.release(conn)
            return
        except asyncio.TimeoutError as exc:
            last_error = exc
            if attempt < config.max_retries:
                wait = config.retry_backoff * (attempt + 1)
                logger.warning(
                    "Pool exhausted, retrying in %.1fs (attempt %d/%d)",
                    wait,
                    attempt + 1,
                    config.max_retries,
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    "Pool exhausted after %d retries. Pool size=%d, free=%d",
                    config.max_retries,
                    pool.get_size(),
                    pool.get_idle_size(),
                )

    raise PoolExhaustionError(
        f"Could not acquire connection after {config.max_retries} retries. "
        f"Pool size={pool.get_size()}, free={pool.get_idle_size()}"
    ) from last_error


# ---------------------------------------------------------------------------
# 6. FastAPI Integration Example
# ---------------------------------------------------------------------------


@dataclass
class DatabaseComponents:
    """Holds all database components for a FastAPI application lifespan."""

    asyncpg_pool: asyncpg.Pool | None = None
    engine: AsyncEngine | None = None
    session_factory: async_sessionmaker[AsyncSession] | None = None


@asynccontextmanager
async def database_lifespan(
    asyncpg_config: AsyncpgPoolConfig | None = None,
    sqlalchemy_config: SQLAlchemyAsyncConfig | None = None,
) -> AsyncIterator[DatabaseComponents]:
    """Context manager for FastAPI lifespan that sets up and tears down
    database connections.

    Usage with FastAPI:

        from contextlib import asynccontextmanager
        from fastapi import FastAPI

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            async with database_lifespan(
                sqlalchemy_config=SQLAlchemyAsyncConfig(
                    database_url="postgresql+asyncpg://user:pass@localhost/myapp"
                )
            ) as db:
                app.state.db = db
                yield

        app = FastAPI(lifespan=lifespan)
    """
    components = DatabaseComponents()

    try:
        if asyncpg_config is not None:
            components.asyncpg_pool = await create_asyncpg_pool(asyncpg_config)

        if sqlalchemy_config is not None:
            components.engine = create_async_engine_from_config(sqlalchemy_config)
            components.session_factory = create_session_factory(components.engine)

        yield components

    finally:
        if components.asyncpg_pool is not None:
            await components.asyncpg_pool.close()
            logger.info("asyncpg pool closed")

        if components.engine is not None:
            await components.engine.dispose()
            logger.info("SQLAlchemy engine disposed")
