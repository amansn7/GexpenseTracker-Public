import asyncio
import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth_deps import get_current_user, is_owner
from app.database import get_db
from app.models import User, UserRole
from app.audit import log_audit

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_owner(current_user: User = Depends(get_current_user)) -> User:
    if not is_owner(current_user):
        raise HTTPException(status_code=403, detail="Owner only")
    return current_user


class FetchPreviewBody(BaseModel):
    limit: int = 10
    query: str = "newer_than:7d"


class SeedMerchantsBody(BaseModel):
    merchants: dict[str, Any]  # raw merchant_db.json "merchants" dict


@router.post("/admin/fetch-preview")
async def fetch_preview(
    body: FetchPreviewBody,
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Fetch N emails from Gmail for inspection — no DB writes."""
    if not (1 <= body.limit <= 100):
        raise HTTPException(status_code=422, detail="limit must be 1–100")
    try:
        from app.gmail.client import _build_service, _extract_body_text, extract_domain, get_gmail_link
        from app.gmail.auth import get_credentials_for_user
        from datetime import datetime, timezone

        creds = await get_credentials_for_user(db, current_user.id)
        service = await asyncio.to_thread(lambda: _build_service(creds))
        results = await asyncio.to_thread(
            lambda: service.users().messages().list(
                userId="me", q=body.query, maxResults=body.limit
            ).execute()
        )
        message_ids = [m["id"] for m in results.get("messages", [])]

        emails = []
        for msg_id in message_ids:
            try:
                msg = await asyncio.to_thread(
                    lambda mid=msg_id: service.users().messages().get(
                        userId="me", id=mid, format="full"
                    ).execute()
                )
                headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
                sender = headers.get("From", "")
                body_text = _extract_body_text(msg.get("payload", {}))
                emails.append({
                    "gmail_id": msg_id,
                    "subject": headers.get("Subject", ""),
                    "sender": sender,
                    "sender_domain": extract_domain(sender),
                    "received_at": datetime.fromtimestamp(
                        int(msg["internalDate"]) / 1000, tz=timezone.utc
                    ).isoformat(),
                    "snippet": msg.get("snippet", "")[:200],
                    "body_chars": len(body_text),
                    "gmail_link": get_gmail_link(msg_id),
                })
            except Exception as exc:
                logger.warning("fetch-preview: skipping %s: %s", msg_id, exc)

        return {"count": len(emails), "emails": emails}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("fetch-preview failed: %s", exc)
        raise HTTPException(status_code=503, detail="Upstream fetch failed")


class ClassifyTestBody(BaseModel):
    sender: str
    subject: str
    body: str
    email_id: Optional[str] = None
    use_llm: bool = True


@router.post("/admin/classify-test")
async def classify_test(
    body: ClassifyTestBody,
    current_user: User = Depends(_require_owner),
):
    """Run classification pipeline on raw inputs — no DB writes."""
    from app.gmail.client import extract_domain
    from app.classifier.classifier import classify_email
    from app.classifier.context import ClassificationContext

    sender_domain = extract_domain(body.sender)
    result = await classify_email(
        ClassificationContext(
            email_id=body.email_id,
            sender=body.sender,
            sender_domain=sender_domain,
            subject=body.subject,
            body_text=body.body,
            session=None,
            use_llm=body.use_llm,
        )
    )
    return {
        "label": result.label.value,
        "amount": result.amount,
        "merchant": result.merchant,
        "category": result.category,
        "txn_date": result.txn_date.isoformat() if result.txn_date else None,
        "confidence": result.confidence,
        "status": result.status.value,
        "classifier_method": result.classifier_method.value,
        "sender_domain": sender_domain,
    }


@router.post("/admin/seed-merchants")
async def seed_merchants(
    body: SeedMerchantsBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_owner),
):
    """Seed merchant→category mappings from ExpenseRuleEngine merchant_db.json merchants dict."""
    from app.models import MerchantAlias
    from sqlalchemy import select

    seeded = 0
    skipped = 0
    for raw, info in body.merchants.items():
        key = raw.strip().lower()
        category = info.get("category")
        if not key or not category:
            skipped += 1
            continue
        existing = (await db.execute(
            select(MerchantAlias).where(MerchantAlias.canonical == key)
        )).scalar_one_or_none()
        if existing:
            existing.hit_count += info.get("count", 0)
            if not existing.category:
                existing.category = category
            skipped += 1
        else:
            db.add(MerchantAlias(
                raw=key, canonical=key, category=category,
                source="seeded", hit_count=info.get("count", 1),
            ))
            seeded += 1
    await db.commit()
    logger.info("seed-merchants: seeded=%d skipped=%d", seeded, skipped)

    await log_audit(
        db,
        action="seed_merchants",
        user_id=str(current_user.id),
        resource_type="merchant",
        details=f"seeded={seeded} skipped={skipped}",
        ip_address=request.client.host if request.client else None,
    )

    return {"seeded": seeded, "skipped": skipped}


class TestProviderBody(BaseModel):
    provider: str
    is_user_service: bool = False
    service_id: Optional[str] = None
    prompt: Optional[str] = None


@router.post("/admin/test-provider")
async def test_provider(
    body: TestProviderBody,
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Test a specific LLM provider with a simple prompt."""
    from app.classifier.llm_client import MultiLLMClient

    client = MultiLLMClient(user_id=current_user.id)

    if body.is_user_service:
        from app.crypto import decrypt_ai_secret
        from app.models import UserAIService
        from sqlalchemy import select
        query = select(UserAIService).where(
            UserAIService.user_id == current_user.id,
            UserAIService.enabled == True,
        )
        if body.service_id:
            query = query.where(UserAIService.id == body.service_id)
        else:
            query = query.where(UserAIService.provider == body.provider)

        svc = (await db.execute(query)).scalar_one_or_none()
        if not svc:
            return {"error": "User service not found"}
        if not svc.encrypted_api_key:
            return {"error": "User service has no API key"}

        from app.classifier.llm_client import build_user_client

        api_key = decrypt_ai_secret(svc.encrypted_api_key)
        client = build_user_client(
            user_id=current_user.id,
            provider=svc.provider,
            base_url=svc.base_url,
            api_key=api_key,
            model_id=svc.model_id,
        )

    if not client._providers:
        return {"error": "No providers available"}

    test_prompt = body.prompt or "Say 'OK' if you receive this."

    try:
        ranked = client._ranked_providers()
        if not ranked:
            return {"error": "No available providers"}

        p = ranked[0]
        result = await client._call_provider_raw(p, test_prompt)
        return {"provider": p.name, "model": p.model, "response": result}
    except Exception as e:
        return {"error": str(e)}


@router.post("/admin/reset-my-data")
async def reset_my_data(
    request: Request,
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """
    Reset the owner's data back to first-time-onboarding state.
    Keeps: user credentials, system classification rules (filter_rules, sender_rules, etc.)
    Clears: transactions, emails, connected accounts, AI services, settings, sessions.
    """
    from sqlalchemy import text
    uid = str(current_user.id)

    wipe = [
        "DELETE FROM classification_log WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = :uid)",
        "DELETE FROM duplicate_pairs       WHERE user_id = :uid",
        "DELETE FROM transactions          WHERE user_id = :uid",
        "DELETE FROM emails                WHERE user_id = :uid",
        "DELETE FROM sync_state",
        "DELETE FROM budgets               WHERE user_id = :uid",
        "DELETE FROM debts                 WHERE user_id = :uid",
        "DELETE FROM recurring_expenses    WHERE user_id = :uid",
        "DELETE FROM user_merchant_overrides WHERE user_id = :uid",
        "DELETE FROM user_ai_services      WHERE user_id = :uid",
        "DELETE FROM user_categories       WHERE user_id = :uid",
        "DELETE FROM connected_accounts    WHERE user_id = :uid",
        "DELETE FROM sessions              WHERE user_id = :uid",
        "DELETE FROM user_profiles         WHERE user_id = :uid",
    ]
    deleted = {}
    for sql in wipe:
        table = sql.split("FROM")[1].strip().split()[0]
        r = await db.execute(text(sql), {"uid": uid})
        if r.rowcount:
            deleted[table] = r.rowcount

    await db.execute(text("""
        UPDATE user_settings SET
            active_ai_service_id  = NULL,
            monthly_ai_budget     = NULL,
            auto_categorize       = TRUE,
            use_rule_engine       = TRUE,
            show_confidence       = FALSE,
            daily_digest          = FALSE,
            low_confidence_alerts = FALSE
        WHERE user_id = :uid
    """), {"uid": uid})

    await db.execute(
        text("UPDATE users SET onboarding_complete = FALSE WHERE id = :uid"),
        {"uid": uid},
    )

    await db.commit()

    await log_audit(
        db,
        action="reset_my_data",
        user_id=uid,
        resource_type="user",
        resource_id=uid,
        details=f"Deleted tables: {list(deleted.keys())}",
        ip_address=request.client.host if request.client else None,
    )

    return {"ok": True, "deleted": deleted, "message": "Data reset. Reload the app to start onboarding."}


@router.get("/admin/domain-rules")
async def list_domain_rules(
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Return current domain rules: built-in + learned from data."""
    from app.classifier.rules import BUILTIN_DOMAIN_RULES, build_domain_rules

    builtin = [{"domain": d, "label": l.value, "category": c} for d, (l, c) in BUILTIN_DOMAIN_RULES.items()]
    learned = await build_domain_rules(db)
    learned_list = [{"domain": d, "label": l.value, "category": c} for d, (l, c) in learned.items()]
    return {"builtin": builtin, "learned": learned_list}


@router.post("/admin/generate-domain-rules")
async def generate_domain_rules(
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Run build_domain_rules and return what was generated."""
    from app.classifier.rules import build_domain_rules

    rules = await build_domain_rules(db)
    return {
        "count": len(rules),
        "rules": [{"domain": d, "label": l.value, "category": c} for d, (l, c) in rules.items()],
    }


@router.get("/admin/sender-rules")
async def list_sender_rules(
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Return all SenderRule entries (user-trained corrections)."""
    from sqlalchemy import select
    from app.models.financial import SenderRule

    rows = (await db.execute(
        select(SenderRule).order_by(SenderRule.created_at.desc()).limit(100)
    )).scalars().all()
    return {
        "count": len(rows),
        "rules": [
            {
                "id": r.id,
                "sender_domain": r.sender_domain,
                "label": r.label,
                "category": r.category,
                "source": r.source.value if r.source else None,
                "enabled": r.enabled,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


@router.get("/admin/audit-logs")
async def list_audit_logs(
    skip: int = 0,
    limit: int = 50,
    action: Optional[str] = None,
    current_user: User = Depends(_require_owner),
    db: AsyncSession = Depends(get_db),
):
    """Return audit log entries."""
    from sqlalchemy import select
    from app.models import AuditLog

    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        query = query.where(AuditLog.action == action)

    total_q = await db.execute(select(AuditLog.id))
    total = len(total_q.all())

    rows = (await db.execute(query.offset(skip).limit(limit))).scalars().all()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "action": r.action,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "details": r.details,
                "ip_address": r.ip_address,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
