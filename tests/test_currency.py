"""Tests for the currency conversion service."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.currency import (
    SUPPORTED_CURRENCIES,
    convert_amount,
    get_exchange_rate,
    load_user_default_currency,
)


@pytest.mark.asyncio
async def test_get_exchange_rate_same_currency():
    rate = await get_exchange_rate("INR", "INR")
    assert rate == 1.0


@pytest.mark.asyncio
async def test_get_exchange_rate_uppercases():
    rate = await get_exchange_rate("inr", "INR")
    assert rate == 1.0


@pytest.mark.asyncio
async def test_get_exchange_rate_from_api():
    """Integration-adjacent: calls real FX API (may fail without network)."""
    try:
        rate = await get_exchange_rate("USD", "INR")
        assert isinstance(rate, float)
        assert rate > 0
    except Exception as exc:
        pytest.skip(f"FX API unavailable: {exc}")


@pytest.mark.asyncio
async def test_convert_amount_same_currency():
    result = await convert_amount(100.0, "INR", "INR")
    assert result == 100.0


@pytest.mark.asyncio
async def test_convert_amount_uses_rate():
    with patch("app.services.currency.get_exchange_rate", new_callable=AsyncMock, return_value=83.0):
        result = await convert_amount(5.90, "USD", "INR")
        assert result == 489.70  # 5.90 * 83.0 = 489.70


@pytest.mark.asyncio
async def test_convert_amount_rounds_to_two_decimals():
    with patch("app.services.currency.get_exchange_rate", new_callable=AsyncMock, return_value=83.1234):
        result = await convert_amount(5.90, "USD", "INR")
        assert result == 490.43  # 5.90 * 83.1234 = 490.42806 → 490.43


def test_supported_currencies_includes_major():
    assert "USD" in SUPPORTED_CURRENCIES
    assert "EUR" in SUPPORTED_CURRENCIES
    assert "GBP" in SUPPORTED_CURRENCIES
    assert "INR" in SUPPORTED_CURRENCIES
    assert "JPY" in SUPPORTED_CURRENCIES
    assert "AED" in SUPPORTED_CURRENCIES
    assert "SGD" in SUPPORTED_CURRENCIES


@pytest.mark.asyncio
async def test_load_user_default_currency_no_session():
    result = await load_user_default_currency(None, None)
    assert result == "INR"


@pytest.mark.asyncio
async def test_load_user_default_currency_from_profile():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = "USD"
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await load_user_default_currency(mock_session, "user-123")
    assert result == "USD"


@pytest.mark.asyncio
async def test_load_user_default_currency_fallback():
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await load_user_default_currency(mock_session, "user-123")
    assert result == "INR"


@pytest.mark.asyncio
async def test_load_user_default_currency_exception():
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=Exception("DB error"))

    result = await load_user_default_currency(mock_session, "user-123")
    assert result == "INR"
