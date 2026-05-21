from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.classifier.llm_client import LLMClassification, LLMClient


def test_llm_client_compat_alias():
    from app.classifier.llm_client import MultiLLMClient
    assert LLMClient is MultiLLMClient

@pytest.mark.asyncio
async def test_classify_returns_classification(monkeypatch):
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "choices": [{"message": {"content": '{"label":"expense","amount":299.0,"merchant":"Zomato","category":"Food","txn_date":"2026-04-10","confidence":0.92}'}}]
    }
    fake_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=fake_response)

    from app.classifier.llm.providers import Provider

    test_provider = Provider(name="test", model="test-model", base_url="http://test", api_key="test-key")

    with patch("app.classifier.llm.client.httpx.AsyncClient", return_value=mock_client):
        client = LLMClient()
        client._providers = [test_provider]
        result = await client.classify("no-reply@zomato.com", "Order confirmed", "Your order ₹299")

    assert isinstance(result, LLMClassification)
    assert result.label == "expense"
    assert result.amount == 299.0
    assert result.merchant == "Zomato"
    assert result.confidence == 0.92

@pytest.mark.asyncio
async def test_classify_strips_markdown_fences(monkeypatch):
    fake_response = MagicMock()
    fake_response.json.return_value = {
        "choices": [{"message": {"content": '```json\n{"label":"income","amount":5000.0,"merchant":null,"category":"Income","txn_date":null,"confidence":0.88}\n```'}}]
    }
    fake_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=fake_response)

    from app.classifier.llm.providers import Provider

    test_provider = Provider(name="test", model="test-model", base_url="http://test", api_key="test-key")

    with patch("app.classifier.llm.client.httpx.AsyncClient", return_value=mock_client):
        client = LLMClient()
        client._providers = [test_provider]
        result = await client.classify("hr@company.com", "Salary credited", "₹50000 salary")

    assert result.label == "income"
    assert result.amount == 5000.0
