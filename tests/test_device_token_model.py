"""Tests for DeviceToken and RefreshTokenBlacklist models."""
import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-chars!!")

from app.models import Base, DeviceToken, RefreshTokenBlacklist, User, UserRole, UserStatus

TEST_DB = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def user(db):
    u = User(email="dev@test.com", role=UserRole.owner, status=UserStatus.active, onboarding_complete=True)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest.mark.asyncio
async def test_device_token_create(db, user):
    dt = DeviceToken(user_id=user.id, token="apns-abc123", platform="ios")
    db.add(dt)
    await db.commit()
    await db.refresh(dt)
    assert dt.id is not None
    assert dt.platform == "ios"
    assert dt.created_at is not None


@pytest.mark.asyncio
async def test_device_token_unique_token(db, user):
    from sqlalchemy.exc import IntegrityError

    db.add(DeviceToken(user_id=user.id, token="dup-token", platform="android"))
    await db.commit()
    db.add(DeviceToken(user_id=user.id, token="dup-token", platform="android"))
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_refresh_token_blacklist_create(db, user):
    entry = RefreshTokenBlacklist(user_id=user.id, jti="some-unique-jti")
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    assert entry.id is not None
    assert entry.jti == "some-unique-jti"
    assert entry.blacklisted_at is not None
