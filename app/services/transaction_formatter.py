"""Centralized transaction formatting for API responses."""
from typing import Optional


def format_transaction(t, e: Optional[object] = None) -> dict:
    """Format a Transaction + optional Email into a consistent API response dict."""
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
