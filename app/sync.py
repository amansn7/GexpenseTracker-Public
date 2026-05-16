import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models import Email, Transaction, SyncState, Label, UserSettings, DuplicatePair
from app.gmail.auth import get_credentials_for_user
from app.gmail.client import fetch_new_messages
from app.alerts import add_alert
from app.classifier.classifier import batch_classify_emails
from app.config import settings

logger = logging.getLogger(__name__)

# Per-user sync progress — keyed by user_id (or "default" for legacy)
_sync_progress: Dict[str, Dict[str, Any]] = {}


def _default_progress() -> Dict[str, Any]:
    return {
        "running": False,
        "phase": "idle",
        "phase_detail": "",
        "current": 0,
        "total": 0,
        "tally": {"expense": 0, "income": 0, "ignore": 0, "review": 0},
        "previews": [],
        "current_email": None,
        "log": [],
        "result": None,
        "error": None,
        "minimized": False,
    }


def _user_progress(user_id: str) -> Dict[str, Any]:
    key = user_id or "default"
    if key not in _sync_progress:
        _sync_progress[key] = _default_progress()
    return _sync_progress[key]


def _log_event(user_id: str, message: str, event_type: str = "info"):
    prog = _user_progress(user_id)
    log = prog.setdefault("log", [])
    log.append({
        "time": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "type": event_type,
    })
    if len(log) > 50:
        log[:] = log[-50:]


def get_sync_progress(user_id: str = None) -> dict:
    return dict(_user_progress(user_id))


def _reset_progress(user_id: str):
    _sync_progress[user_id or "default"] = {
        **_default_progress(),
        "running": True,
        "phase": "fetching",
    }


def _add_preview(user_id: str, msg: dict, label: str, category: Optional[str], amount: Optional[float]):
    prog = _user_progress(user_id)
    subject = (msg.get("subject") or "").strip() or "(no subject)"
    sender = msg.get("sender") or ""
    m = re.search(r"<([^>]+)>", sender)
    sender_short = m.group(1) if m else sender
    entry = {
        "subject": subject[:72],
        "sender": sender_short[:48],
        "label": label,
        "category": category,
        "amount": float(amount) if amount is not None else None,
    }
    prog["previews"] = [entry] + prog["previews"][:7]
    prog["tally"][label] = prog["tally"].get(label, 0) + 1
    prog["current_email"] = entry



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


