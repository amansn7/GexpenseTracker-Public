import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)


class FetchPreviewBody(BaseModel):
    limit: int = 10
    query: str = "newer_than:7d"


@router.post("/admin/fetch-preview")
async def fetch_preview(body: FetchPreviewBody):
    """Fetch N emails from Gmail for inspection — no DB writes."""
    if not (1 <= body.limit <= 100):
        raise HTTPException(status_code=422, detail="limit must be 1–100")
    try:
        from app.gmail.client import _build_service, _extract_body_text, extract_domain, get_gmail_link
        from datetime import datetime, timezone

        service = await asyncio.to_thread(_build_service)
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
        raise HTTPException(status_code=503, detail=str(exc))


class ClassifyTestBody(BaseModel):
    sender: str
    subject: str
    body: str
    email_id: Optional[str] = None


@router.post("/admin/classify-test")
async def classify_test(body: ClassifyTestBody):
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
