import re
from datetime import datetime, timezone
from googleapiclient.discovery import build
from app.gmail.auth import get_credentials

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

def fetch_new_messages(last_history_id):
    """
    Returns (messages, new_history_id).
    last_history_id=None triggers full 90-day fetch.

    Each message dict keys:
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, gmail_link
    """
    service = _build_service()

    if last_history_id is None:
        results = service.users().messages().list(
            userId="me", q="newer_than:90d", maxResults=500
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
            message_ids = [
                msg["message"]["id"]
                for record in history.get("history", [])
                for msg in record.get("messagesAdded", [])
            ]
            new_history_id = str(history.get("historyId", last_history_id))
        except Exception:
            # History expired — fall back to full fetch
            return fetch_new_messages(None)

    messages = []
    for msg_id in message_ids:
        msg = service.users().messages().get(
            userId="me", id=msg_id, format="metadata",
            metadataHeaders=["From", "Subject", "Date"],
        ).execute()
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
            "gmail_link": get_gmail_link(msg_id),
        })

    return messages, new_history_id
