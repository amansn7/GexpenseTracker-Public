#!/usr/bin/env python3
"""
Backfill all monthly rollups from transaction data.

Usage:
  # Default (SQLite dev):
  python scripts/backfill_rollups.py

  # PostgreSQL:
  DATABASE_URL=postgresql+asyncpg://user:pass@localhost/dbname python scripts/backfill_rollups.py
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.database import engine
from app.models import Email, Transaction
from app.services.stats_service import recompute_month


async def main():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # strftime works on SQLite; for PostgreSQL use func.extract()
        year_expr = func.strftime("%Y", Transaction.txn_date).label("year")
        month_expr = func.strftime("%m", Transaction.txn_date).label("month")

        rows = (
            await db.execute(
                select(Email.user_id, year_expr, month_expr)
                .join(Email, Transaction.email_id == Email.id)
                .where(Transaction.txn_date.isnot(None))
                .distinct()
                .order_by(Email.user_id, year_expr, month_expr)
            )
        ).all()

        total = len(rows)
        if total == 0:
            print("No user-months found — nothing to backfill.")
            return

        print(f"Found {total} user-months to backfill")

        for i, row in enumerate(rows):
            try:
                user_id = row.user_id
                year = int(row.year)
                month = int(row.month)
                print(f"[{i+1}/{total}] Recomputing {user_id[:8]}... {year}-{month:02d}")
                await recompute_month(user_id, year, month, db)
                await db.commit()
            except Exception as e:
                print(f"  ERROR on {user_id[:8]}... {year}-{month:02d}: {e}")
                await db.rollback()

    # engine is shared with the app — don't dispose
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
