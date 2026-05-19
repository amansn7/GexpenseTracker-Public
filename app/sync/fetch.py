"""Gmail fetch + core sync orchestration."""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gmail.auth import get_credentials_for_user
from app.gmail.client import fetch_new_messages
from app.models import Email, SyncState
from app.sync.classify import _apply_pre_filter, _classify_batch
from app.sync.persist import _persist_transactions, _update_sync_state
from app.sync.progress import (
    _add_preview,
    _log_event,
    _reset_progress,
    _user_progress,
)

logger = logging.getLogger(__name__)


async def run_sync(user_id: str = None) -> dict:
    prog = _user_progress(user_id)
    if prog.get("running"):
        logger.warning("Sync already in progress for user %s, skipping", user_id)
        return {"error": "sync_already_running", "processed": 0}
    _reset_progress(user_id)
    logger.info("Gmail sync starting for user %s", user_id)
    try:
        async with AsyncSessionLocal() as session:
            return await sync_emails(session, user_id=user_id)
    except Exception as exc:
        logger.error("Sync crashed for user %s: %s", user_id, exc, exc_info=True)
        _log_event(user_id, f"Sync failed: {exc}", "error")
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        raise


async def sync_emails(session: AsyncSession, user_id: str = None) -> dict:
    """Core sync logic operating on an injected session. Exposed for testing."""
    uid = user_id or "default"
    prog = _user_progress(uid)
    prog["running"] = True

    try:
        state_result = await session.execute(
            select(SyncState).where(SyncState.user_id == user_id)
            if user_id else select(SyncState)
        )
        sync_state = state_result.scalar_one_or_none()
        last_history_id = sync_state.last_history_id if sync_state else None
        email_filter = getattr(sync_state, "email_filter", "all") or "all"

        return await _sync_emails_inner(session, user_id, uid, prog, sync_state, last_history_id, email_filter)
    except Exception as exc:
        logger.error("Sync crashed for user %s: %s", user_id, exc, exc_info=True)
        _log_event(uid, f"Sync failed: {exc}", "error")
        prog.update({"phase": "error", "error": str(exc)})
        raise
    finally:
        prog["running"] = False


async def _sync_emails_inner(session: AsyncSession, user_id, uid, prog, sync_state, last_history_id, email_filter) -> dict:

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
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        return {"error": str(exc), "processed": 0}

    total = len(messages)
    logger.info("Fetched %d messages, classifying...", total)
    _log_event(uid, f"Fetched {total} messages from Gmail")
    prog.update({"phase_detail": "Deduplicating incoming emails…"})

    # ── Phase 2: deduplicate + insert Email rows ───────────────────────────
    prog.update({"phase": "classifying", "total": total, "current": 0})

    new_pairs, skipped = await _apply_pre_filter(session, messages, user_id, prog, uid)

    if not new_pairs:
        if sync_state is not None:
            sync_state.last_synced_at = datetime_now_utc()
            sync_state.last_history_id = new_history_id
        await session.commit()
        result = {"processed": 0, "total_fetched": total, "skipped": skipped}
        _log_event(uid, "All emails already synced or sent to review — nothing to classify", "info")
        prog.update({
            "running": False, "phase": "done", "result": result,
            "phase_detail": "No new emails to process",
        })
        logger.info("Sync complete (no new emails): %s", result)
        return result

    # ── Phase 3: batch classify all new emails ─────────────────────────────
    prog.update({"phase": "classifying", "total": len(new_pairs), "current": skipped})
    prog.update({"phase_detail": f"Classifying {len(new_pairs)} emails…"})
    _log_event(uid, f"Classifying {len(new_pairs)} emails with batch LLM")

    classifications = await _classify_batch(new_pairs, session, user_id)

    for i, (email, msg) in enumerate(new_pairs):
        prog["current"] = skipped + i + 1
        cls = classifications[i]
        label_val = cls.label.value
        _add_preview(uid, msg, cls.label.value, cls.category, cls.amount)
        prog["current_email"] = {
            "subject": (msg.get("subject") or "(no subject)")[:60],
            "sender": (msg.get("sender") or "")[:48],
            "label": label_val,
            "amount": cls.amount,
        }
        amount_str = f" — Rs.{cls.amount:.0f}" if cls.amount else ""
        _log_event(uid, f"{label_val}: {prog['current_email']['subject']}{amount_str}")

    # ── Phase 4: write Transaction rows ─────────────────────────────────────
    prog.update({"phase_detail": "Writing transactions…"})
    new_transactions, processed = await _persist_transactions(new_pairs, classifications, session)
    _log_event(uid, f"Wrote {len(new_transactions)} transaction rows")

    # ── Phase 4b: batch duplicate detection ──────────────────────────────────
    prog.update({"phase_detail": "Checking for duplicates…"})
    from app.dedup.service import batch_detect_duplicates
    dedup_stats = await batch_detect_duplicates(new_transactions, session, user_id or "default")
    _log_event(uid, f"Dedup: {dedup_stats.get('same_domain', 0)} same-domain, {dedup_stats.get('cross_domain', 0)} cross-domain, {dedup_stats.get('merchant_alias', 0)} merchant-alias", "info")

    # ── Phase 4c: persist fuzzy-learned merchant aliases ────────────────────
    from app.classifier.merchant import learn_pending_aliases
    await learn_pending_aliases(session)

    # ── Phase 5: update SyncState + commit ──────────────────────────────────
    await _update_sync_state(session, sync_state, new_history_id, user_id)
    await session.commit()

    result = {"processed": processed, "total_fetched": total, "skipped": skipped}
    prog.update({
        "running": False, "phase": "done", "result": result,
        "phase_detail": f"Sync complete: {processed} processed, {skipped} skipped",
        "current_email": None,
    })
    _log_event(uid, f"Done — {processed} processed, {skipped} skipped, {total} total", "success")
    logger.info("Sync complete: %s", result)
    return result


