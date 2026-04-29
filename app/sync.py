import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models import Email, Transaction, SyncState, Label, UserSettings
from app.gmail.auth import get_credentials_for_user
from app.gmail.client import fetch_new_messages
from app.alerts import add_alert
from app.classifier.classifier import classify_email
from app.classifier.protocol import ClassificationResult

logger = logging.getLogger(__name__)

# Max concurrent LLM calls (emails that need LLM go in parallel, capped here)
_LLM_CONCURRENCY = 8

# Global sync progress — read by /api/sync/progress polling endpoint
_sync_progress: Dict[str, Any] = {
    "running": False,
    "phase": "idle",      # idle | fetching | classifying | done | error
    "current": 0,
    "total": 0,
    "tally": {"expense": 0, "income": 0, "ignore": 0},
    "previews": [],       # last 8 classified emails (newest first)
    "result": None,
    "error": None,
}


def get_sync_progress() -> dict:
    return dict(_sync_progress)


def _reset_progress():
    _sync_progress.update({
        "running": True,
        "phase": "fetching",
        "current": 0,
        "total": 0,
        "tally": {"expense": 0, "income": 0, "ignore": 0},
        "previews": [],
        "result": None,
        "error": None,
    })


def _add_preview(msg: dict, label: str, category: Optional[str], amount: Optional[float]):
    subject = (msg.get("subject") or "").strip() or "(no subject)"
    sender = msg.get("sender") or ""
    m = re.search(r"<([^>]+)>", sender)
    sender_short = m.group(1) if m else sender
    _sync_progress["previews"] = ([{
        "subject": subject[:72],
        "sender": sender_short[:48],
        "label": label,
        "category": category,
        "amount": float(amount) if amount is not None else None,
    }] + _sync_progress["previews"])[:8]
    _sync_progress["tally"][label] = _sync_progress["tally"].get(label, 0) + 1



async def run_sync(user_id: str = None) -> dict:
    if _sync_progress.get("running"):
        logger.warning("Sync already in progress, skipping duplicate trigger")
        return {"error": "sync_already_running", "processed": 0}
    _reset_progress()
    logger.info("Gmail sync starting")
    try:
        return await _run_sync_inner(user_id=user_id)
    except Exception as exc:
        logger.error("Sync crashed: %s", exc, exc_info=True)
        _sync_progress.update({"running": False, "phase": "error", "error": str(exc)})
        raise


