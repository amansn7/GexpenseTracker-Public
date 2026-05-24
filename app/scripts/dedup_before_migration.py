"""
Pre-migration dedup script for Phase 3 pending tab pipeline.

Resolves existing duplicates before adding unique constraints:
  1. Transaction.email_id → keep highest confidence, break ties by most recent created_at
  2. FilterRule(rule_type, value, source, user_id) → keep highest hit_count

Safe to run against a live database. Use --dry-run to preview changes.

Usage:
    uv run python -m app.scripts.dedup_before_migration --dry-run
    uv run python -m app.scripts.dedup_before_migration --execute
"""

import argparse
import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

log = logging.getLogger(__name__)


async def _resolve_transaction_duplicates(session: AsyncSession, dry_run: bool = True) -> int:
    """Find duplicate Transaction.email_id values; keep one, delete rest.
    
    Resolution: keep Transaction with highest confidence; tie-break by most recent created_at.
    """
    from app.models.transaction import Transaction

    result = await session.execute(
        text("""
            SELECT email_id
            FROM transactions
            WHERE email_id IS NOT NULL
            GROUP BY email_id
            HAVING COUNT(*) > 1
        """)
    )
    dup_email_ids = [row[0] for row in result.all()]

    removed = 0
    for email_id in dup_email_ids:
        txn_q = await session.execute(
            select(Transaction)
            .where(Transaction.email_id == email_id)
            .order_by(Transaction.confidence.desc().nullslast(), Transaction.created_at.desc().nullslast())
        )
        txns = txn_q.scalars().all()

        # Keep the first (highest confidence, most recent), delete the rest
        keep, *to_delete = txns
        for txn in to_delete:
            log.info("Removing duplicate Transaction %s (email_id=%s, confidence=%s, created_at=%s) in favor of %s (confidence=%s, created_at=%s)",
                     txn.id, email_id, txn.confidence, txn.created_at,
                     keep.id, keep.confidence, keep.created_at)
            if not dry_run:
                await session.delete(txn)
            removed += 1

    return removed


async def _resolve_filter_rule_duplicates(session: AsyncSession, dry_run: bool = True) -> int:
    """Find duplicate FilterRule(rule_type, value, source, user_id) values; keep highest hit_count."""
    from app.models.filter_rule import FilterRule

    result = await session.execute(
        text("""
            SELECT rule_type, value, source, user_id
            FROM filter_rules
            GROUP BY rule_type, value, source, user_id
            HAVING COUNT(*) > 1
        """)
    )
    dup_keys = [row._mapping for row in result.all()]

    removed = 0
    for key in dup_keys:
        rule_q = await session.execute(
            select(FilterRule)
            .where(
                FilterRule.rule_type == key["rule_type"],
                FilterRule.value == key["value"],
                FilterRule.source == key["source"],
                FilterRule.user_id == key["user_id"],
            )
            .order_by(FilterRule.hit_count.desc().nullslast())
        )
        rules = rule_q.scalars().all()

        keep, *to_delete = rules
        for rule in to_delete:
            log.info("Removing duplicate FilterRule %s (type=%s, value=%s, source=%s, user_id=%s, hit_count=%s) in favor of %s (hit_count=%s)",
                     rule.id, key["rule_type"], key["value"], key["source"], key["user_id"],
                     rule.hit_count, keep.id, keep.hit_count)
            if not dry_run:
                await session.delete(rule)
            removed += 1

    return removed


async def main():
    parser = argparse.ArgumentParser(description="Dedup before adding unique constraints")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Preview changes without modifying (default)")
    parser.add_argument("--execute", action="store_true", help="Actually delete duplicates")
    args = parser.parse_args()

    dry_run = not args.execute
    if dry_run:
        log.info("DRY RUN — no changes will be made")

    engine = create_async_engine(settings.DATABASE_URL)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        txn_removed = await _resolve_transaction_duplicates(session, dry_run=dry_run)
        rule_removed = await _resolve_filter_rule_duplicates(session, dry_run=dry_run)
        if not dry_run:
            await session.commit()

    log.info("Dedup complete: %s Transaction duplicates removed, %s FilterRule duplicates removed",
             txn_removed, rule_removed)
    await engine.dispose()


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
