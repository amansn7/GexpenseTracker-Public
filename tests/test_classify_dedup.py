"""Tests for T7: dedup query in _apply_pre_filter scoped to user_id."""

import pytest

from app.models import Email


@pytest.mark.asyncio
async def test_apply_pre_filter_dedup_same_gmail_id_same_user_skipped(db_session, mock_user):
    """Dedup query catches same gmail_id for the same user."""
    from app.sync.classify import _apply_pre_filter

    email = Email(
        gmail_id="g-dedup-same",
        subject="Already synced",
        user_id=mock_user.id,
        pre_filter_status="passed",
        sender_domain="same.com",
        sender="same@same.com",
    )
    db_session.add(email)
    await db_session.commit()

    from app.classifier.pre_filter import PreFilterEngine

    pf_result = type("PFResult", (), {"decision": "pass"})()

    async def mock_evaluate(*args, **kwargs):
        return pf_result

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(PreFilterEngine, "evaluate", mock_evaluate)

    try:
        messages = [
            {
                "gmail_id": "g-dedup-same",
                "subject": "Duplicate",
                "sender": "same@same.com",
                "sender_domain": "same.com",
                "body_text": "dup",
                "body_snippet": "",
            }
        ]
        prog = {"tally": {}, "phase_detail": "", "current": 0}
        new_pairs, skipped = await _apply_pre_filter(
            db_session, messages, user_id=mock_user.id, prog=prog, uid=mock_user.id
        )
        assert skipped == 1
        assert len(new_pairs) == 0
    finally:
        monkeypatch.undo()


@pytest.mark.asyncio
async def test_apply_pre_filter_dedup_different_gmail_id_passes(db_session, mock_user):
    """Different gmail_id for same user is not deduped."""
    from app.sync.classify import _apply_pre_filter

    email = Email(
        gmail_id="g-existing",
        subject="Existing",
        user_id=mock_user.id,
        pre_filter_status="passed",
        sender_domain="existing.com",
        sender="existing@existing.com",
    )
    db_session.add(email)
    await db_session.commit()

    from app.classifier.pre_filter import PreFilterEngine

    pf_result = type("PFResult", (), {"decision": "pass"})()

    async def mock_evaluate(*args, **kwargs):
        return pf_result

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(PreFilterEngine, "evaluate", mock_evaluate)

    try:
        messages = [
            {
                "gmail_id": "g-new",
                "subject": "New email",
                "sender": "new@new.com",
                "sender_domain": "new.com",
                "body_text": "new",
                "body_snippet": "",
            }
        ]
        prog = {"tally": {}, "phase_detail": "", "current": 0}
        new_pairs, skipped = await _apply_pre_filter(
            db_session, messages, user_id=mock_user.id, prog=prog, uid=mock_user.id
        )
        assert skipped == 0
        assert len(new_pairs) == 1
    finally:
        monkeypatch.undo()
