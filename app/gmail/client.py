import base64
import logging
import re
from datetime import datetime, timezone
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from app.gmail.auth import get_credentials

logger = logging.getLogger(__name__)

def extract_domain(sender: str) -> str:
    match = re.search(r"@([\w.-]+)", sender)
    return match.group(1).lower() if match else ""

def get_gmail_link(gmail_id: str) -> str:
    return f"https://mail.google.com/mail/u/0/#inbox/{gmail_id}"

def _build_service():
    creds = get_credentials()
    if not creds:
        raise RuntimeError("Gmail not authenticated. Visit /api/auth/gmail")
    return build("gmail", "v1", credentials=creds)


def _decode_part(part: dict) -> str:
    """Base64-decode a Gmail MIME part body."""
    data = part.get("body", {}).get("data", "")
    if not data:
        return ""
    padding = (4 - len(data) % 4) % 4
    return base64.urlsafe_b64decode(data + "=" * padding).decode("utf-8", errors="replace")


def _strip_html(html: str) -> str:
    """Very lightweight HTML → plain text: strip tags, decode entities."""
    # Remove style/script blocks entirely
    html = re.sub(r'<(style|script)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    # Replace block-level tags with newlines
    html = re.sub(r'<(br|p|div|tr|li|h[1-6])[^>]*>', '\n', html, flags=re.IGNORECASE)
    # Strip remaining tags
    html = re.sub(r'<[^>]+>', ' ', html)
    # Decode common HTML entities
    for ent, ch in [('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'),
                    ('&nbsp;', ' '), ('&#39;', "'"), ('&quot;', '"')]:
        html = html.replace(ent, ch)
    return html


def _extract_body_text(payload: dict) -> str:
    """
    Extract readable text from a Gmail message payload.
    Prefers text/plain only.
    Walks MIME parts recursively.
    """
    plain_parts: list[str] = []

    def _walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        if mime == "text/plain":
            t = _decode_part(part)
            if t.strip():
                plain_parts.append(t)
        for subpart in part.get("parts", []):
            _walk(subpart)

    _walk(payload)

    if plain_parts:
        text = "\n\n".join(plain_parts)
    else:
        return ""

    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()[:4000]


def _passes_filter(msg: dict, email_filter: str) -> bool:
    """Return True if message matches the email_filter setting."""
    if email_filter == "all":
        return True
    label_ids = msg.get("labelIds", [])
    if email_filter == "unread":
        return "UNREAD" in label_ids
    if email_filter == "read":
        return "UNREAD" not in label_ids
    return True


_FETCH_CONCURRENCY = 40  # Gmail quota: messages.get is 5 units; stay well under 250/sec burst

def fetch_new_messages(last_history_id, email_filter: str = "all"):
    """
    Returns (messages, new_history_id).
    last_history_id=None triggers full 90-day fetch with pagination.

    email_filter: "all" | "unread" | "read"

    Each message dict keys:
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, body_text, gmail_link
    """
    import time
    service = _build_service()

    if last_history_id is None:
        query = "newer_than:90d"
        if email_filter == "unread":
            query += " is:unread"
        elif email_filter == "read":
            query += " is:read"

        # Paginate through all results, not just the first 500
        message_ids = []
        page_token = None
        while True:
            kwargs = {"userId": "me", "q": query, "maxResults": 500}
            if page_token:
                kwargs["pageToken"] = page_token
            results = service.users().messages().list(**kwargs).execute()
            message_ids.extend(m["id"] for m in results.get("messages", []))
            page_token = results.get("nextPageToken")
            if not page_token:
                break

        profile = service.users().getProfile(userId="me").execute()
        new_history_id = str(profile["historyId"])
    else:
        try:
            history = service.users().history().list(
                userId="me",
                startHistoryId=last_history_id,
                historyTypes=["messageAdded"],
            ).execute()
            message_ids = [
                msg["message"]["id"]
                for record in history.get("history", [])
                for msg in record.get("messagesAdded", [])
                if _passes_filter(msg["message"], email_filter)
            ]
            new_history_id = str(history.get("historyId", last_history_id))
        except HttpError as e:
            # 404 = historyId too old (expired), 410 = Gone — both warrant a full re-fetch
            if e.resp.status in (404, 410):
                logger.warning("History ID expired (status %s), falling back to full fetch", e.resp.status)
                return fetch_new_messages(None, email_filter)
            raise

    messages = []
    skipped = 0
    for i, msg_id in enumerate(message_ids):
        # Throttle to avoid exceeding Gmail's 250 quota-units/sec burst limit
        if i > 0 and i % _FETCH_CONCURRENCY == 0:
            time.sleep(1)

        try:
            msg = service.users().messages().get(
                userId="me", id=msg_id, format="full",
            ).execute()
        except HttpError as e:
            if e.resp.status == 404:
                logger.debug("Message %s not found (deleted/trashed), skipping", msg_id)
                skipped += 1
                continue
            raise

        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        sender = headers.get("From", "")
        messages.append({
            "gmail_id": msg_id,
            "subject": headers.get("Subject", ""),
            "sender": sender,
            "sender_domain": extract_domain(sender),
            "received_at": datetime.fromtimestamp(
                int(msg["internalDate"]) / 1000, tz=timezone.utc
            ),
            "body_snippet": msg.get("snippet", "")[:500],
            "body_text": _extract_body_text(msg.get("payload", {})),
            "gmail_link": get_gmail_link(msg_id),
        })

    if skipped:
        logger.info("Skipped %d message(s) that were deleted/trashed since listing", skipped)

    logger.info("Fetched %d messages (%d skipped)", len(messages), skipped)
    return messages, new_history_id
