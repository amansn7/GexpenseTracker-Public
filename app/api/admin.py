import asyncio
import logging
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth_deps import get_current_user
from app.database import get_db
from app.models import User, UserRole

router = APIRouter()
logger = logging.getLogger(__name__)


def _require_owner(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "owner":
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

    sender_domain = extract_domain(body.sender)
    result = await classify_email(
        email_id=body.email_id,
        sender=body.sender,
        sender_domain=sender_domain,
        subject=body.subject,
        body_text=body.body,
        session=None,
        use_llm=body.use_llm,
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
        from app.models import UserAIService
        from app.api._account_helpers import _decrypt_secret
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

        api_key = _decrypt_secret(svc.encrypted_api_key)
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
        result = await p.client.chat.completions.create(
            model=p.model,
            messages=[{"role": "user", "content": test_prompt}],
            max_tokens=10,
        )
        return {"provider": p.name, "model": p.model, "response": result.choices[0].message.content}
    except Exception as e:
        return {"error": str(e)}
