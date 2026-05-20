from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.config import settings


def _build_engine_kwargs() -> dict:
    """Build engine kwargs, skipping pool settings for SQLite."""
    kwargs: dict = {"echo": False}
    if not settings.DATABASE_URL.startswith("sqlite"):
        kwargs.update(
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_recycle=settings.DB_POOL_RECYCLE,
        )
    return kwargs


engine = create_async_engine(settings.DATABASE_URL, **_build_engine_kwargs())
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
