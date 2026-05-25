import os

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Prevent APScheduler from starting during tests
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("DEV_MODE", "true")
os.environ.setdefault("FERNET_KEY", "test-fernet-key-for-tests-only-not-for-production")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-only-not-for-production")

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
os.environ.setdefault("DATABASE_URL", TEST_DATABASE_URL)


@pytest_asyncio.fixture
async def db_session():
    from app.models import Base

    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def mock_user(db_session):
    """Create and return a test user in the db_session, and override get_current_user."""
    from app.auth_deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models import User, UserProfile, UserRole, UserSettings, UserStatus

    user = User(
        email="testuser@example.com",
        role=UserRole.owner,
        status=UserStatus.active,
        onboarding_complete=True,
    )
    db_session.add(user)
    await db_session.flush()
    db_session.add(UserSettings(user_id=user.id))
    db_session.add(
        UserProfile(
            user_id=user.id,
            full_name="Test User",
            default_currency="INR",
            timezone="Asia/Kolkata",
        )
    )
    await db_session.commit()
    await db_session.refresh(user)

    async def _override():
        return user

    async def override_db():
        yield db_session

    app.dependency_overrides[get_current_user] = _override
    app.dependency_overrides[get_db] = override_db
    yield user
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_db, None)
