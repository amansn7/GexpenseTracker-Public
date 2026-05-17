"""Transaction persistence and sync state updates."""
from datetime import datetime, timezone
from typing import List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Email, Label, SyncState, Transaction


async def _persist_transactions(
    new_pairs: List,
    classifications: List,
    session: AsyncSession,
) -> Tuple[List[Tuple], int]:
    """
    Create Transaction rows from classification results.
    Returns (new_transactions_list, processed_count).
    """
    processed = 0
    new_transactions: list = []
    for (email, msg), cls in zip(new_pairs, classifications):
        t = Transaction(
            email_id=email.id,
            label=cls.label.value,
            transaction_type=cls.transaction_type,
            payment_mode=cls.payment_mode,
            amount=cls.amount,
            currency="INR",
            merchant=cls.merchant,
            category=cls.category,
            txn_date=cls.txn_date,
            confidence=cls.confidence,
            status=cls.status.value,
            classifier_method=cls.classifier_method.value,
        )
        session.add(t)
        new_transactions.append((t, email))
        if cls.label != Label.ignore:
            processed += 1

    await session.flush()
    return new_transactions, processed


async def _update_sync_state(
    session: AsyncSession,
    sync_state,
    new_history_id,
    user_id: str = None,
) -> None:
    """Update or create SyncState row with new history_id and timestamp."""
    if sync_state is None:
        session.add(SyncState(
            id=1,
            user_id=user_id,
            last_history_id=new_history_id,
            last_synced_at=datetime.now(timezone.utc),
        ))
    else:
        sync_state.last_history_id = new_history_id
        sync_state.last_synced_at = datetime.now(timezone.utc)
