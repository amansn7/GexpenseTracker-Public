#!/usr/bin/env python3
"""Create a test user + session in test_e2e.db for Playwright a11y tests.
Idempotent: removes any existing user with the test email before creating.
Uses SQLAlchemy to ensure the schema matches the app's models exactly."""

import asyncio
import os
import sys
import uuid
from datetime import UTC, datetime, timedelta

PROJECT_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..")
)

os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.path.join(PROJECT_ROOT, 'test_e2e.db')}"

sys.path.insert(0, PROJECT_ROOT)

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.models import Base, Session, User, UserProfile, UserRole, UserSettings, UserStatus

TEST_EMAIL = "a11y-test-user@example.com"


async def main():
    db_url = f"sqlite+aiosqlite:///{os.path.join(PROJECT_ROOT, 'test_e2e.db')}"
    engine = create_async_engine(db_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as db:
        existing = (
            await db.execute(
                text("SELECT id FROM users WHERE email = :email"), {"email": TEST_EMAIL}
            )
        ).scalar()
        if existing:
            await db.execute(text("DELETE FROM sessions WHERE user_id = :uid"), {"uid": existing})
            await db.execute(text("DELETE FROM user_settings WHERE user_id = :uid"), {"uid": existing})
            await db.execute(text("DELETE FROM user_profiles WHERE user_id = :uid"), {"uid": existing})
            await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": existing})
            await db.commit()

        user = User(
            id=str(uuid.uuid4()),
            email=TEST_EMAIL,
            role=UserRole.owner,
            status=UserStatus.active,
            onboarding_complete=True,
        )
        db.add(user)
        await db.flush()

        db.add(UserSettings(user_id=user.id))
        db.add(UserProfile(user_id=user.id, full_name="A11y Test User"))

        token = os.urandom(32)
        db.add(
            Session(
                user_id=user.id,
                token=token,
                expires_at=datetime.now(UTC) + timedelta(days=30),
                last_rotated_at=datetime.now(UTC),
            )
        )

        await db.commit()

    await engine.dispose()
    print(token.hex())


if __name__ == "__main__":
    asyncio.run(main())
