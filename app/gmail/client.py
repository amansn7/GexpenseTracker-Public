import asyncio
import base64
import html as html_module
import logging
import re
from datetime import UTC, datetime

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.config import settings
from app.gmail.auth import get_credentials

logger = logging.getLogger(__name__)

# Retry configuration for transient Gmail API errors
_MAX_RETRIES = 3
_RETRYABLE_STATUS = {500, 502, 503, 504, 429}  # Server errors + rate limit
_RETRY_BACKOFF_BASE = 2  # seconds


async def _async_retry_with_backoff(func, max_retries=_MAX_RETRIES):
    """Execute func (sync callable) with exponential backoff for retryable errors."""
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return await asyncio.to_thread(func)
        except HttpError as exc:
            if exc.resp.status in _RETRYABLE_STATUS and attempt < max_retries:
                wait = _RETRY_BACKOFF_BASE**attempt
                if exc.resp.status == 429:
                    retry_after = exc.resp.get("retry-after")
                    if retry_after:
                        wait = max(wait, int(retry_after))
                logger.warning(
                    "Gmail API error %s (attempt %d/%d), retrying in %ds",
                    exc.resp.status,
                    attempt + 1,
                    max_retries,
                    wait,
                )
                await asyncio.sleep(wait)
                last_exc = exc
                continue
            raise
        except OSError as exc:
            if attempt < max_retries:
                wait = _RETRY_BACKOFF_BASE**attempt
                logger.warning(
                    "Gmail API connection error (attempt %d/%d), retrying in %ds: %s",
                    attempt + 1,
                    max_retries,
                    wait,
                    exc,
                )
                await asyncio.sleep(wait)
                last_exc = exc
                continue
            raise
    raise last_exc


def extract_domain(sender: str) -> str:
    match = re.search(r"@([\w.-]+)", sender)
    return match.group(1).lower() if match else ""


def get_gmail_link(gmail_id: str) -> str:
    return f"https://mail.google.com/mail/u/0/#inbox/{gmail_id}"


def _build_service(creds: Credentials | None = None):
    import httplib2
    from google_auth_httplib2 import AuthorizedHttp

    creds = creds or get_credentials()
    if not creds:
        raise RuntimeError("Gmail not authenticated. Visit /api/auth/gmail")
    # httplib2 with explicit timeout and NO retries
    http_transport = httplib2.Http(timeout=30)
    http_transport.num_retries = 0
    http = AuthorizedHttp(creds, http=http_transport)
    return build("gmail", "v1", http=http)


def _decode_part(part: dict) -> str:
    """Base64-decode a Gmail MIME part body."""
    data = part.get("body", {}).get("data", "")
    if not data:
        return ""
    padding = (4 - len(data) % 4) % 4
    return base64.urlsafe_b64decode(data + "=" * padding).decode("utf-8", errors="replace")


