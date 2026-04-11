import json
import httpx
from dataclasses import dataclass
from typing import Optional
from app.config import settings

@dataclass
class LLMClassification:
    label: str
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    txn_date: Optional[str]
    confidence: float

_SYSTEM = (
    "You are classifying financial emails for an Indian user. "
    "Respond ONLY with valid JSON. No explanation, no markdown, no code blocks."
)

_USER_TEMPLATE = """Classify this email as: expense, income, or ignore.
Extract: amount (INR as number), merchant name, category, transaction date.

From: {sender}
Subject: {subject}
Body: {body_snippet}

Indian context: UPI, bank debit/credit alerts, GST invoices. Merchants include
Zomato, Swiggy, Swiggy instamart, Flipkart, Amazon.in, Jio, Airtel, PhonePe,
Google Pay, Paytm, CRED, IRCTC, Ola, Rapido.

Categories: Food, Groceries, Shopping, Travel, Transport, Utilities,
Entertainment, Healthcare, Education, UPI Payment, Bank Transfer, Income, Other

JSON only: {{"label":"expense|income|ignore","amount":0.00,"merchant":"name or null","category":"category or null","txn_date":"YYYY-MM-DD or null","confidence":0.0}}"""


class LLMClient:
    def __init__(self):
        if settings.LLM_PROVIDER == "openrouter":
            self._base_url = "https://openrouter.ai/api/v1"
            self._api_key = settings.OPENROUTER_API_KEY
            self._extra_headers = {
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Expense Tracker",
            }
        else:
            self._base_url = "https://api.anthropic.com/v1"
            self._api_key = settings.ANTHROPIC_API_KEY
            self._extra_headers = {}
        self._model = settings.LLM_MODEL

    async def classify(self, sender: str, subject: str, body_snippet: str) -> LLMClassification:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _USER_TEMPLATE.format(
                    sender=sender, subject=subject, body_snippet=body_snippet
                )},
            ],
            "temperature": 0.1,
            "max_tokens": 200,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            **self._extra_headers,
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions", json=payload, headers=headers
            )
            response.raise_for_status()

        raw = response.json()["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        return LLMClassification(
            label=data.get("label", "ignore"),
            amount=float(data["amount"]) if data.get("amount") is not None else None,
            merchant=data.get("merchant"),
            category=data.get("category"),
            txn_date=data.get("txn_date"),
            confidence=float(data.get("confidence", 0.5)),
        )


llm_client = LLMClient()
