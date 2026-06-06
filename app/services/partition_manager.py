"""Partition management for monthly-range partitioned tables.

Handles auto-creation of future partitions and cleanup of partitions
beyond the data retention window.
"""

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

logger = structlog.get_logger()

# Partitioned tables and their partition columns
PARTITIONED_TABLES = {
    "transactions": {"column": "txn_date", "type": "DATE"},
    "emails": {"column": "received_at", "type": "TIMESTAMPTZ"},
    "classification_log": {"column": "created_at", "type": "TIMESTAMPTZ"},
}

# How many months ahead to pre-create partitions
DEFAULT_FUTURE_MONTHS = 3

DATA_RETENTION_MONTHS = settings.DATA_RETENTION_MONTHS


def _month_range(year: int, month: int):
    from datetime import date
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    return start, end


async def ensure_future_partitions(db: AsyncSession, future_months: int = DEFAULT_FUTURE_MONTHS) -> list[str]:
    """Create partition tables for the next N months if they don't already exist.

    Returns a list of partition names created.
    """
    from datetime import date

    created = []
    today = date.today()
    target = today.replace(day=1)

    for _ in range(future_months):
        for table_name, info in PARTITIONED_TABLES.items():
            y, m = target.year, target.month
            partition_name = f"{table_name}_{y}_{m:02d}"
            s, e = _month_range(y, m)
            exists = await db.execute(
                text(
                    "SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = :name)"
                ).bindparams(name=partition_name)
            )
            if not exists.scalar():
                await db.execute(
                    text(
                        f"CREATE TABLE {partition_name} PARTITION OF {table_name} "
                        f"FOR VALUES FROM (:start) TO (:end)"
                    ).bindparams(start=s.isoformat(), end=e.isoformat())
                )
                created.append(partition_name)
                logger.info("partition_created", table=table_name, partition=partition_name)
        # Advance to next month
        if target.month == 12:
            target = target.replace(year=target.year + 1, month=1)
        else:
            target = target.replace(month=target.month + 1)

    return created


async def drop_old_partitions(db: AsyncSession, retention_months: int = DATA_RETENTION_MONTHS) -> list[str]:
    """Drop partitions older than the retention window.

    Returns a list of dropped partition names.
    """
    from datetime import date

    today = date.today()
    # Compute the cutoff: first day of the month `retention_months` ago
    cutoff = today.replace(day=1)
    for _ in range(retention_months):
        if cutoff.month == 1:
            cutoff = cutoff.replace(year=cutoff.year - 1, month=12)
        else:
            cutoff = cutoff.replace(month=cutoff.month - 1)

    dropped = []
    for table_name in PARTITIONED_TABLES:
        # Find all partitions of this table
        rows = await db.execute(
            text(
                "SELECT i.inhrelid::regclass::text AS partition_name "
                "FROM pg_inherits i "
                "JOIN pg_class p ON i.inhparent = p.oid "
                "WHERE p.relname = :table_name "
                "AND p.relkind = 'p'"
            ).bindparams(table_name=table_name)
        )
        for row in rows:
            pname_raw = row[0]
            # Strip schema qualifier (e.g. "public.transactions_2021_01")
            pname = pname_raw.split(".")[-1]
            # Parse partition name to extract year_month: e.g. transactions_2021_01
            parts = pname.split("_")
            if len(parts) < 2:
                continue
            try:
                y, m = int(parts[-2]), int(parts[-1])
            except (ValueError, IndexError):
                continue
            partition_date = date(y, m, 1)
            if partition_date < cutoff:
                await db.execute(text(f"DROP TABLE IF EXISTS {pname} CASCADE"))
                dropped.append(pname)
                logger.info("partition_dropped", table=table_name, partition=pname)

    return dropped


async def run_partition_maintenance(db: AsyncSession) -> dict:
    """Run full partition maintenance: create future partitions and drop old ones.

    Call this from the scheduler on a periodic basis (e.g., daily).
    """
    created = await ensure_future_partitions(db)
    dropped = await drop_old_partitions(db)
    result = {"future_partitions_created": len(created), "old_partitions_dropped": len(dropped)}
    if created or dropped:
        logger.info("partition_maintenance_complete", **result)
    return result
