"""Currency conversion service using exchange rate APIs.

Caches rates in-memory with a 1-hour TTL to avoid hitting the API on every email.
Uses httpx (already a project dependency) for HTTP calls.
"""
import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

_FX_API_URL = "https://api.frankfurter.dev/v1/latest"
_CACHE_TTL = timedelta(hours=1)

_rates_cache: dict[str, tuple[float, datetime]] = {}

SUPPORTED_CURRENCIES = {
    "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY",
    "HKD", "SGD", "SEK", "KRW", "NOK", "NZD", "MXN", "INR",
    "ZAR", "BRL", "DKK", "PLN", "THB", "IDR", "HUF", "CZK",
    "ILS", "CLP", "PHP", "AED", "MYR", "RON", "TRY",
}


class CurrencyConversionError(Exception):
    """Raised when a currency conversion fails."""


async def get_exchange_rate(from_currency: str, to_currency: str) -> float:
    f = from_currency.upper()
    t = to_currency.upper()
    if f == t:
        return 1.0

    cache_key = f"{f}_{t}"
    if cache_key in _rates_cache:
        rate, cached_at = _rates_cache[cache_key]
        if datetime.now() - cached_at < _CACHE_TTL:
            return rate

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        url = f"{_FX_API_URL}?from={f}&to={t}"
        resp = await client.get(url)
        if resp.status_code != 200:
            raise CurrencyConversionError(
                f"FX API returned {resp.status_code} for {f}→{t}"
            )
        data = resp.json()
        rates = data.get("rates", {})
        if t not in rates:
            raise CurrencyConversionError(
                f"Rate {f}→{t} not available from FX API"
            )
        rate = float(rates[t])

    _rates_cache[cache_key] = (rate, datetime.now())
    return rate


async def convert_amount(
    amount: float, from_currency: str, to_currency: str,
) -> float:
    if from_currency.upper() == to_currency.upper():
        return amount
    rate = await get_exchange_rate(from_currency, to_currency)
    return round(amount * rate, 2)


async def load_user_default_currency(session, user_id: str | None) -> str:
    """Load the user's default currency from UserProfile, falling back to 'INR'."""
    if not user_id or not session:
        return "INR"
    from sqlalchemy import select

    from app.models import UserProfile
    try:
        result = await session.execute(
            select(UserProfile.default_currency).where(
                UserProfile.user_id == user_id
            )
        )
        row = result.scalar_one_or_none()
        return (row or "INR").upper()
    except Exception:
        logger.warning("Failed to load user default currency, using INR")
        return "INR"
