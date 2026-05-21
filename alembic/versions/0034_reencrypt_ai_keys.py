"""re-encrypt AI service keys from SECRET_KEY to FERNET_KEY

Revision ID: 0034_reencrypt_ai_keys
Revises: 0033_move_startup_ddl_to_alembic
Create Date: 2026-05-20 00:00:00.000000

"""
import base64
import hashlib
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger(__name__)


# revision identifiers, used by Alembic.
revision: str = '0034_reencrypt_ai_keys'
down_revision: Union[str, None] = '0033_move_startup_ddl_to_alembic'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _old_fernet():
    """Fernet derived from SECRET_KEY (old encryption key)."""
    from cryptography.fernet import Fernet
    from app.config import settings
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
    return Fernet(key)


def _new_fernet():
    """Fernet derived from FERNET_KEY (new encryption key)."""
    from cryptography.fernet import Fernet
    from app.config import settings
    if not settings.FERNET_KEY:
        raise RuntimeError("FERNET_KEY is required for AI key encryption")
    try:
        return Fernet(settings.FERNET_KEY.encode())
    except ValueError:
        key = base64.urlsafe_b64encode(hashlib.sha256(settings.FERNET_KEY.encode("utf-8")).digest())
        return Fernet(key)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, encrypted_api_key FROM user_ai_services WHERE encrypted_api_key IS NOT NULL")
    ).fetchall()

    old_f = _old_fernet()
    new_f = _new_fernet()

    migrated = 0
    skipped = 0

    for row in rows:
        row_id = row[0]
        old_encrypted = row[1]

        try:
            plaintext = old_f.decrypt(old_encrypted.encode("utf-8")).decode("utf-8")
        except Exception:
            logger.warning(
                "Skipping row %s: could not decrypt with old SECRET_KEY-derived key. "
                "The key may already be encrypted with FERNET_KEY or is corrupt.",
                row_id,
            )
            skipped += 1
            continue

        new_encrypted = new_f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        conn.execute(
            sa.text(
                "UPDATE user_ai_services SET encrypted_api_key = :new_key WHERE id = :id"
            ),
            {"new_key": new_encrypted, "id": row_id},
        )
        migrated += 1

    conn.commit()
    logger.info(
        "AI key re-encryption complete: %d migrated, %d skipped", migrated, skipped
    )


def downgrade() -> None:
    """Re-encrypt keys back from FERNET_KEY to SECRET_KEY."""
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, encrypted_api_key FROM user_ai_services WHERE encrypted_api_key IS NOT NULL")
    ).fetchall()

    old_f = _old_fernet()
    new_f = _new_fernet()

    migrated = 0
    skipped = 0

    for row in rows:
        row_id = row[0]
        current_encrypted = row[1]

        try:
            plaintext = new_f.decrypt(current_encrypted.encode("utf-8")).decode("utf-8")
        except Exception:
            logger.warning(
                "Skipping row %s during downgrade: could not decrypt with FERNET_KEY-derived key.",
                row_id,
            )
            skipped += 1
            continue

        old_encrypted = old_f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        conn.execute(
            sa.text(
                "UPDATE user_ai_services SET encrypted_api_key = :old_key WHERE id = :id"
            ),
            {"old_key": old_encrypted, "id": row_id},
        )
        migrated += 1

    conn.commit()
    logger.info(
        "AI key downgrade complete: %d migrated, %d skipped", migrated, skipped
    )
