#!/usr/bin/env python3
"""
Backfill all monthly rollups from transaction data.
"""
import asyncio
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import settings
from app.database import engine
from app.models import Email, Transaction
from app.services.stats_service import recompute_month


async def main():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Detect dialect for cross-DB date extraction
        dialect = db.bind.dialect.name if db.bind else "sqlite"

        if dialect == "postgresql":
            year_expr = func.to_char(Transaction.txn_date, "YYYY").label("year")
            month_expr = func.to_char(Transaction.txn_date, "MM").label("month")
        else:
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

        print(f"Found {total} user-months to backfill ({dialect=})")

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

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
