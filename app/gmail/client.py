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


def _extract_body_text(payload: dict) -> str:
    """Extract plain text from a Gmail message payload. Walks MIME parts recursively."""
    def _find_plain(part: dict) -> str:
        if part.get("mimeType") == "text/plain":
            data = part.get("body", {}).get("data", "")
            if data:
                # Gmail uses URL-safe base64; pad to multiple of 4
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
        for subpart in part.get("parts", []):
            result = _find_plain(subpart)
            if result:
                return result
        return ""

    text = _find_plain(payload)
    text = re.sub(r'\n{3,}', '\n\n', text)   # collapse blank lines
    text = re.sub(r'[ \t]+', ' ', text)        # collapse horizontal whitespace
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


def fetch_new_messages(last_history_id, email_filter: str = "all"):
    """
    Returns (messages, new_history_id).
    last_history_id=None triggers full 90-day fetch.

    email_filter: "all" | "unread" | "read"

    Each message dict keys:
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, body_text, gmail_link
    """
    service = _build_service()

    if last_history_id is None:
        query = "newer_than:90d"
        if email_filter == "unread":
            query += " is:unread"
        elif email_filter == "read":
            query += " is:read"

        results = service.users().messages().list(
            userId="me", q=query, maxResults=500
        ).execute()
        message_ids = [m["id"] for m in results.get("messages", [])]
        profile = service.users().getProfile(userId="me").execute()
        new_history_id = str(profile["historyId"])
    else:
        try:
            history = service.users().history().list(
                userId="me",
                startHistoryId=last_history_id,
                historyTypes=["messageAdded"],
            ).execute()
            # Filter by read/unread via labelIds on each added message
            message_ids = [
                msg["message"]["id"]
                for record in history.get("history", [])
                for msg in record.get("messagesAdded", [])
                if _passes_filter(msg["message"], email_filter)
            ]
            new_history_id = str(history.get("historyId", last_history_id))
        except Exception:
            # History expired — fall back to full fetch
            return fetch_new_messages(None, email_filter)

    messages = []
    skipped = 0
    for msg_id in message_ids:
        try:
            msg = service.users().messages().get(
                userId="me", id=msg_id, format="full",
            ).execute()
        except HttpError as e:
            if e.resp.status == 404:
                # Message was deleted / moved to trash between list and get — skip it
                logger.debug("Message %s not found (deleted/trashed), skipping", msg_id)
                skipped += 1
                continue
            raise  # re-raise unexpected errors

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

    return messages, new_history_id
