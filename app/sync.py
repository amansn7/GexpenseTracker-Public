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
from app.classifier.classifier import batch_classify_emails
from app.config import settings

logger = logging.getLogger(__name__)

# Global sync progress — read by /api/sync/progress polling endpoint
_sync_progress: Dict[str, Any] = {
    "running": False,
    "phase": "idle",      # idle | fetching | classifying | done | error
    "current": 0,
    "total": 0,
    "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
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
        "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
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
        async with AsyncSessionLocal() as session:
            return await sync_emails(session, user_id=user_id)
    except Exception as exc:
        logger.error("Sync crashed: %s", exc, exc_info=True)
        _sync_progress.update({"running": False, "phase": "error", "error": str(exc)})
        raise


async def sync_emails(session, user_id: str = None) -> dict:
    """Core sync logic operating on an injected session. Exposed for testing."""
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

    from app.classifier.pre_filter import load_engine_from_db
    pre_filter_engine = await load_engine_from_db(session)

    for msg in messages:
        if msg["gmail_id"] in already_stored:
            skipped += 1
            continue

        pf_result = await pre_filter_engine.evaluate(
            subject=msg.get("subject", ""),
            snippet=msg.get("body_snippet", ""),
            sender_domain=msg.get("sender_domain", ""),
            session=session,
            user_llm_client=None,
        )

        email = Email(**msg)
        if user_id:
            email.user_id = user_id
        email.pre_filter_status = "passed" if pf_result.decision == "pass" else "review_pending"
        session.add(email)
        if pf_result.decision == "pass":
            new_pairs.append((email, msg))
        else:
            skipped += 1
            _sync_progress["tally"]["review"] = _sync_progress["tally"].get("review", 0) + 1
            logger.debug("Pre-filter review: %s (tier=%d conf=%.2f)", msg.get("subject", ""), pf_result.tier, pf_result.confidence)

    await session.flush()

    if not new_pairs:
        if sync_state is not None:
            sync_state.last_synced_at = datetime.now(timezone.utc)
            sync_state.last_history_id = new_history_id
        await session.commit()
        result = {"processed": 0, "total_fetched": total, "skipped": skipped}
        _sync_progress.update({"running": False, "phase": "done", "result": result})
        logger.info("Sync complete (no new emails): %s", result)
        return result

    # ── Phase 2b: load rule engine settings (once) ──────────────────────────
    _sync_progress.update({"phase": "classifying", "total": len(new_pairs), "current": skipped})

    _settings_q = select(UserSettings)
    if user_id:
        _settings_q = _settings_q.where(UserSettings.user_id == user_id)
    else:
        _settings_q = _settings_q.limit(1)
    user_settings = (await session.execute(_settings_q)).scalar_one_or_none()
    rule_engine_enabled = user_settings.use_rule_engine if user_settings else True

    db_rules: dict = {}
    if rule_engine_enabled:
        from app.classifier.rules import build_domain_rules
        db_rules = await build_domain_rules(session)
        logger.info("Rule engine enabled: loaded %d learned domain rules", len(db_rules))
    else:
        logger.info("Rule engine disabled: all emails go to LLM")

    # ── Phase 2c: build per-user LLM client (once) ─────────────────────────
    user_llm_client = None
    if user_settings and user_settings.active_ai_service_id:
        from app.models.user import UserAIService
        from app.api._account_helpers import _decrypt_secret
        from app.classifier.llm_client import build_user_client
        ai_svc = (await session.execute(
            select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
        )).scalar_one_or_none()
        if ai_svc and ai_svc.enabled and ai_svc.encrypted_api_key:
            try:
                decrypted_key = _decrypt_secret(ai_svc.encrypted_api_key)
                user_llm_client = build_user_client(
                    user_id=user_id,
                    provider=ai_svc.provider,
                    base_url=ai_svc.base_url,
                    api_key=decrypted_key,
                    model_id=ai_svc.model_id,
                )
                logger.info("Using DB AI service: %s (%s), total providers in client: %d", 
                    ai_svc.display_name, ai_svc.provider, len(user_llm_client._providers))
                for i, p in enumerate(user_llm_client._providers):
                    logger.info("  Provider[%d]: %s available=%s", i, p.name, p.available)
            except Exception as exc:
                logger.error("Failed to build user LLM client from DB service: %s", exc)

    # ── Phase 3: batch classify all new emails ─────────────────────────────
    items = [(email.id, msg["sender"], msg["sender_domain"],
              msg.get("subject", ""), msg.get("body_text") or msg.get("body_snippet") or "")
             for email, msg in new_pairs]

    classifications = await batch_classify_emails(
        items,
        session=session,
        rule_engine_enabled=rule_engine_enabled,
        db_rules=db_rules,
        user_id=user_id,
        llm_client_override=user_llm_client,
        batch_size=settings.LLM_BATCH_SIZE,
    )

    for i, (email, msg) in enumerate(new_pairs):
        _sync_progress["current"] = skipped + i + 1
        cls = classifications[i]
        _add_preview(msg, cls.label.value, cls.category, cls.amount)

    # ── Phase 4: write Transaction rows ─────────────────────────────────────
    processed = 0
    new_transactions: list = []
    for (email, msg), cls in zip(new_pairs, classifications):
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
        if cls.label != Label.ignore:
            processed += 1

    await session.flush()

    # ── Phase 4b: duplicate detection ───────────────────────────────────────
    from app.dedup.service import detect_and_record_duplicates
    for t, email in new_transactions:
        try:
            await detect_and_record_duplicates(t, email, session)
        except Exception as exc:
            logger.error("Dedup detection failed for tx email %s: %s", email.id, exc)

    # ── Phase 4c: persist fuzzy-learned merchant aliases ────────────────────
    from app.classifier.merchant import learn_pending_aliases
    await learn_pending_aliases(session)

    # ── Phase 5: update SyncState + commit ──────────────────────────────────
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


async def run_sync_range(user_id: str, after_date: str, before_date: str) -> dict:
    """
    Fetch + classify emails in a specific date range, then backfill missing bodies.
    Does NOT update SyncState (history_id or last_synced_at).
    after_date / before_date: "YYYY/MM/DD" (Gmail query format).
    """
    from sqlalchemy import or_
    from app.gmail.client import _build_service, _extract_body_text

    async with AsyncSessionLocal() as session:
        try:
            creds = await get_credentials_for_user(session, user_id)
            if not creds:
                raise RuntimeError("Gmail not authenticated")
            messages, _ = await asyncio.to_thread(
                fetch_new_messages, None, "all", creds, after_date, before_date
            )
        except Exception as exc:
            logger.error("fetch-range: Gmail fetch failed: %s", exc)
            return {"fetched": 0, "inserted": 0, "backfilled": 0, "errors": 1}

        fetched = len(messages)
        incoming_ids = [m["gmail_id"] for m in messages]
        existing = {row[0] for row in (await session.execute(
            select(Email.gmail_id).where(Email.gmail_id.in_(incoming_ids))
        )).all()} if incoming_ids else set()

        from app.classifier.pre_filter import load_engine_from_db
        pre_filter_engine = await load_engine_from_db(session)

        new_pairs = []
        for msg in messages:
            if msg["gmail_id"] in existing:
                continue
            pf_result = await pre_filter_engine.evaluate(
                subject=msg.get("subject", ""),
                snippet=msg.get("body_snippet", ""),
                sender_domain=msg.get("sender_domain", ""),
                session=session,
                user_llm_client=None,
            )
            email = Email(**msg)
            email.user_id = user_id
            email.pre_filter_status = "passed" if pf_result.decision == "pass" else "review_pending"
            session.add(email)
            if pf_result.decision == "pass":
                new_pairs.append((email, msg))

        await session.flush()

        user_settings = (await session.execute(
            select(UserSettings).where(UserSettings.user_id == user_id)
        )).scalar_one_or_none()
        rule_engine_enabled = user_settings.use_rule_engine if user_settings else True
        db_rules: dict = {}
        if rule_engine_enabled:
            from app.classifier.rules import build_domain_rules
            db_rules = await build_domain_rules(session)

        user_llm_client = None
        if user_settings and user_settings.active_ai_service_id:
            from app.models.user import UserAIService
            from app.api._account_helpers import _decrypt_secret
            from app.classifier.llm_client import build_user_client
            ai_svc = (await session.execute(
                select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
            )).scalar_one_or_none()
            if ai_svc and ai_svc.enabled and ai_svc.encrypted_api_key:
                try:
                    user_llm_client = build_user_client(
                        user_id=user_id,
                        provider=ai_svc.provider,
                        base_url=ai_svc.base_url,
                        api_key=_decrypt_secret(ai_svc.encrypted_api_key),
                        model_id=ai_svc.model_id,
                    )
                except Exception as exc:
                    logger.error("fetch-range: failed to build user LLM client: %s", exc)

        items = [(email.id, msg["sender"], msg["sender_domain"],
                  msg.get("subject", ""), msg.get("body_text") or msg.get("body_snippet") or "")
                 for email, msg in new_pairs]

        classifications = await batch_classify_emails(
            items,
            session=session,
            rule_engine_enabled=rule_engine_enabled,
            db_rules=db_rules,
            user_id=user_id,
            llm_client_override=user_llm_client,
            batch_size=settings.LLM_BATCH_SIZE,
        )

        inserted = 0
        for (email, _), cls in zip(new_pairs, classifications):
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
            inserted += 1

        await session.flush()

        # Backfill missing bodies for emails in this date range
        from datetime import datetime as _dt
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
                service = await asyncio.to_thread(_build_service, creds)
                for email in missing_emails:
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

        await session.commit()

    logger.info("fetch-range: fetched=%d inserted=%d backfilled=%d errors=%d", fetched, inserted, backfilled, errors)
    return {"fetched": fetched, "inserted": inserted, "backfilled": backfilled, "errors": errors}
