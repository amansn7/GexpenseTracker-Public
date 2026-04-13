from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models import SenderRule, RuleSource
from app.classifier.rules import BUILTIN_SENDER_RULES

router = APIRouter()

BUILTIN_LIST = [
    {
        "sender_domain": domain,
        "label": label.value,
        "category": category,
        "source": "builtin",
        "editable": False,
    }
    for domain, (label, category) in sorted(BUILTIN_SENDER_RULES.items())
]


class RuleBody(BaseModel):
    sender_domain: str
    label: str           # expense | income | ignore
    category: Optional[str] = None


@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db)):
    """Return builtin rules + user-defined rules. User rules override builtins."""
    user_rows = (await db.execute(select(SenderRule))).scalars().all()
    user_domains = {r.sender_domain for r in user_rows}

    # Builtins not overridden by user
    builtin = [r for r in BUILTIN_LIST if r["sender_domain"] not in user_domains]

    user = [
        {
            "sender_domain": r.sender_domain,
            "label": r.label,
            "category": r.category,
            "source": r.source,
            "editable": True,
        }
        for r in sorted(user_rows, key=lambda x: x.sender_domain)
    ]

    return {"builtin": builtin, "user": user}


@router.post("/rules", status_code=201)
async def create_rule(body: RuleBody, db: AsyncSession = Depends(get_db)):
    """Create or update a user-defined sender rule."""
    domain = body.sender_domain.lower().strip()
    if not domain:
        raise HTTPException(status_code=422, detail="sender_domain is required")
    if body.label not in ("expense", "income", "ignore"):
        raise HTTPException(status_code=422, detail="label must be expense, income, or ignore")

    existing = (await db.execute(
        select(SenderRule).where(SenderRule.sender_domain == domain)
    )).scalar_one_or_none()

    if existing:
        existing.label = body.label
        existing.category = body.category
        existing.source = RuleSource.user_trained.value
    else:
        db.add(SenderRule(
            sender_domain=domain,
            label=body.label,
            category=body.category,
            source=RuleSource.user_trained.value,
        ))

    await db.commit()
    return {"sender_domain": domain, "label": body.label, "category": body.category}


@router.delete("/rules/{domain:path}")
async def delete_rule(domain: str, db: AsyncSession = Depends(get_db)):
    """Delete a user-defined rule. Builtin rules cannot be deleted (only overridden)."""
    row = (await db.execute(
        select(SenderRule).where(SenderRule.sender_domain == domain)
    )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.execute(delete(SenderRule).where(SenderRule.sender_domain == domain))
    await db.commit()
    return {"deleted": domain}
