"""Backward-compatible re-exports for app.classifier.llm package."""
from app.classifier.llm.client import LLMClient, MultiLLMClient, llm_client
from app.classifier.llm.parsing import LLMClassification, extract_json, parse_batch_response, parse_response
from app.classifier.llm.providers import (
    Provider,
    _KNOWN_BASE_URLS,
    build_default_providers,
    get_groq_limiter,
    rank_providers,
)
from app.classifier.llm.prompts import (
    _BATCH_USER_TEMPLATE,
    _DEFAULT_CATEGORIES,
    _SYSTEM,
    _USER_TEMPLATE,
    build_pre_extraction_block,
)
from app.classifier.llm.user_client import build_user_client, get_user_client

# Aliases for backward compatibility
_parse_response = parse_response
_parse_batch_response = parse_batch_response
_extract_json = extract_json
_build_pre_extraction_block = build_pre_extraction_block

__all__ = [
    "LLMClient",
    "MultiLLMClient",
    "llm_client",
    "LLMClassification",
    "Provider",
    "parse_response",
    "parse_batch_response",
    "extract_json",
    "build_pre_extraction_block",
    "build_user_client",
    "get_user_client",
    "_parse_response",
    "_parse_batch_response",
    "_extract_json",
    "_build_pre_extraction_block",
    "_SYSTEM",
    "_USER_TEMPLATE",
    "_BATCH_USER_TEMPLATE",
    "_DEFAULT_CATEGORIES",
    "_KNOWN_BASE_URLS",
]