def _strip_html(html: str) -> str:
    """HTML → plain text suitable for LLM input. Removes noise aggressively."""
    html = re.sub(r"<head[^>]*>.*?</head>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<(style|script)[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.DOTALL)
    html = re.sub(r"<img[^>]*>", " ", html, flags=re.IGNORECASE)
    html = re.sub(r"<(br|p|div|tr|li|h[1-6]|td|th)[^>]*>", "\n", html, flags=re.IGNORECASE)
    html = re.sub(r"<[^>]+>", " ", html)
    return html


_INVISIBLE_CHARS_RE = re.compile(r"[\u200b-\u200f\u2028-\u202f\u205f\u2060-\u2064\ufeff\u034f\u00ad\u200c\u200d]")

_AMOUNT_PRESENT_RE = re.compile(r"(?:Rs\.?|INR|₹|Amount|Total|Payment)\s*\d", re.IGNORECASE)

_BOILERPLATE_PATTERNS = [
    re.compile(r, re.IGNORECASE)
    for r in [
        r"if this transaction was not initiated by you",
        r"to block (?:upi|card|account)",
        r"call us at",
        r"always open to help you",
        r"system generated (?:communication|message)",
        r"reach us at",
        r"please do not share your",
        r"rbi never deals with individuals",
        r"do not click on links",
        r"this e[\-_]?mail is confidential",
        r"copyright\s+\w+.*all rights reserved",
        r"terms\s*&\s*conditions apply",
        r"do not reply",
        r"this is an auto[\- ]generated",
        r"for (?:any\s+)?queries",
        r"thank you for (?:being|choosing)",
        r"to (?:unsubscribe|manage preferences)",
        r"to check your available balance",
    ]
]


def _truncate_after_transaction(text: str) -> str:
    """
    Find the last UPI/IMPS/NEFT/RTGS reference and truncate everything
    from the first boilerplate signpost after it.
    Handles compact single-line emails where boilerplate follows the
    transaction ref on the same line (e.g. Axis Bank IMPS format).
    """
    last_pos = -1
    for kw in ("UPI/", "IMPS/", "NEFT/", "RTGS/", "NACH/"):
        pos = text.rfind(kw)
        if pos > last_pos:
            last_pos = pos

    if last_pos < 0:
        m = _AMOUNT_PRESENT_RE.search(text)
        if m:
            return text[: m.end() + 150].strip()
        return text

    rest = text[last_pos:]
    earliest = len(rest)
    for p in _BOILERPLATE_PATTERNS:
        m = p.search(rest)
        if m and m.start() < earliest:
            earliest = m.start()

    if earliest < len(rest):
        return text[: last_pos + earliest].rstrip()
    return text


def _strip_footer(text: str) -> str:
    """Remove boilerplate/footer lines starting from the first signpost match."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if any(p.search(line) for p in _BOILERPLATE_PATTERNS):
            return "\n".join(lines[:i])
    return text


def _clean_body(text: str) -> str:
    """Decode HTML entities + strip invisible Unicode chars + normalize whitespace + strip boilerplate."""
    text = html_module.unescape(text)
    text = text.replace("&INR;", "₹")
    text = _INVISIBLE_CHARS_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"^[ \t]+|[ \t]+$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n[ \t]*\n", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    text = _truncate_after_transaction(text)
    text = _strip_footer(text)
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
    'subject:"Rs." OR subject:INR OR subject:transfer)'
)

# Compiled regex for fast pre-storage check (catches history API path where query filter isn't applied)
_FINANCIAL_RE = re.compile(
    r"\b(debit|credit|transaction|payment|UPI|NEFT|IMPS|RTGS|NACH|salary|cashback|refund|"
    r"EMI|transfer|charged|purchased|spent|received|deposited|withdrawn|"
    r"Rs\.?\s*\d|INR\s*\d|\d\s*(?:INR|Rs))\b",
    re.IGNORECASE,
)

_FINANCIAL_DOMAINS = {
    "hdfcbank.com",
    "axisbank.com",
    "sbi.co.in",
    "icicibank.com",
    "kotak.com",
    "yesbank.in",
    "indusind.com",
    "idfcfirstbank.com",
    "rbl.co.in",
    "federalbank.co.in",
    "paytm.com",
    "phonepe.com",
    "gpay.com",
    "googlepay.com",
    "amazonpay.in",
    "npci.org.in",
    "razorpay.com",
    "cashfree.com",
    "billdesk.com",
    "mobikwik.com",
    "freecharge.in",
    "pnbindia.in",
    "canarabank.in",
    "unionbankofindia.co.in",
    "bankofbaroda.in",
    "upi.npci.org.in",
}


def is_likely_financial(subject: str, snippet: str, sender_domain: str) -> bool:
    """Return True if email looks like a financial transaction notification."""
    if sender_domain in _FINANCIAL_DOMAINS:
        return True
    text = f"{subject} {snippet}"
    return bool(_FINANCIAL_RE.search(text))


async def fetch_new_messages(
    last_history_id,
    email_filter: str = "all",
    creds: Credentials | None = None,
    after_date: str | None = None,
    before_date: str | None = None,
    query_extra: str | None = None,
    existing_gmail_ids: set | None = None,
):
    """
    Returns (messages, new_history_id).
    last_history_id=None triggers full 90-day fetch with pagination.

    email_filter: "all" | "unread" | "read"

    query_extra: additional Gmail search operators (e.g. "from:x subject:y")
                 appended to the after+date query. Ignored in history mode.

    existing_gmail_ids: set of gmail_ids already in DB. If provided, uses
        two-phase fetch: metadata first, then full bodies only for new messages.
        This is MUCH faster for large mailboxes.

    Each message dict keys:
        gmail_id, subject, sender, sender_domain, received_at, body_snippet, body_text, gmail_link
    """
    from google.auth.exceptions import RefreshError

    service = _build_service(creds)

    try:
        return await _fetch_messages_inner(
            service, last_history_id, email_filter, creds, after_date, before_date, query_extra, existing_gmail_ids
        )
    except RefreshError as exc:
        raise RuntimeError(f"Gmail credential refresh failed: {exc}. Please reconnect Gmail")
    except OSError as exc:
        # socket.timeout, connection errors, etc.
        raise RuntimeError(f"Gmail API connection error: {exc}")


async def _fetch_messages_inner(
    service, last_history_id, email_filter, creds, after_date, before_date, query_extra, existing_gmail_ids=None
):
    use_two_phase = existing_gmail_ids is not None

    if last_history_id is None or after_date is not None:
        if after_date is not None:
            query = f"after:{after_date}"
            if before_date:
                query += f" before:{before_date}"
            if query_extra:
                query += f" {query_extra}"
        else:
            query = "in:inbox newer_than:10d"
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
            kwargs = {"userId": "me", "q": query, "maxResults": settings.SYNC_PAGE_SIZE}
            if page_token:
                kwargs["pageToken"] = page_token
            results = await _async_retry_with_backoff(lambda: service.users().messages().list(**kwargs).execute())
            message_ids.extend(m["id"] for m in results.get("messages", []))
            page_token = results.get("nextPageToken")
            if not page_token:
                break

        if after_date is not None:
            new_history_id = last_history_id
        else:
            profile = await _async_retry_with_backoff(lambda: service.users().getProfile(userId="me").execute())
            new_history_id = str(profile["historyId"])
    else:
        try:
            history = await _async_retry_with_backoff(
                lambda: (
                    service.users()
                    .history()
                    .list(
                        userId="me",
                        startHistoryId=last_history_id,
                        historyTypes=["messageAdded"],
                    )
                    .execute()
                )
            )
            # History API returns minimal message objects (id + threadId only),
            # so we can't filter by labelIds here. Collect all ids and filter
            # after fetching the full message below.
            message_ids = [
                msg["message"]["id"] for record in history.get("history", []) for msg in record.get("messagesAdded", [])
            ]
            new_history_id = str(history.get("historyId", last_history_id))
        except HttpError as e:
            # 404 = historyId too old (expired), 410 = Gone — both warrant a full re-fetch
            if e.resp.status in (404, 410):
                logger.warning("History ID expired (status %s), falling back to full fetch", e.resp.status)
                return await fetch_new_messages(None, email_filter, creds, existing_gmail_ids=existing_gmail_ids)
            raise

    messages = []
    skipped = 0
    full_fetch_count = 0
    metadata_fetch_count = 0

    if use_two_phase:
        # Phase 1: Fetch metadata in batches — 50x fewer HTTP round-trips
        logger.info("Two-phase fetch: fetching metadata for %d messages", len(message_ids))
        metadata_map = {}
        meta_batch_size = (
            settings.FETCH_CONCURRENCY * 2
        )  # 10 metadata calls per batch (avoids concurrent request limit)

        meta_errors: list[tuple[str, Exception]] = []

        def _meta_cb(request_id, response, exception):
            nonlocal skipped
            if exception is not None:
                if isinstance(exception, HttpError) and exception.resp.status == 404:
                    skipped += 1
                    return
                meta_errors.append((request_id, exception))
                return
            metadata_map[request_id] = response

        for i in range(0, len(message_ids), meta_batch_size):
            meta_errors.clear()
            batch = service.new_batch_http_request(callback=_meta_cb)
            chunk = message_ids[i : i + meta_batch_size]
            for msg_id in chunk:
                if msg_id in existing_gmail_ids:
                    skipped += 1
                    continue
                batch.add(
                    service.users()
                    .messages()
                    .get(
                        userId="me",
                        id=msg_id,
                        format="metadata",
                        metadataHeaders=["From", "Subject", "Date"],
                    ),
                    request_id=msg_id,
                )
            if batch._requests:
                await _async_retry_with_backoff(lambda b=batch: b.execute())
                if meta_errors:
                    # Check for errors that should propagate (429 triggers retry, 401 triggers reconnect)
                    for _mid, exc in meta_errors:
                        if isinstance(exc, HttpError) and exc.resp.status in (429, 401):
                            raise exc
                    # For 5xx and other errors, log and continue with partial results
                    for _mid, exc in meta_errors:
                        logger.warning("Batch metadata fetch failed for message %s: %s", _mid, exc)
                    if len(meta_errors) == len(batch._requests):
                        # All messages in this batch failed — raise the first error
                        raise meta_errors[0][1]
            if i + meta_batch_size < len(message_ids):
                await asyncio.sleep(1)

        metadata_fetch_count = len(metadata_map)
        skipped_pre = skipped
        new_msg_ids = list(metadata_map.keys())
        logger.info(
            "Two-phase: %d already synced, %d new messages to fetch full bodies",
            skipped_pre,
            len(new_msg_ids),
        )

        # Phase 2: Fetch full bodies in batches for new messages
        full_batch_size = settings.FETCH_CONCURRENCY  # 5 full calls per batch (avoids concurrent request limit)

        full_errors: list[tuple[str, Exception]] = []

        def _full_cb(request_id, response, exception):
            nonlocal skipped, full_fetch_count
            if exception is not None:
                if isinstance(exception, HttpError) and exception.resp.status == 404:
                    skipped += 1
                    return
                full_errors.append((request_id, exception))
                return
            full_fetch_count += 1

            if not _passes_filter(response, email_filter):
                skipped += 1
                return

            headers = {h["name"]: h["value"] for h in response.get("payload", {}).get("headers", [])}
            sender = headers.get("From", "")
            messages.append(
                {
                    "gmail_id": request_id,
                    "subject": headers.get("Subject", ""),
                    "sender": sender,
                    "sender_domain": extract_domain(sender),
                    "received_at": datetime.fromtimestamp(int(response["internalDate"]) / 1000, tz=UTC),
                    "body_snippet": response.get("snippet", "")[:500],
                    "body_text": _extract_body_text(response.get("payload", {})),
                    "gmail_link": get_gmail_link(request_id),
                }
            )

        for i in range(0, len(new_msg_ids), full_batch_size):
            full_errors.clear()
            batch = service.new_batch_http_request(callback=_full_cb)
            chunk = new_msg_ids[i : i + full_batch_size]
            for msg_id in chunk:
                batch.add(
                    service.users()
                    .messages()
                    .get(
                        userId="me",
                        id=msg_id,
                        format="full",
                    ),
                    request_id=msg_id,
                )
            await _async_retry_with_backoff(lambda b=batch: b.execute())
            if full_errors:
                # Check for errors that should propagate (429 triggers retry, 401 triggers reconnect)
                for _mid, exc in full_errors:
                    if isinstance(exc, HttpError) and exc.resp.status in (429, 401):
                        raise exc
                # For 5xx and other errors, log and continue with partial results
                for _mid, exc in full_errors:
                    logger.warning("Batch full-body fetch failed for message %s: %s", _mid, exc)
                if len(full_errors) == len(batch._requests):
                    # All messages in this batch failed — raise the first error
                    raise full_errors[0][1]
            if i + full_batch_size < len(new_msg_ids):
                await asyncio.sleep(1)
    else:
        # Legacy single-phase: fetch full for all messages
        for i, msg_id in enumerate(message_ids):
            # Throttle to avoid exceeding Gmail's 250 quota-units/sec burst limit
            if i > 0 and i % settings.FETCH_CONCURRENCY == 0:
                await asyncio.sleep(1)

            try:
                msg = await _async_retry_with_backoff(
                    lambda: (
                        service.users()
                        .messages()
                        .get(
                            userId="me",
                            id=msg_id,
                            format="full",
                        )
                        .execute()
                    )
                )
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
            messages.append(
                {
                    "gmail_id": msg_id,
                    "subject": headers.get("Subject", ""),
                    "sender": sender,
                    "sender_domain": extract_domain(sender),
                    "received_at": datetime.fromtimestamp(int(msg["internalDate"]) / 1000, tz=UTC),
                    "body_snippet": msg.get("snippet", "")[:500],
                    "body_text": _extract_body_text(msg.get("payload", {})),
                    "gmail_link": get_gmail_link(msg_id),
                }
            )

    if skipped:
        logger.info("Skipped %d message(s) that were deleted/trashed or already synced", skipped)

    if use_two_phase:
        logger.info(
            "Two-phase fetch complete: %d metadata + %d full = %d new messages (%d skipped)",
            metadata_fetch_count,
            full_fetch_count,
            len(messages),
            skipped,
        )
    else:
        logger.info("Fetched %d messages (%d skipped)", len(messages), skipped)
    return messages, new_history_id
