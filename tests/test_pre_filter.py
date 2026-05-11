import pytest
import pytest_asyncio
from sqlalchemy import select


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
