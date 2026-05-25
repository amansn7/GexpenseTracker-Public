import pytest


@pytest.mark.asyncio
async def test_filter_rule_create(db_session):
    from app.models import FilterRule

    rule = FilterRule(rule_type="allowlist_domain", value="hdfcbank.com", source="system")
    db_session.add(rule)
    await db_session.flush()
    assert rule.id is not None
    assert rule.hit_count == 0


@pytest.mark.asyncio
async def test_email_pre_filter_status_defaults_to_passed(db_session, mock_user):
    from app.models import Email

    email = Email(
        gmail_id="test-001",
        subject="Your HDFC statement",
        user_id=mock_user.id,
    )
    db_session.add(email)
    await db_session.flush()
    assert email.pre_filter_status == "passed"


@pytest.mark.asyncio
async def test_tier1_allowlist_domain_passes(db_session):
    from app.classifier.pre_filter import PreFilterEngine
    from app.models import FilterRule

    rule = FilterRule(rule_type="allowlist_domain", value="hdfcbank.com", source="system")
    db_session.add(rule)
    await db_session.flush()

    engine = PreFilterEngine([rule])
    result = engine.evaluate_sync("Debit alert", "Rs 500 debited", "hdfcbank.com")
    assert result.decision == "pass"
    assert result.tier == 1
    assert result.confidence == 1.0


@pytest.mark.asyncio
async def test_tier1_blocklist_domain_reviews(db_session):
    from app.classifier.pre_filter import PreFilterEngine
    from app.models import FilterRule

    rule = FilterRule(rule_type="blocklist_domain", value="promo.spammy.com", source="user")
    db_session.add(rule)
    await db_session.flush()

    engine = PreFilterEngine([rule])
    result = engine.evaluate_sync("Big sale today!", "50% off everything", "promo.spammy.com")
    assert result.decision == "review"
    assert result.tier == 1
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_tier2_high_score_passes():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    result = engine.evaluate_sync(
        subject="INR 2,500 debited via UPI",
        snippet="Your account has been debited Rs. 2500 via UPI ref 123456",
        sender_domain="unknown-bank.com",
    )
    assert result.decision == "pass"
    assert result.tier == 2


@pytest.mark.asyncio
async def test_tier2_low_score_reviews():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    result = engine.evaluate_sync(
        subject="Your order has shipped!",
        snippet="Your package from Amazon is on its way.",
        sender_domain="amazon.com",
    )
    assert result.decision == "review"
    assert result.tier == 2


@pytest.mark.asyncio
async def test_tier2_ambiguous_band_returns_ambiguous():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    # Score ~0.40: amount present but no verb and no network keyword
    result = engine.evaluate_sync(
        subject="Rs. 1000",
        snippet="Amount: Rs. 1000",
        sender_domain="newsletter.com",
    )
    assert result.decision == "ambiguous"
    assert result.tier == 2


@pytest.mark.asyncio
async def test_tier3_fallback_to_review_when_no_llm():
    from app.classifier.pre_filter import PreFilterEngine

    engine = PreFilterEngine([])
    result = await engine.evaluate(
        subject="Rs. 1000",
        snippet="Amount: Rs. 1000",
        sender_domain="newsletter.com",
        session=None,
        user_llm_client=None,
    )
    assert result.decision == "review"
    assert result.tier == 3


@pytest.mark.asyncio
async def test_sync_routes_non_financial_to_review_pending(db_session, mock_user, monkeypatch):
    """An email that fails Tier 2 scoring gets stored with pre_filter_status=review_pending."""
    from sqlalchemy import select

    from app.models import Email
    from app.sync import sync_emails

    # Patch Gmail fetch to return one non-financial email
    async def _fake_fetch(*a, **kw):
        return (
            [
                {
                    "gmail_id": "fake-001",
                    "subject": "Flash sale: 50% off everything!",
                    "body_snippet": "Shop now and save big.",
                    "sender": "promo@deals.com",
                    "sender_domain": "deals.com",
                    "body_text": "Shop now and save big.",
                    "received_at": None,
                    "gmail_link": None,
                }
            ],
            "hist-001",
        )

    monkeypatch.setattr("app.sync.fetch.fetch_new_messages", _fake_fetch)

    # Patch Gmail creds
    async def _fake_creds(*a, **kw):
        return "fake-creds"

    monkeypatch.setattr("app.sync.fetch.get_credentials_for_user", _fake_creds)

    await sync_emails(db_session, user_id=mock_user.id)

    email = (await db_session.execute(select(Email).where(Email.gmail_id == "fake-001"))).scalar_one_or_none()

    assert email is not None, "Email should be stored even when pre-filter flags it"
    assert email.pre_filter_status == "review_pending"
