import logging
import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import FilterRule, User, Email
from app.classifier.pre_filter import _is_safe_pattern
from app.services.llm_service import get_user_llm_client


class FilterRuleBody(BaseModel):
    rule_type: str  # allowlist_domain | blocklist_domain | keyword_pattern
    value: str

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/filter/rules")
async def list_filter_rules(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_q = await db.execute(select(FilterRule.id).where(FilterRule.user_id == current_user.id).order_by(FilterRule.rule_type, FilterRule.created_at))
    total = len(total_q.all())

    rows = (await db.execute(
        select(FilterRule).where(FilterRule.user_id == current_user.id).order_by(FilterRule.rule_type, FilterRule.created_at).offset(skip).limit(limit)
    )).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "rule_type": r.rule_type,
                "value": r.value,
                "source": r.source,
                "hit_count": r.hit_count,
            }
            for r in rows
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/filter/refine")
async def refine_filter_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    llm_client = await get_user_llm_client(current_user.id, db)
    if not llm_client:
        return {"error": "No LLM configured. Add an AI service in settings first."}

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
                FilterRule.user_id == current_user.id,
            )
        )).scalar_one_or_none()

        if existing:
            existing.source = "llm"
            updated.append({"rule_type": rule_type, "value": value})
        else:
            db.add(FilterRule(rule_type=rule_type, value=value, source="llm", user_id=current_user.id))
            added.append({"rule_type": rule_type, "value": value})

    await db.commit()
    return {"added": added, "updated": updated, "generated": len(added)}


@router.post("/filter/rules", status_code=201)
async def create_filter_rule(
    body: FilterRuleBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.rule_type not in ("allowlist_domain", "blocklist_domain", "keyword_pattern"):
        raise HTTPException(status_code=422, detail="rule_type must be allowlist_domain, blocklist_domain, or keyword_pattern")
    if not body.value.strip():
        raise HTTPException(status_code=422, detail="value is required")

    value = body.value.strip()

    if body.rule_type == "keyword_pattern" and not _is_safe_pattern(value):
        raise HTTPException(status_code=422, detail="Pattern rejected: potentially unsafe regex (ReDoS risk)")

    existing = (await db.execute(
        select(FilterRule).where(FilterRule.rule_type == body.rule_type, FilterRule.value == value, FilterRule.user_id == current_user.id)
    )).scalar_one_or_none()

    if existing:
        raise HTTPException(status_code=409, detail="Filter rule already exists")

    db.add(FilterRule(rule_type=body.rule_type, value=value, source="user", user_id=current_user.id))
    await db.commit()
    return {"rule_type": body.rule_type, "value": value, "source": "user"}


@router.delete("/filter/rules/{rule_id}")
async def delete_filter_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = (await db.execute(select(FilterRule).where(FilterRule.id == rule_id, FilterRule.user_id == current_user.id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Filter rule not found")

    await db.execute(delete(FilterRule).where(FilterRule.id == rule_id, FilterRule.user_id == current_user.id))
    await db.commit()
    return {"deleted": rule_id}
