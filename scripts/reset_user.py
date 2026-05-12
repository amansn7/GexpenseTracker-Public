"""
Reset a user's data back to first-time-onboarding state.

Keeps: user row (credentials), system classification rules
Clears: all transactions, emails, connected accounts, settings, AI services, etc.

Usage:
  DATABASE_URL=postgresql+asyncpg://... python scripts/reset_user.py <email>
  # or just run locally if .env is set up
"""
import asyncio
import sys
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Try loading from app config; fall back to env var
try:
    from app.config import settings
    DB_URL = settings.DATABASE_URL
except Exception:
    import os
    DB_URL = os.environ["DATABASE_URL"]


async def reset_user(email: str):
    engine = create_async_engine(DB_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Find user
        result = await session.execute(text("SELECT id, email FROM users WHERE email = :email"), {"email": email})
        row = result.fetchone()
        if not row:
            print(f"No user found with email: {email}")
            return
        user_id = str(row.id)
        print(f"Resetting user: {row.email} (id={user_id})")

        # Tables to wipe — order matters for FK constraints
        wipe_tables = [
            ("classification_log",      "transaction_id IN (SELECT id FROM transactions WHERE user_id = :uid)"),
            ("duplicate_pairs",         "user_id = :uid"),
            ("transactions",            "user_id = :uid"),
            ("emails",                  "user_id = :uid"),
            ("sync_state",              "user_id = :uid"),
            ("budgets",                 "user_id = :uid"),
            ("debts",                   "user_id = :uid"),
            ("recurring_expenses",      "user_id = :uid"),
            ("user_merchant_overrides", "user_id = :uid"),
            ("user_ai_services",        "user_id = :uid"),
            ("user_categories",         "user_id = :uid"),
            ("connected_accounts",      "user_id = :uid"),
            ("sessions",                "user_id = :uid"),
            ("oauth_states",            "user_id = :uid"),
            ("user_profiles",           "user_id = :uid"),
        ]

        for table, where in wipe_tables:
            q = text(f"DELETE FROM {table} WHERE {where}").bindparams(uid=user_id)
            r = await session.execute(q)
            if r.rowcount:
                print(f"  deleted {r.rowcount:>4} rows from {table}")

        # Reset user_settings to defaults (keep row, clear customisations)
        await session.execute(
            text("""
                UPDATE user_settings SET
                    active_ai_service_id = NULL,
                    monthly_ai_budget    = NULL,
                    auto_categorize      = TRUE,
                    use_rule_engine      = TRUE,
                    show_confidence      = FALSE,
                    daily_digest         = FALSE,
                    low_confidence_alerts = FALSE
                WHERE user_id = :uid
            """),
            {"uid": user_id},
        )

        # Reset onboarding flag
        await session.execute(
            text("UPDATE users SET onboarding_complete = FALSE WHERE id = :uid"),
            {"uid": user_id},
        )

        await session.commit()
        print("Done. User will see onboarding on next login.")

    await engine.dispose()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/reset_user.py <email>")
        sys.exit(1)
    asyncio.run(reset_user(sys.argv[1]))