async def sync_emails(session, user_id: str = None) -> dict:
    """Core sync logic operating on an injected session. Exposed for testing."""
    uid = user_id or "default"
    prog = _user_progress(uid)
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
        prog.update({"running": False, "phase": "error", "error": str(exc)})
        return {"error": str(exc), "processed": 0}

    total = len(messages)
    logger.info("Fetched %d messages, classifying...", total)
    _log_event(uid, f"Fetched {total} messages from Gmail")
    prog.update({"phase_detail": "Deduplicating incoming emails…"})

    # ── Phase 2: deduplicate + insert Email rows ───────────────────────────
    prog.update({"phase": "classifying", "total": total, "current": 0})

    new_pairs: List[Tuple[Email, dict]] = []  # (email_orm, raw_msg)
    skipped = 0

    # Batch dedup: one query instead of N individual SELECTs
    incoming_ids = [m["gmail_id"] for m in messages]
    existing_result = await session.execute(
        select(Email.gmail_id).where(Email.gmail_id.in_(incoming_ids))
    )
    already_stored = {row[0] for row in existing_result.all()}
    _log_event(uid, f"{len(already_stored)} already synced, {len(messages) - len(already_stored)} new")

    from app.classifier.pre_filter import load_engine_from_db
    pre_filter_engine = await load_engine_from_db(session)

    for msg in messages:
        if msg["gmail_id"] in already_stored:
            skipped += 1
            continue

        prog.update({"phase_detail": "Pre-filtering…", "current": len(new_pairs) + skipped + 1})

        pf_result = await pre_filter_engine.evaluate(
            subject=msg.get("subject", ""),
            snippet=msg.get("body_snippet", ""),
            sender_domain=msg.get("sender_domain", ""),
            session=session,
            user_llm_client=None,
        )

        subject_short = (msg.get("subject") or "(no subject)")[:48]
        email = Email(**msg)
        if user_id:
            email.user_id = user_id
        email.pre_filter_status = "passed" if pf_result.decision == "pass" else "review_pending"
        session.add(email)
        if pf_result.decision == "pass":
            new_pairs.append((email, msg))
        else:
            skipped += 1
            prog["tally"]["review"] = prog["tally"].get("review", 0) + 1
            _log_event(uid, f"Review: {subject_short} — {pf_result.decision} (tier {pf_result.tier})")
            logger.debug("Pre-filter review: %s (tier=%d conf=%.2f)", msg.get("subject", ""), pf_result.tier, pf_result.confidence)

    await session.flush()

    if not new_pairs:
        if sync_state is not None:
            sync_state.last_synced_at = datetime.now(timezone.utc)
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

    # ── Phase 2b: load rule engine settings (once) ──────────────────────────
    prog.update({"phase": "classifying", "total": len(new_pairs), "current": skipped})

    prog.update({"phase_detail": "Loading settings & LLM client…"})

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
        _log_event(uid, f"Loaded {len(db_rules)} learned domain rules")
    else:
        _log_event(uid, "Rule engine disabled — all emails go to LLM")

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
    prog.update({"phase_detail": f"Classifying {len(new_pairs)} emails…"})
    _log_event(uid, f"Classifying {len(new_pairs)} emails with batch LLM")

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
    processed = 0
    new_transactions: list = []
    for (email, msg), cls in zip(new_pairs, classifications):
        t = Transaction(
            email_id=email.id,
            label=cls.label.value,
            transaction_type=cls.transaction_type,
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
    if sync_state is None:
        session.add(SyncState(id=1, last_history_id=new_history_id,
                              last_synced_at=datetime.now(timezone.utc)))
    else:
        sync_state.last_history_id = new_history_id
        sync_state.last_synced_at = datetime.now(timezone.utc)

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


async def run_sync_range(user_id: str, after_date: str, before_date: str, llm_priority: bool = False, sender: Optional[str] = None, subject: Optional[str] = None) -> dict:
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

    from sqlalchemy import or_
    from app.gmail.client import _build_service, _extract_body_text

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

        incoming_ids = [m["gmail_id"] for m in messages]
        existing = {row[0] for row in (await session.execute(
            select(Email.gmail_id).where(Email.gmail_id.in_(incoming_ids))
        )).all()} if incoming_ids else set()

        from app.classifier.pre_filter import load_engine_from_db
        pre_filter_engine = await load_engine_from_db(session)

        prog["phase_detail"] = "Deduplicating and pre-filtering..."
        new_pairs = []
        for idx, msg in enumerate(messages):
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
            prog["current"] = idx + 1

        await session.flush()

        _log_event(uid, f"{len(new_pairs)} new emails after dedup + pre-filter")
        prog["phase_detail"] = "Classifying emails..."

        inserted = 0
        if new_pairs:
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

            prog["phase"] = "classifying"
            prog["total"] = len(items)
            prog["current"] = 0
            prog["phase_detail"] = f"Classifying {len(items)} emails..."

            classifications = await batch_classify_emails(
                items,
                session=session,
                rule_engine_enabled=rule_engine_enabled,
                db_rules=db_rules,
                user_id=user_id,
                llm_client_override=user_llm_client,
                llm_priority=llm_priority,
                batch_size=settings.LLM_BATCH_SIZE,
            )

            new_transactions = []
            for (email, _), cls in zip(new_pairs, classifications):
                t = Transaction(
                    email_id=email.id,
                    label=cls.label.value,
                    transaction_type=cls.transaction_type,
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


_DIRTY_BODY_RE = re.compile(
    r'&[a-zA-Z#][\w#]*;|[\u200b-\u200f\u200c\u200d\ufeff\u034f\u00ad\u2028-\u202f]'
)


async def clean_bodies_job(user_id: str):
    """Re-fetch emails with dirty body text and re-extract via _clean_body pipeline."""
    from app.gmail.client import _build_service, _extract_body_text
    from app.models import Email

    uid = user_id or "default"
    _reset_progress(uid)
    prog = _user_progress(uid)
    prog["phase"] = "fetching"
    prog["phase_detail"] = "Scanning for dirty email bodies..."
    _log_event(uid, "Starting clean-bodies job...")

    async with AsyncSessionLocal() as session:
        try:
            all_emails = (await session.execute(select(Email))).scalars().all()
        except Exception as exc:
            prog.update({"phase": "error", "running": False, "error": str(exc)})
            _log_event(uid, f"DB query failed: {exc}", "error")
            return

        candidates = [e for e in all_emails if e.body_text and _DIRTY_BODY_RE.search(e.body_text)]
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


async def scan_all_for_duplicates(user_id: str) -> dict:
    """
    Scan ALL existing expense transactions for duplicate candidates.
    Runs detect_and_record_duplicates on every expense tx with a linked email.
    Safe to run periodically — already-paired transactions are skipped
    (dedup service checks _pair_exists_query before creating new pairs).

    Returns {checked, new_pairs} where new_pairs is the count of newly
    created DuplicatePair rows (beyond what the dedup service already found).
    """
    from app.dedup.service import detect_and_record_duplicates

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(Transaction, Email)
            .join(Email, Transaction.email_id == Email.id)
            .where(
                Email.user_id == user_id,
                Transaction.label == Label.expense,
            )
        )).all()

        checked = 0
        _user_pairs_q = (
            select(func.count(DuplicatePair.id))
            .join(Transaction, Transaction.id == DuplicatePair.primary_tx_id)
            .join(Email, Email.id == Transaction.email_id)
            .where(Email.user_id == user_id)
        )
        before = (await session.execute(_user_pairs_q)).scalar()

        for t, email in rows:
            try:
                await detect_and_record_duplicates(t, email, session)
                checked += 1
            except Exception as exc:
                logger.error("Dedup scan failed for tx %s: %s", t.id, exc)

        await session.commit()

        after = (await session.execute(_user_pairs_q)).scalar()
        new_pairs = (after or 0) - (before or 0)

        logger.info("scan_all_for_duplicates: checked %d, new pairs %d", checked, new_pairs)
        return {"checked": checked, "new_pairs": new_pairs}