async def clean_bodies_job(user_id: str):
    """Re-fetch emails with dirty body text and re-extract via _clean_body pipeline."""
    import re
    from app.gmail.client import _build_service, _extract_body_text
    from app.models import Email

    _DIRTY_BODY_RE = re.compile(
        r'&[a-zA-Z#][\w#]*;|[\u200b-\u200f\u200c\u200d\ufeff\u034f\u00ad\u2028-\u202f]'
    )

    uid = user_id or "default"
    _reset_progress(uid)
    prog = _user_progress(uid)
    prog["phase"] = "fetching"
    prog["phase_detail"] = "Scanning for dirty email bodies..."
    _log_event(uid, "Starting clean-bodies job...")

    async with AsyncSessionLocal() as session:
        try:
            # Paginate through emails to avoid loading all into memory
            batch_size = 100
            offset = 0
            candidates = []
            while True:
                batch = (await session.execute(
                    select(Email)
                    .where(Email.user_id == user_id if user_id else True)
                    .offset(offset)
                    .limit(batch_size)
                )).scalars().all()
                if not batch:
                    break
                candidates.extend([e for e in batch if e.body_text and _DIRTY_BODY_RE.search(e.body_text)])
                offset += batch_size
        except Exception as exc:
            prog.update({"phase": "error", "running": False, "error": str(exc)})
            _log_event(uid, f"DB query failed: {exc}", "error")
            return

        total = len(candidates)
        prog["total"] = total
        _log_event(uid, f"Found {total} emails with dirty body text")

        if not candidates:
            prog.update({
                "phase": "done", "running": False, "phase_detail": "All bodies clean",
                "result": {"cleaned": 0, "total_candidates": 0},
            })
            _log_event(uid, "All email bodies are clean", "success")
            return

        try:
            creds = await get_credentials_for_user(session, user_id)
            if not creds:
                raise RuntimeError("Gmail not authenticated")
        except Exception as exc:
            prog.update({"phase": "error", "running": False, "error": str(exc)})
            _log_event(uid, f"Auth failed: {exc}", "error")
            return

        service = await asyncio.to_thread(_build_service, creds)
        cleaned = 0

        for i, email in enumerate(candidates):
            prog["current"] = i + 1
            prog["current_email"] = {
                "subject": (email.subject or "")[:72],
                "sender": (email.sender or email.sender_domain or "")[:48],
            }
            prog["phase_detail"] = f"Cleaning {i+1}/{total}: {(email.subject or '(no subject)')[:50]}"
            try:
                msg = await asyncio.to_thread(
                    lambda eid=email.gmail_id: service.users().messages().get(
                        userId="me", id=eid, format="full"
                    ).execute()
                )
                body = _extract_body_text(msg.get("payload", {}))
                if body and body != email.body_text:
                    email.body_text = body
                    cleaned += 1
            except Exception as exc:
                logger.warning("clean-bodies: failed for %s: %s", email.gmail_id, exc)

        await session.commit()
        prog.update({
            "phase": "done", "running": False,
            "phase_detail": f"Cleaned {cleaned} of {total} emails",
            "result": {"cleaned": cleaned, "total_candidates": total},
        })
        _log_event(uid, f"Done: cleaned {cleaned} of {total} emails", "success")


def datetime_now_utc():
    return datetime.now(timezone.utc)
