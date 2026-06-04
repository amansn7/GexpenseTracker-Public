import structlog
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings

logger = structlog.get_logger()


def _build_engine_kwargs() -> dict:
    """Build engine kwargs, skipping pool settings for SQLite."""
    kwargs: dict = {"echo": False}
    if not settings.DATABASE_URL.startswith("sqlite"):
        kwargs.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
            pool_pre_ping=settings.DB_POOL_PRE_PING,
        )
    return kwargs


engine = create_async_engine(settings.DATABASE_URL, **_build_engine_kwargs())
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_worker_engine = None
_worker_session_local = None


def _build_worker_engine_kwargs() -> dict:
    kwargs: dict = {"echo": False}
    if not settings.DATABASE_URL.startswith("sqlite"):
        kwargs.update(
            pool_size=5,
            max_overflow=10,
            pool_timeout=60,
            pool_recycle=1800,
            pool_pre_ping=True,
        )
    return kwargs


def get_worker_engine():
    global _worker_engine
    if _worker_engine is None:
        _worker_engine = create_async_engine(settings.DATABASE_URL, **_build_worker_engine_kwargs())
    return _worker_engine


def get_worker_session():
    global _worker_session_local
    if _worker_session_local is None:
        _worker_session_local = async_sessionmaker(get_worker_engine(), expire_on_commit=False)
    return _worker_session_local


async def log_pool_metrics():
    """Log connection pool status. Warn if near exhaustion."""
    try:
        pool = engine.pool
        if hasattr(pool, "size") and hasattr(pool, "overflow"):
            checked_in = pool.checkedin()
            checked_out = pool.checkedout()
            total = pool.total()
            overflow = pool.overflow()

            logger.info(
                "pool_status",
                checked_in=checked_in,
                checked_out=checked_out,
                total=total,
                overflow=overflow,
                pool_size=settings.DB_POOL_SIZE,
                max_overflow=settings.DB_MAX_OVERFLOW,
                utilization_pct=round((checked_out / (settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW)) * 100, 1) if (settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW) > 0 else 0,
            )

            if checked_out >= (settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW) * 0.8:
                logger.warning(
                    "pool_near_exhaustion",
                    checked_out=checked_out,
                    pool_size=settings.DB_POOL_SIZE,
                    max_overflow=settings.DB_MAX_OVERFLOW,
                )
    except Exception as exc:
        logger.error("pool_metrics_error", error=str(exc))


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
