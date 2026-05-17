"""Run sync for a specific date range with body backfill."""
import asyncio
import logging
from datetime import datetime as _dt
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gmail.auth import get_credentials_for_user
from app.gmail.client import _build_service, _extract_body_text, fetch_new_messages
from app.models import Email, Transaction, UserSettings
from app.sync.classify import _apply_pre_filter, _classify_batch
from app.sync.persist import _persist_transactions
from app.sync.progress import (
    _add_preview,
    _log_event,
    _reset_progress,
    _user_progress,
)

logger = logging.getLogger(__name__)


async def run_sync_range(
    user_id: str,
    after_date: str,
    before_date: str,
    llm_priority: bool = False,
    sender: Optional[str] = None,
    subject: Optional[str] = None,
) -> dict:
    """
    Fetch + classify emails in a specific date range, then backfill missing bodies.
    Does NOT update SyncState (history_id or last_synced_at).
    after_date / before_date: "YYYY/MM/DD" (Gmail query format).
    sender / subject: optional Gmail search operators for from:/subject: filters.
    Writes progress to per-user _sync_progress for the frontend overlay.
    """
    uid = user_id or "default"
    _reset_progress(uid)
    prog = _user_progress(uid)
    prog["phase"] = "fetching"
    _log_event(uid, "Starting fetch-range backfill...")

    query_parts = []
    if sender:
        query_parts.append(f"from:{sender}")
    if subject:
        query_parts.append(f"subject:{subject}")
    query_extra = " ".join(query_parts) if query_parts else None

    async with AsyncSessionLocal() as session:
        try:
            creds = await get_credentials_for_user(session, user_id)
            if not creds:
                raise RuntimeError("Gmail not authenticated")
            messages, _ = await asyncio.to_thread(
                fetch_new_messages, None, "all", creds, after_date, before_date, query_extra
            )
        except Exception as exc:
            logger.error("fetch-range: Gmail fetch failed: %s", exc)
            prog.update({"phase": "error", "running": False, "error": str(exc)})
            _log_event(uid, f"Gmail fetch failed: {exc}", "error")
            return {"fetched": 0, "inserted": 0, "backfilled": 0, "errors": 1}

        fetched = len(messages)
        _log_event(uid, f"Fetched {fetched} emails from Gmail")
        prog["total"] = fetched

        new_pairs, _ = await _apply_pre_filter(session, messages, user_id, prog, uid)

        _log_event(uid, f"{len(new_pairs)} new emails after dedup + pre-filter")
        prog["phase_detail"] = "Classifying emails..."

        inserted = 0
        if new_pairs:
            prog["phase"] = "classifying"
            prog["total"] = len(new_pairs)
            prog["current"] = 0
            prog["phase_detail"] = f"Classifying {len(new_pairs)} emails..."

            classifications = await _classify_batch(
                new_pairs, session, user_id, llm_priority=llm_priority,
            )

            new_transactions = []
            for (email, _), cls in zip(new_pairs, classifications):
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
                inserted += 1
                msg = {"subject": email.subject, "sender": email.sender}
                _add_preview(uid, msg, cls.label.value, cls.category, cls.amount)

            await session.flush()

            from app.dedup.service import batch_detect_duplicates
            await batch_detect_duplicates(new_transactions, session, user_id)

        prog["phase_detail"] = "Backfilling missing body text..."

        # Backfill missing bodies for emails in this date range
        try:
            after_dt = _dt.strptime(after_date, "%Y/%m/%d")
            before_dt = _dt.strptime(before_date, "%Y/%m/%d")
        except ValueError:
            after_dt = before_dt = None

        backfilled = 0
        errors = 0
        if after_dt and before_dt:
            missing_q = select(Email).where(
                Email.user_id == user_id,
                Email.received_at >= after_dt,
                Email.received_at <= before_dt,
                or_(Email.body_text.is_(None), Email.body_text == ""),
            )
            missing_emails = (await session.execute(missing_q)).scalars().all()
            if missing_emails:
                prog["phase_detail"] = f"Backfilling {len(missing_emails)} bodies..."
                service = await asyncio.to_thread(_build_service, creds)
                for backfill_idx, email in enumerate(missing_emails):
                    try:
                        msg = await asyncio.to_thread(
                            lambda eid=email.gmail_id: service.users().messages().get(
                                userId="me", id=eid, format="full"
                            ).execute()
                        )
                        body = _extract_body_text(msg.get("payload", {}))
                        if body:
                            email.body_text = body
                            backfilled += 1
                    except Exception as exc:
                        logger.warning("fetch-range backfill: failed for %s: %s", email.gmail_id, exc)
                        errors += 1
                    prog["current"] = fetched + backfill_idx + 1
                    prog["total"] = fetched + len(missing_emails)

        await session.commit()

    result = {"fetched": fetched, "inserted": inserted, "backfilled": backfilled, "errors": errors}
    prog.update({
        "running": False,
        "phase": "done",
        "phase_detail": f"Done: {inserted} transactions, {backfilled} bodies backfilled",
        "current": prog["total"],
        "result": result,
    })
    _log_event(uid, f"Fetch-range done: {inserted} inserted, {backfilled} backfilled", "success")
    logger.info("fetch-range: fetched=%d inserted=%d backfilled=%d errors=%d", *result.values())
    return result
