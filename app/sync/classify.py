"""Classification helpers extracted from sync pipeline."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classifier.classifier import batch_classify_emails
from app.classifier.pre_filter import load_engine_from_db
from app.config import settings
from app.models import UserSettings
from app.services.llm_service import get_user_llm_client


async def _apply_pre_filter(
    session: AsyncSession, messages: list[dict], user_id: str, prog: dict, uid: str
) -> tuple[list, int]:
    """
    Deduplicate + pre-filter incoming messages.
    Returns (new_pairs, skipped_count) where new_pairs is List[(Email, msg_dict)].
    """
    from app.models import Email

    incoming_ids = [m["gmail_id"] for m in messages]
    existing_result = await session.execute(
        select(Email.gmail_id).where(Email.gmail_id.in_(incoming_ids), Email.user_id == user_id)
    )
    already_stored = {row[0] for row in existing_result.all()}

    pre_filter_engine = await load_engine_from_db(session)

    # Build user LLM client for Tier 3 ambiguous resolution
    user_llm_client = None
    if user_id:
        user_settings_q = select(UserSettings).where(UserSettings.user_id == user_id)
        user_settings = (await session.execute(user_settings_q)).scalar_one_or_none()
        if user_settings and user_settings.active_ai_service_id:
            user_llm_client = await get_user_llm_client(user_id, session)

    new_pairs: list[tuple] = []
    skipped = 0

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
            user_llm_client=user_llm_client,
        )

        (msg.get("subject") or "(no subject)")[:48]
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

    await session.flush()
    return new_pairs, skipped


async def _classify_batch(
    new_pairs: list,
    session: AsyncSession,
    user_id: str | None,
    user_llm_client=None,
    llm_priority: bool = False,
) -> list:
    """
    Load settings, rules, and run batch classification on new_pairs.
    Returns list of classification results.
    """
    from app.models import UserSettings

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

    effective_llm_client = user_llm_client
    if not effective_llm_client and user_id and user_settings and user_settings.active_ai_service_id:
        effective_llm_client = await get_user_llm_client(user_id, session)

    items = [
        (
            email.id,
            msg["sender"],
            msg["sender_domain"],
            msg.get("subject", ""),
            msg.get("body_text") or msg.get("body_snippet") or "",
        )
        for email, msg in new_pairs
    ]

    classifications = await batch_classify_emails(
        items,
        session=session,
        rule_engine_enabled=rule_engine_enabled,
        db_rules=db_rules,
        user_id=user_id,
        llm_client_override=effective_llm_client,
        llm_priority=llm_priority,
        batch_size=settings.LLM_BATCH_SIZE,
    )
    return classifications
