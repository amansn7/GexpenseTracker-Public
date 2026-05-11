import logging
import json
import re
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import FilterRule, User, Email

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/filter/refine")
async def refine_filter_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.user import UserAIService, UserSettings
    from app.api._account_helpers import _decrypt_secret
    from app.classifier.llm_client import build_user_client

    user_settings = (await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )).scalar_one_or_none()

    if not user_settings or not user_settings.active_ai_service_id:
        return {"error": "No LLM configured. Add an AI service in settings first."}

    ai_svc = (await db.execute(
        select(UserAIService).where(UserAIService.id == user_settings.active_ai_service_id)
    )).scalar_one_or_none()

    if not ai_svc or not ai_svc.enabled or not ai_svc.encrypted_api_key:
        return {"error": "Active AI service is disabled or missing API key."}

    try:
        decrypted_key = _decrypt_secret(ai_svc.encrypted_api_key)
        llm_client = build_user_client(
            user_id=current_user.id,
            provider=ai_svc.provider,
            base_url=ai_svc.base_url,
            api_key=decrypted_key,
            model_id=ai_svc.model_id,
        )
    except Exception as exc:
        return {"error": f"Failed to load LLM client: {exc}"}

    rows = (await db.execute(
        select(Email.subject, Email.sender_domain, Email.pre_filter_status)
        .where(
            Email.user_id == current_user.id,
            Email.pre_filter_status.in_(["passed", "discarded"]),
        )
        .order_by(Email.synced_at.desc())
        .limit(50)
    )).all()

    if not rows:
        return {"added": [], "updated": [], "message": "No labeled examples yet."}

    examples = "\n".join(
        f"- subject: {r.subject!r}, domain: {r.sender_domain!r}, decision: {'keep' if r.pre_filter_status == 'passed' else 'discard'}"
        for r in rows
    )
    prompt = (
        "You are a filter rule generator. Based on these labeled email decisions, "
        "suggest new filter rules as JSON. Return ONLY a JSON array of objects with keys: "
        "rule_type (allowlist_domain|blocklist_domain|keyword_pattern), value (string).\n\n"
        f"Examples:\n{examples}\n\nRules:"
    )

    try:
        verbose = await llm_client.classify_verbose(
            sender="system",
            subject="Filter rule generation",
            body_snippet=prompt,
        )
        raw = verbose.get("raw_response", "")
    except Exception as exc:
        return {"error": f"LLM call failed: {exc}"}

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return {"error": "LLM did not return a valid JSON array.", "raw": raw[:500]}

    try:
        suggestions = json.loads(match.group())
    except json.JSONDecodeError:
        return {"error": "Failed to parse LLM JSON.", "raw": raw[:500]}

    added = []
    updated = []
    for s in suggestions:
        rule_type = s.get("rule_type", "")
        value = s.get("value", "").strip()
        if not rule_type or not value:
            continue
        if rule_type not in ("allowlist_domain", "blocklist_domain", "keyword_pattern"):
            continue

        existing = (await db.execute(
            select(FilterRule).where(
                FilterRule.rule_type == rule_type,
                FilterRule.value == value,
            )
        )).scalar_one_or_none()

        if existing:
            existing.source = "llm"
            updated.append({"rule_type": rule_type, "value": value})
        else:
            db.add(FilterRule(rule_type=rule_type, value=value, source="llm"))
            added.append({"rule_type": rule_type, "value": value})

    await db.commit()
    return {"added": added, "updated": updated}
