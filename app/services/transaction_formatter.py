"""Centralized transaction formatting for API responses."""
from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import Email, Transaction


def format_transaction(t: "Transaction", e: "Email | None" = None) -> dict:
    """Format a Transaction plus optional Email into a consistent API response dict.

    Eager-load contract: the caller is responsible for eager-loading the
    ``email`` relationship (typically via ``selectinload(Transaction.email)``)
    and passing the resulting ``Email`` row in explicitly as ``e``. This
    formatter never touches ``t.email`` directly, so it will not trigger
    implicit lazy-loads in async contexts; passing ``e=None`` is supported and
    yields a fully-populated ``"email"`` block with ``None`` values so callers
    (and the frontend) can rely on the keys always existing.
    """
    return {
        "id": t.id,
        "label": t.label,
        "transaction_type": t.transaction_type,
        "amount": float(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "merchant": t.merchant,
        "category": t.category,
        "txn_date": t.txn_date.isoformat() if t.txn_date else None,
        "confidence": t.confidence,
        "status": t.status,
        "classifier_method": t.classifier_method,
        "user_notes": t.user_notes,
        "read": bool(t.read),
        "flagged": bool(t.flagged),
        "email": {
            "subject": e.subject if e else None,
            "sender": e.sender if e else None,
            "sender_domain": e.sender_domain if e else None,
            "received_at": e.received_at.isoformat() if e and e.received_at else None,
            "gmail_link": e.gmail_link if e else None,
            "body_snippet": e.body_snippet if e else None,
        },
    }
