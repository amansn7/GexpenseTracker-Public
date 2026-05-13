import base64
import html as html_module
import logging
import re
from datetime import datetime, timezone
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials
from app.gmail.auth import get_credentials

logger = logging.getLogger(__name__)

def extract_domain(sender: str) -> str:
    match = re.search(r"@([\w.-]+)", sender)
    return match.group(1).lower() if match else ""

def get_gmail_link(gmail_id: str) -> str:
    return f"https://mail.google.com/mail/u/0/#inbox/{gmail_id}"

def _build_service(creds: Credentials | None = None):
    creds = creds or get_credentials()
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
    """HTML → plain text suitable for LLM input. Removes noise aggressively."""
    html = re.sub(r'<head[^>]*>.*?</head>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<(style|script)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<!--.*?-->', ' ', html, flags=re.DOTALL)
    html = re.sub(r'<img[^>]*>', ' ', html, flags=re.IGNORECASE)
    html = re.sub(r'<(br|p|div|tr|li|h[1-6]|td|th)[^>]*>', '\n', html, flags=re.IGNORECASE)
    html = re.sub(r'<[^>]+>', ' ', html)
    return html


_INVISIBLE_CHARS_RE = re.compile(
    r'[\u200b-\u200f\u2028-\u202f\u205f\u2060-\u2064\ufeff\u034f\u00ad\u200c\u200d]'
)


def _clean_body(text: str) -> str:
    """Decode HTML entities + strip invisible Unicode chars + normalize whitespace."""
    text = html_module.unescape(text)
    text = text.replace("&INR;", "₹")
    text = _INVISIBLE_CHARS_RE.sub('', text)
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'^[ \t]+|[ \t]+$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n[ \t]*\n', '\n', text)
    text = re.sub(r'\n{2,}', '\n', text)
    return text.strip()[:4000]


def _extract_body_text(payload: dict) -> str:
    """
    Extract readable text from a Gmail message payload.
    Prefers text/plain; falls back to text/html (stripped) for HTML-only emails.
    Walks MIME parts recursively.
    """
    plain_parts: list[str] = []
    html_parts: list[str] = []

    def _walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        if mime == "text/plain":
            t = _decode_part(part)
            if t.strip():
                plain_parts.append(t)
        elif mime == "text/html":
            t = _decode_part(part)
            if t.strip():
                html_parts.append(t)
        for subpart in part.get("parts", []):
            _walk(subpart)

    _walk(payload)

    if plain_parts:
        text = "\n\n".join(plain_parts)
    elif html_parts:
        text = _strip_html("\n\n".join(html_parts))
    else:
        return ""

    return _clean_body(text)


def _passes_filter(msg: dict, email_filter: str) -> bool:
    """Return True if message matches the email_filter setting."""
    if email_filter in ("all", "financial"):
        return True
    label_ids = msg.get("labelIds", [])
    if email_filter == "unread":
        return "UNREAD" in label_ids
    if email_filter == "read":
        return "UNREAD" not in label_ids
    return True


# Financial relevance filter — used when email_filter == "financial"
# Gmail search operators appended to the query to pre-filter at server level
_FINANCIAL_GMAIL_QUERY = (
    "(subject:debited OR subject:credited OR subject:transaction OR "
    "subject:payment OR subject:UPI OR subject:NEFT OR subject:IMPS OR subject:RTGS OR "
    "subject:salary OR subject:cashback OR subject:refund OR subject:EMI OR "
    "subject:\"Rs.\" OR subject:INR OR subject:transfer)"
)

# Compiled regex for fast pre-storage check (catches history API path where query filter isn't applied)
_FINANCIAL_RE = re.compile(
    r"\b(debit|credit|transaction|payment|UPI|NEFT|IMPS|RTGS|NACH|salary|cashback|refund|"
    r"EMI|transfer|charged|purchased|spent|received|deposited|withdrawn|"
    r"Rs\.?\s*\d|INR\s*\d|\d\s*(?:INR|Rs))\b",
    re.IGNORECASE,
)

_FINANCIAL_DOMAINS = {
    "hdfcbank.com", "axisbank.com", "sbi.co.in", "icicibank.com", "kotak.com",
    "yesbank.in", "indusind.com", "idfcfirstbank.com", "rbl.co.in", "federalbank.co.in",
    "paytm.com", "phonepe.com", "gpay.com", "googlepay.com", "amazonpay.in",
    "npci.org.in", "razorpay.com", "cashfree.com", "billdesk.com", "mobikwik.com",
    "freecharge.in", "pnbindia.in", "canarabank.in", "unionbankofindia.co.in",
    "bankofbaroda.in", "upi.npci.org.in",
}


def is_likely_financial(subject: str, snippet: str, sender_domain: str) -> bool:
    """Return True if email looks like a financial transaction notification."""
    if sender_domain in _FINANCIAL_DOMAINS:
        return True
    text = f"{subject} {snippet}"
    return bool(_FINANCIAL_RE.search(text))


_FETCH_CONCURRENCY = 40  # Gmail quota: messages.get is 5 units; stay well under 250/sec burst

def fetch_new_messages(
    last_history_id,
    email_filter: str = "all",
    creds: Credentials | None = None,
    after_date: str | None = None,
    before_date: str | None = None,
):
    """
    Returns (messages, new_history_id).
    last_history_id=None triggers full 90-day fetch with pagination.

    email_filter: "all" | "unread" | "read"

    Each message dict keys:
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, body_text, gmail_link
    """
    import time
    service = _build_service(creds)

    if last_history_id is None or after_date is not None:
        if after_date is not None:
            query = f"after:{after_date}"
            if before_date:
                query += f" before:{before_date}"
        else:
            query = "newer_than:90d"
            if email_filter == "unread":
                query += " is:unread"
            elif email_filter == "read":
                query += " is:read"
            elif email_filter == "financial":
                query += f" {_FINANCIAL_GMAIL_QUERY}"

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

        if after_date is not None:
            new_history_id = last_history_id
        else:
            profile = service.users().getProfile(userId="me").execute()
            new_history_id = str(profile["historyId"])
    else:
        try:
            history = service.users().history().list(
                userId="me",
                startHistoryId=last_history_id,
                historyTypes=["messageAdded"],
            ).execute()
            # History API returns minimal message objects (id + threadId only),
            # so we can't filter by labelIds here. Collect all ids and filter
            # after fetching the full message below.
            message_ids = [
                msg["message"]["id"]
                for record in history.get("history", [])
                for msg in record.get("messagesAdded", [])
            ]
            new_history_id = str(history.get("historyId", last_history_id))
        except HttpError as e:
            # 404 = historyId too old (expired), 410 = Gone — both warrant a full re-fetch
            if e.resp.status in (404, 410):
                logger.warning("History ID expired (status %s), falling back to full fetch", e.resp.status)
                return fetch_new_messages(None, email_filter, creds)
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

        if not _passes_filter(msg, email_filter):
            skipped += 1
            continue

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
