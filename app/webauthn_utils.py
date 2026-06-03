import hashlib
import hmac
import json
import os
import secrets
from typing import Any
from urllib.parse import urlparse

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticationCredential,
    AuthenticatorSelectionCriteria,
    RegistrationCredential,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

RP_NAME = "MoneyFlow"


def _get_rp_id() -> str:
    uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
    parsed = urlparse(uri)
    return parsed.hostname or "localhost"


def _get_origin() -> str:
    uri = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
    parsed = urlparse(uri)
    scheme = parsed.scheme or "http"
    hostname = parsed.hostname or "localhost"
    port = parsed.port
    if port:
        return f"{scheme}://{hostname}:{port}"
    return f"{scheme}://{hostname}"


def _challenge_key() -> str:
    key = os.getenv("SECRET_KEY", "")
    if not key:
        raise RuntimeError("SECRET_KEY not configured")
    return key


def _sign_challenge(challenge_b64: str, purpose: str) -> str:
    return hmac.new(
        _challenge_key().encode(),
        f"{purpose}:{challenge_b64}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _verify_challenge(challenge_b64: str, purpose: str, signature: str) -> bool:
    return hmac.compare_digest(_sign_challenge(challenge_b64, purpose), signature)


def generate_registration_challenge(user_id: str, user_email: str) -> dict[str, Any]:
    challenge_bytes = secrets.token_bytes(32)
    challenge_b64 = bytes_to_base64url(challenge_bytes)

    options = generate_registration_options(
        rp_id=_get_rp_id(),
        rp_name=RP_NAME,
        user_id=user_id.encode(),
        user_name=user_email,
        user_display_name=user_email,
        attestation="none",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )

    result = json.loads(options.model_dump_json())
    result["challenge"] = challenge_b64
    sig = _sign_challenge(challenge_b64, "register")
    return {"options": result, "challenge_sig": sig}


def verify_registration_credential(
    credential: dict[str, Any],
    challenge_b64: str,
    challenge_sig: str,
) -> tuple[str, str, int]:
    if not _verify_challenge(challenge_b64, "register", challenge_sig):
        raise ValueError("Challenge signature mismatch")

    challenge_bytes = base64url_to_bytes(challenge_b64)

    reg_cred = RegistrationCredential.model_validate(credential)

    verification = verify_registration_response(
        credential=reg_cred,
        expected_challenge=challenge_bytes,
        expected_rp_id=_get_rp_id(),
        expected_origin=_get_origin(),
        require_user_verification=True,
    )

    return (
        verification.credential_id,
        verification.credential_public_key,
        verification.sign_count,
    )


def generate_assertion_challenge() -> dict[str, Any]:
    challenge_bytes = secrets.token_bytes(32)
    challenge_b64 = bytes_to_base64url(challenge_bytes)

    options = generate_authentication_options(
        rp_id=_get_rp_id(),
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    result = json.loads(options.model_dump_json())
    result["challenge"] = challenge_b64
    sig = _sign_challenge(challenge_b64, "assert")
    return {"options": result, "challenge_sig": sig}


def verify_assertion_credential(
    credential: dict[str, Any],
    challenge_b64: str,
    challenge_sig: str,
    credential_public_key: str,
    current_sign_count: int,
) -> int:
    if not _verify_challenge(challenge_b64, "assert", challenge_sig):
        raise ValueError("Challenge signature mismatch")

    challenge_bytes = base64url_to_bytes(challenge_b64)

    auth_cred = AuthenticationCredential.model_validate(credential)

    verification = verify_authentication_response(
        credential=auth_cred,
        expected_challenge=challenge_bytes,
        expected_rp_id=_get_rp_id(),
        expected_origin=_get_origin(),
        credential_public_key=credential_public_key,
        credential_current_sign_count=current_sign_count,
        require_user_verification=True,
    )

    return verification.new_sign_count
