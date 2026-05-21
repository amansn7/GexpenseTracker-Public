"""Tests for inter-batch backoff when LLM providers are rate-limited."""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.classifier.classifier import batch_classify_emails
from app.classifier.llm.providers import Provider


def _make_provider(name="google", rate_limited_until=0.0):
    return Provider(
        name=name,
        base_url="https://example.com/v1",
        api_key="test-key",
        model="test-model",
        rate_limited_until=rate_limited_until,
    )


def _make_item(email_id="msg-1"):
    return (email_id, "sender@example.com", "example.com", "Subject", "Body text here")


# ── Provider.is_rate_limited ─────────────────────────────────────────────────

def test_is_rate_limited_when_not_limited():
    p = _make_provider(rate_limited_until=0.0)
    assert p.is_rate_limited() is False


def test_is_rate_limited_when_limited():
    p = _make_provider(rate_limited_until=time.time() + 60)
    assert p.is_rate_limited() is True


def test_is_rate_limited_expired():
    p = _make_provider(rate_limited_until=time.time() - 1)
    assert p.is_rate_limited() is False


# ── Inter-batch backoff fires when provider is rate-limited ──────────────────

@pytest.mark.asyncio
async def test_inter_batch_delay_fires_when_rate_limited():
    """When a provider is rate-limited, the inter-batch delay should fire."""
    items = [_make_item(f"msg-{i}") for i in range(12)]  # 12 items → 3 batches of 5

    rate_limited_provider = _make_provider(name="google", rate_limited_until=time.time() + 120)
    normal_provider = _make_provider(name="grok", rate_limited_until=0.0)

    mock_client = MagicMock()
    mock_client._ranked_providers.return_value = [rate_limited_provider, normal_provider]

    batch_results = [MagicMock(
        label="expense", amount=100.0, merchant="Test", category="Shopping",
        confidence=0.95, txn_date=None, source_currency=None,
    )]
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": batch_results * 5,
        "provider": "google",
        "model": "test-model",
        "raw_response": "",
    })

    with patch("app.classifier.classifier.llm_client", mock_client), \
         patch("app.classifier.classifier.CategoryService.load_for_llm", new_callable=AsyncMock, return_value=None), \
         patch("app.classifier.classifier.load_user_default_currency", new_callable=AsyncMock, return_value="INR"):
        results = await batch_classify_emails(items, batch_size=5)

    assert len(results) == 12
    assert all(r is not None for r in results)
    assert mock_client.batch_classify_verbose.call_count == 3  # 3 batches


@pytest.mark.asyncio
async def test_inter_batch_delay_does_not_fire_when_no_rate_limit():
    """When no provider is rate-limited, there should be no inter-batch delay."""
    items = [_make_item(f"msg-{i}") for i in range(10)]  # 10 items → 2 batches

    normal_provider = _make_provider(name="google", rate_limited_until=0.0)

    mock_client = MagicMock()
    mock_client._ranked_providers.return_value = [normal_provider]

    batch_results = [MagicMock(
        label="expense", amount=50.0, merchant="Test", category="Food",
        confidence=0.9, txn_date=None, source_currency=None,
    )]
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": batch_results * 5,
        "provider": "google",
        "model": "test-model",
        "raw_response": "",
    })

    with patch("app.classifier.classifier.llm_client", mock_client), \
         patch("app.classifier.classifier.CategoryService.load_for_llm", new_callable=AsyncMock, return_value=None), \
         patch("app.classifier.classifier.load_user_default_currency", new_callable=AsyncMock, return_value="INR"), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        results = await batch_classify_emails(items, batch_size=5)

    assert len(results) == 10
    assert all(r is not None for r in results)
    mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_inter_batch_delay_not_after_last_batch():
    """The delay should NOT fire after the last batch, even if rate-limited."""
    items = [_make_item(f"msg-{i}") for i in range(5)]  # exactly 1 batch

    rate_limited_provider = _make_provider(name="google", rate_limited_until=time.time() + 120)

    mock_client = MagicMock()
    mock_client._ranked_providers.return_value = [rate_limited_provider]

    batch_results = [MagicMock(
        label="expense", amount=200.0, merchant="Test", category="Travel",
        confidence=0.85, txn_date=None, source_currency=None,
    )]
    mock_client.batch_classify_verbose = AsyncMock(return_value={
        "results": batch_results * 5,
        "provider": "google",
        "model": "test-model",
        "raw_response": "",
    })

    with patch("app.classifier.classifier.llm_client", mock_client), \
         patch("app.classifier.classifier.CategoryService.load_for_llm", new_callable=AsyncMock, return_value=None), \
         patch("app.classifier.classifier.load_user_default_currency", new_callable=AsyncMock, return_value="INR"), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        results = await batch_classify_emails(items, batch_size=5)

    assert len(results) == 5
    mock_sleep.assert_not_called()


@pytest.mark.asyncio
async def test_inter_batch_delay_fires_between_batches_only():
    """Delay should fire between batches 1→2 and 2→3, but not after batch 3."""
    items = [_make_item(f"msg-{i}") for i in range(13)]  # 13 items → 3 batches (5+5+3)

    rate_limited_provider = _make_provider(name="google", rate_limited_until=time.time() + 120)

    mock_client = MagicMock()
    mock_client._ranked_providers.return_value = [rate_limited_provider]

    async def mock_batch_verbose(*args, **kwargs):
        n = len(args[0])
        return {
            "results": [MagicMock(
                label="expense", amount=10.0, merchant="Test", category="Shopping",
                confidence=0.9, txn_date=None, source_currency=None,
            )] * n,
            "provider": "google",
            "model": "test-model",
            "raw_response": "",
        }

    mock_client.batch_classify_verbose = AsyncMock(side_effect=mock_batch_verbose)

    with patch("app.classifier.classifier.llm_client", mock_client), \
         patch("app.classifier.classifier.CategoryService.load_for_llm", new_callable=AsyncMock, return_value=None), \
         patch("app.classifier.classifier.load_user_default_currency", new_callable=AsyncMock, return_value="INR"), \
         patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        results = await batch_classify_emails(items, batch_size=5)

    assert len(results) == 13
    assert mock_client.batch_classify_verbose.call_count == 3  # 3 batches processed
    # Sleep should be called exactly 2 times (between batch 1→2 and 2→3)
    assert mock_sleep.call_count == 2