async def _run_sync_inner(user_id: str = None) -> dict:
    async with AsyncSessionLocal() as session:
        state_result = await session.execute(select(SyncState))
        sync_state = state_result.scalar_one_or_none()
        last_history_id = sync_state.last_history_id if sync_state else None
        email_filter = getattr(sync_state, "email_filter", "all") or "all"

        # ── Phase 1: fetch from Gmail ──────────────────────────────────────────
        new_history_id = last_history_id
        logger.info("Fetching messages with filter=%s", email_filter)
        try:
            creds = await get_credentials_for_user(session, user_id) if user_id else None
            if not creds:
                raise RuntimeError("Gmail not authenticated. Visit /api/auth/google")
            messages, new_history_id = await asyncio.to_thread(
                fetch_new_messages, last_history_id, email_filter, creds
            )
        except Exception as exc:
            logger.error("Gmail fetch failed: %s", exc, exc_info=True)
            _sync_progress.update({"running": False, "phase": "error", "error": str(exc)})
            return {"error": str(exc), "processed": 0}

        total = len(messages)
        logger.info("Fetched %d messages, classifying...", total)

        # ── Phase 2: deduplicate + insert Email rows ───────────────────────────
        _sync_progress.update({"phase": "classifying", "total": total, "current": 0})

        new_pairs: List[Tuple[Email, dict]] = []  # (email_orm, raw_msg)
        skipped = 0

        # Batch dedup: one query instead of N individual SELECTs
        incoming_ids = [m["gmail_id"] for m in messages]
        existing_result = await session.execute(
            select(Email.gmail_id).where(Email.gmail_id.in_(incoming_ids))
        )
        already_stored = {row[0] for row in existing_result.all()}

        for msg in messages:
            if msg["gmail_id"] in already_stored:
                skipped += 1
                continue
            email = Email(**msg)
            if user_id:
                email.user_id = user_id
            session.add(email)
            new_pairs.append((email, msg))

        await session.flush()  # assign IDs to all new Email rows at once

        # ── Phase 2b: load rule engine settings ───────────────────────────────
        user_settings = (await session.execute(select(UserSettings).limit(1))).scalar_one_or_none()
        rule_engine_enabled = user_settings.use_rule_engine if user_settings else True

        db_rules: dict = {}
        if rule_engine_enabled:
            from app.classifier.rules import build_domain_rules
            db_rules = await build_domain_rules(session)
            logger.info("Rule engine enabled: loaded %d learned domain rules", len(db_rules))
        else:
            logger.info("Rule engine disabled: all emails go to LLM")

        # ── Phase 3: classify all new emails concurrently ─────────────────────
        sem = asyncio.Semaphore(_LLM_CONCURRENCY)
        done_counter = 0

        async def _classify_one(email: Email, msg: dict) -> ClassificationResult:
            nonlocal done_counter
            async with sem:
                result = await classify_email(
                    email_id=email.id,
                    sender=msg["sender"],
                    sender_domain=msg["sender_domain"],
                    subject=msg["subject"] or "",
                    body_text=msg.get("body_text") or msg.get("body_snippet") or "",
                    session=session,
                    rule_engine_enabled=rule_engine_enabled,
                    db_rules=db_rules,
                )
            for warning in result.warnings:
                add_alert("error", warning, source="classifier")
            done_counter += 1
            _sync_progress["current"] = skipped + done_counter
            _add_preview(msg, result.label.value, result.category, result.amount)
            return result

        classifications = await asyncio.gather(
            *[_classify_one(e, m) for e, m in new_pairs],
            return_exceptions=True,
        )

        # ── Phase 4: write Transaction rows + run dedup detection ─────────────
        processed = 0
        new_transactions: list = []  # (transaction_orm, email_orm) for dedup pass
        for (email, msg), cls in zip(new_pairs, classifications):
            if isinstance(cls, Exception):
                logger.error("Classification failed for %s: %s", msg["gmail_id"], cls,
                             exc_info=(type(cls), cls, cls.__traceback__))
                t = Transaction(
                    email_id=email.id,
                    label=Label.ignore.value,
                    currency="INR",
                    status="needs_review",
                    classifier_method="llm",
                    confidence=0.0,
                )
                session.add(t)
                new_transactions.append((t, email))
            else:
                t = Transaction(
                    email_id=email.id,
                    label=cls.label.value,
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
                processed += 1

        await session.flush()  # ensure Transaction IDs exist before dedup queries

        # ── Phase 4b: duplicate detection ─────────────────────────────────────
        from app.dedup.service import detect_and_record_duplicates
        for t, email in new_transactions:
            try:
                await detect_and_record_duplicates(t, email, session)
            except Exception as exc:
                logger.error("Dedup detection failed for tx email %s: %s", email.id, exc)

        # ── Phase 4c: persist fuzzy-learned merchant aliases ──────────────────
        from app.classifier.merchant import learn_pending_aliases
        await learn_pending_aliases(session)

        # ── Phase 5: update SyncState + commit ────────────────────────────────
        if sync_state is None:
            session.add(SyncState(id=1, last_history_id=new_history_id,
                                  last_synced_at=datetime.now(timezone.utc)))
        else:
            sync_state.last_history_id = new_history_id
            sync_state.last_synced_at = datetime.now(timezone.utc)

        await session.commit()

    result = {"processed": processed, "total_fetched": total, "skipped": skipped}
    _sync_progress.update({"running": False, "phase": "done", "result": result})
    logger.info("Sync complete: %s", result)
    return result
