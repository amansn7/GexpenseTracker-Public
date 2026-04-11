import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models import Email, Transaction, SyncState, SenderRule, Label
from app.gmail.client import fetch_new_messages
from app.classifier.classifier import classify_email

logger = logging.getLogger(__name__)

async def _load_db_rules(session: AsyncSession) -> dict:
    result = await session.execute(select(SenderRule))
    return {r.sender_domain: (Label(r.label), r.category) for r in result.scalars().all()}

async def run_sync() -> dict:
    async with AsyncSessionLocal() as session:
        state_result = await session.execute(select(SyncState))
        sync_state = state_result.scalar_one_or_none()
        last_history_id = sync_state.last_history_id if sync_state else None

        new_history_id = last_history_id  # fallback if fetch raises
        try:
            messages, new_history_id = await asyncio.to_thread(
                fetch_new_messages, last_history_id
            )
        except Exception as exc:
            logger.error("Gmail fetch failed: %s", exc)
            return {"error": str(exc), "processed": 0}

        db_rules = await _load_db_rules(session)
        processed = 0

        for msg in messages:
            existing = await session.execute(
                select(Email).where(Email.gmail_id == msg["gmail_id"])
            )
            if existing.scalar_one_or_none():
                continue

            email = Email(**msg)
            session.add(email)
            await session.flush()

            try:
                classification = await classify_email(
                    sender=msg["sender"],
                    sender_domain=msg["sender_domain"],
                    subject=msg["subject"] or "",
                    body_snippet=msg["body_snippet"] or "",
                    db_rules=db_rules,
                )
                session.add(Transaction(
                    email_id=email.id,
                    label=classification.label.value,
                    amount=classification.amount,
                    currency="INR",
                    merchant=classification.merchant,
                    category=classification.category,
                    txn_date=classification.txn_date,
                    confidence=classification.confidence,
                    status=classification.status.value,
                    classifier_method=classification.classifier_method.value,
                ))
                processed += 1
            except Exception as exc:
                logger.error("Classification failed for %s: %s", msg["gmail_id"], exc)
                session.add(Transaction(
                    email_id=email.id,
                    label=Label.ignore.value,
                    currency="INR",
                    status="needs_review",
                    classifier_method="rule",
                    confidence=0.0,
                ))

        if sync_state is None:
            session.add(SyncState(id=1, last_history_id=new_history_id,
                                  last_synced_at=datetime.now(timezone.utc)))
        else:
            sync_state.last_history_id = new_history_id
            sync_state.last_synced_at = datetime.now(timezone.utc)

        await session.commit()
        return {"processed": processed, "total_fetched": len(messages)}
