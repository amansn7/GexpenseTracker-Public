import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import get_current_user
from app.database import get_db
from app.models import RuleSource, SenderRule, User
from app.models.financial import PatternRule

router = APIRouter()


class RuleBody(BaseModel):
    sender_domain: str
    label: str  # expense | income | ignore
    category: str | None = None
    enabled: bool | None = True


class RulePatch(BaseModel):
    label: str | None = None
    category: str | None = None
    enabled: bool | None = None


class PatternRuleBody(BaseModel):
    regex_pattern: str
    label: str  # expense | income
    merchant: str | None = None
    category: str | None = None
    confidence: float | None = 0.88
    enabled: bool | None = True


class PatternRulePatch(BaseModel):
    regex_pattern: str | None = None
    label: str | None = None
    merchant: str | None = None
    category: str | None = None
    confidence: float | None = None
    enabled: bool | None = None


class RuleTestRequest(BaseModel):
    sender_domain: str
    subject: str
    body: str


@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return user-defined sender rules."""
    user_rows = (
        (
            await db.execute(
                select(SenderRule).where(SenderRule.user_id == current_user.id).order_by(SenderRule.sender_domain)
            )
        )
        .scalars()
        .all()
    )

    return {
        "builtin": [],
        "user": [
            {
                "sender_domain": r.sender_domain,
                "label": r.label,
                "category": r.category,
                "source": r.source,
                "enabled": r.enabled,
                "editable": True,
            }
            for r in user_rows
        ],
    }


@router.post("/rules", status_code=201)
async def create_rule(
    body: RuleBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Create or update a user-defined sender rule."""
    domain = body.sender_domain.lower().strip()
    if not domain:
        raise HTTPException(status_code=422, detail="sender_domain is required")
    if body.label not in ("expense", "income", "ignore"):
        raise HTTPException(status_code=422, detail="label must be expense, income, or ignore")

    existing = (
        await db.execute(
            select(SenderRule).where(SenderRule.sender_domain == domain, SenderRule.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if existing:
        existing.label = body.label
        existing.category = body.category
        existing.enabled = body.enabled if body.enabled is not None else True
        existing.source = RuleSource.user_trained.value
    else:
        db.add(
            SenderRule(
                user_id=current_user.id,
                sender_domain=domain,
                label=body.label,
                category=body.category,
                enabled=body.enabled if body.enabled is not None else True,
                source=RuleSource.user_trained.value,
            )
        )

    await db.commit()
    return {
        "sender_domain": domain,
        "label": body.label,
        "category": body.category,
        "enabled": body.enabled if body.enabled is not None else True,
    }


@router.patch("/rules/{domain:path}")
async def patch_rule(
    domain: str, body: RulePatch, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Update a user-defined sender rule (toggle enabled, change label/category)."""
    row = (
        await db.execute(
            select(SenderRule).where(SenderRule.sender_domain == domain, SenderRule.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.label is not None:
        if body.label not in ("expense", "income", "ignore"):
            raise HTTPException(status_code=422, detail="label must be expense, income, or ignore")
        row.label = body.label
    if body.category is not None:
        row.category = body.category
    if body.enabled is not None:
        row.enabled = body.enabled

    await db.commit()
    return {
        "sender_domain": row.sender_domain,
        "label": row.label,
        "category": row.category,
        "enabled": row.enabled,
    }


@router.delete("/rules/{domain:path}")
async def delete_rule(domain: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a user-defined sender rule."""
    row = (
        await db.execute(
            select(SenderRule).where(SenderRule.sender_domain == domain, SenderRule.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.execute(
        delete(SenderRule).where(SenderRule.sender_domain == domain, SenderRule.user_id == current_user.id)
    )
    await db.commit()
    return {"deleted": domain}


# ── Pattern Rules ──────────────────────────────────────────────────────


@router.get("/rules/patterns")
async def list_pattern_rules(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return all pattern rules."""
    rows = (await db.execute(select(PatternRule).order_by(PatternRule.created_at.desc()))).scalars().all()
    return [
        {
            "id": r.id,
            "regex_pattern": r.regex_pattern,
            "label": r.label,
            "merchant": r.merchant,
            "category": r.category,
            "confidence": r.confidence,
            "hit_count": r.hit_count,
            "source": r.source,
            "enabled": r.enabled,
        }
        for r in rows
    ]


@router.post("/rules/patterns", status_code=201)
async def create_pattern_rule(
    body: PatternRuleBody, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Create a pattern rule."""
    try:
        re.compile(body.regex_pattern)
    except re.error as e:
        raise HTTPException(status_code=422, detail=f"Invalid regex: {e}")

    if body.label not in ("expense", "income"):
        raise HTTPException(status_code=422, detail="label must be expense or income")

    existing = (
        await db.execute(select(PatternRule).where(PatternRule.regex_pattern == body.regex_pattern))
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(status_code=409, detail="Pattern rule with this regex already exists")

    rule = PatternRule(
        regex_pattern=body.regex_pattern,
        label=body.label,
        merchant=body.merchant,
        category=body.category,
        confidence=body.confidence or 0.88,
        enabled=body.enabled if body.enabled is not None else True,
        source="user",
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": rule.id,
        "regex_pattern": rule.regex_pattern,
        "label": rule.label,
        "merchant": rule.merchant,
        "category": rule.category,
        "confidence": rule.confidence,
        "enabled": rule.enabled,
    }


@router.patch("/rules/patterns/{rule_id}")
async def patch_pattern_rule(
    rule_id: str,
    body: PatternRulePatch,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a pattern rule."""
    row = (await db.execute(select(PatternRule).where(PatternRule.id == rule_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Pattern rule not found")

    if body.regex_pattern is not None:
        try:
            re.compile(body.regex_pattern)
        except re.error as e:
            raise HTTPException(status_code=422, detail=f"Invalid regex: {e}")
        row.regex_pattern = body.regex_pattern
    if body.label is not None:
        if body.label not in ("expense", "income"):
            raise HTTPException(status_code=422, detail="label must be expense or income")
        row.label = body.label
    if body.merchant is not None:
        row.merchant = body.merchant
    if body.category is not None:
        row.category = body.category
    if body.confidence is not None:
        row.confidence = body.confidence
    if body.enabled is not None:
        row.enabled = body.enabled

    await db.commit()
    return {"id": row.id, "regex_pattern": row.regex_pattern, "label": row.label, "enabled": row.enabled}


@router.delete("/rules/patterns/{rule_id}")
async def delete_pattern_rule(
    rule_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a pattern rule."""
    row = (await db.execute(select(PatternRule).where(PatternRule.id == rule_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Pattern rule not found")

    await db.execute(delete(PatternRule).where(PatternRule.id == rule_id))
    await db.commit()
    return {"deleted": rule_id}


# ── Rule Tester ────────────────────────────────────────────────────────


@router.post("/rules/test")
async def test_rules(
    req: RuleTestRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Test which rules would fire against a given sender/subject/body."""
    from app.classifier.rules import BUILTIN_DOMAIN_RULES, MERCHANT_MAP, apply_rules, build_domain_rules

    matches = []
    domain = req.sender_domain.strip().lower()
    text = f"{req.subject or ''} {req.body or ''}".lower()

    # 1. Build active db_rules and check apply_rules
    db_rules = await build_domain_rules(db)
    result = apply_rules(domain, req.subject, req.body, db_rules)

    # Check built-in rules
    if domain in BUILTIN_DOMAIN_RULES:
        label, category = BUILTIN_DOMAIN_RULES[domain]
        matches.append(
            {
                "rule_type": "builtin_domain",
                "source": "builtin",
                "matched_value": domain,
                "label": label.value,
                "category": category,
                "confidence": 0.92,
                "enabled": True,
            }
        )

    # Check user SenderRules (including disabled ones, marked accordingly)
    user_rules = (
        (
            await db.execute(
                select(SenderRule).where(SenderRule.sender_domain == domain, SenderRule.user_id == current_user.id)
            )
        )
        .scalars()
        .all()
    )
    for sr in user_rules:
        matches.append(
            {
                "rule_type": "sender_domain",
                "source": sr.source,
                "matched_value": sr.sender_domain,
                "label": sr.label,
                "category": sr.category,
                "confidence": 0.98,
                "enabled": sr.enabled,
            }
        )

    # Check PatternRules (enabled)
    pattern_rules = (await db.execute(select(PatternRule).where(PatternRule.enabled))).scalars().all()
    for pr in pattern_rules:
        try:
            if re.search(pr.regex_pattern, text, re.IGNORECASE):
                matches.append(
                    {
                        "rule_type": "pattern",
                        "source": pr.source,
                        "matched_value": pr.regex_pattern,
                        "label": pr.label,
                        "merchant": pr.merchant,
                        "category": pr.category,
                        "confidence": pr.confidence,
                        "enabled": True,
                    }
                )
        except re.error:
            pass

    # Check MerchantAliases
    merchant_hits = []
    for raw_name, info in MERCHANT_MAP.items():
        if raw_name in text:
            merchant_hits.append(
                {
                    "rule_type": "merchant_alias",
                    "source": "builtin",
                    "matched_value": raw_name,
                    "label": "expense",
                    "category": info["category"],
                    "confidence": 1.0,
                    "enabled": True,
                }
            )
    if merchant_hits:
        matches.extend(merchant_hits)

    # Determine the classification result
    primary = None
    if result.label:
        primary = {
            "label": result.label.value,
            "confidence": result.confidence,
            "category": result.category,
            "merchant": result.merchant,
        }

    return {
        "matches": matches,
        "classification": primary,
    }
