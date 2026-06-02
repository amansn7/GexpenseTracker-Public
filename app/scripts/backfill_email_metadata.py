"""
Backfill body_dates and reference_ids for existing emails.

Extracts structured metadata (dates, reference IDs) from email body_text
for all emails where these fields are currently NULL.

Usage:
    uv run python -m app.scripts.backfill_email_metadata --dry-run
    uv run python -m app.scripts.backfill_email_metadata --execute
"""

import argparse
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.dedup.service import _extract_body_dates, _extract_reference_ids
from app.models import Email

log = logging.getLogger(__name__)


async def backfill(session: AsyncSession, dry_run: bool = True) -> int:
    total = 0
    batch_size = 200
    offset = 0

    while True:
        rows = (
            (
                await session.execute(
                    select(Email)
                    .where(Email.body_text.isnot(None))
                    .offset(offset)
                    .limit(batch_size)
                )
            )
            .scalars()
            .all()
        )
        if not rows:
            break

        for email in rows:
            needs_update = False

            if email.body_dates is None and email.body_text:
                dates = _extract_body_dates(email.body_text)
                if dates:
                    email.body_dates = dates
                    needs_update = True

            if email.reference_ids is None and email.body_text:
                refs = _extract_reference_ids(email.body_text)
                if refs:
                    email.reference_ids = refs
                    needs_update = True

            if needs_update:
                if dry_run:
                    log.info(
                        "[DRY-RUN] email=%s body_dates=%s refs=%s",
                        email.id[:8],
                        email.body_dates,
                        email.reference_ids,
                    )
                total += 1

        if not dry_run:
            await session.flush()

        offset += batch_size
        log.info("Processed %d emails... (%d updated so far)", offset, total)

    if not dry_run:
        await session.commit()

    return total


async def main():
    parser = argparse.ArgumentParser(description="Backfill email body metadata")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--execute", dest="dry_run", action="store_false")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    dsn = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_async_engine(dsn)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        count = await backfill(session, dry_run=args.dry_run)

    if args.dry_run:
        log.info("DRY-RUN complete. %d emails would be updated. Pass --execute to apply.", count)
    else:
        log.info("Done. Updated %d emails with body metadata.", count)


if __name__ == "__main__":
    asyncio.run(main())
