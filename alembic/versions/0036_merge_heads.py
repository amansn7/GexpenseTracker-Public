"""merge 0034_reencrypt_ai_keys and 0035_add_llm_spend_tracker heads

Revision ID: 0036_merge_heads
Revises: 0034_reencrypt_ai_keys, 0035_add_llm_spend_tracker
Create Date: 2026-05-21 00:00:00.000000
"""
from typing import Sequence, Union

revision: str = "0036_merge_heads"
down_revision: Union[str, Sequence[str], None] = (
    "0034_reencrypt_ai_keys",
    "0035_add_llm_spend_tracker",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
