"""Add user_id to domain_pair_rules for per-user scoping

Revision ID: 0064
Revises: 0063
Create Date: 2026-06-05 12:30:00.000000

Previously domain_pair_rules was global — one user's confirmations/dismissals
affected all users. This migration adds a nullable user_id FK and updates
the unique constraint to (user_id, domain_a, domain_b) so that each user can
have their own override rules while global rules (user_id IS NULL) still apply
as system defaults.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0064"
down_revision: Union[str, None] = "0063"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.engine.dialect.name == "sqlite"


def upgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("domain_pair_rules") as batch_op:
            batch_op.add_column(sa.Column("user_id", sa.String(36), nullable=True))
            batch_op.create_foreign_key(
                "fk_domain_pair_rules_user_id", "domain_pair_rules", "users", ["user_id"], ["id"], ondelete="CASCADE"
            )
            batch_op.create_index("ix_domain_pair_rules_user_id", ["user_id"])
            batch_op.drop_constraint("uq_domain_pair", type_="unique")
            batch_op.create_unique_constraint(
                "uq_domain_pair_user", ["user_id", "domain_a", "domain_b"]
            )
    else:
        op.add_column("domain_pair_rules", sa.Column("user_id", sa.String(36), nullable=True))
        op.create_foreign_key(
            "fk_domain_pair_rules_user_id", "domain_pair_rules", "users", ["user_id"], ["id"], ondelete="CASCADE"
        )
        op.create_index("ix_domain_pair_rules_user_id", "domain_pair_rules", ["user_id"])
        op.drop_constraint("uq_domain_pair", "domain_pair_rules", type_="unique")
        op.create_unique_constraint(
            "uq_domain_pair_user", "domain_pair_rules", ["user_id", "domain_a", "domain_b"]
        )


def downgrade() -> None:
    if _is_sqlite():
        with op.batch_alter_table("domain_pair_rules") as batch_op:
            batch_op.drop_constraint("uq_domain_pair_user", type_="unique")
            batch_op.create_unique_constraint("uq_domain_pair", ["domain_a", "domain_b"])
            batch_op.drop_index("ix_domain_pair_rules_user_id")
            batch_op.drop_constraint("fk_domain_pair_rules_user_id")
            batch_op.drop_column("user_id")
    else:
        op.drop_constraint("uq_domain_pair_user", "domain_pair_rules", type_="unique")
        op.create_unique_constraint("uq_domain_pair", "domain_pair_rules", ["domain_a", "domain_b"])
        op.drop_index("ix_domain_pair_rules_user_id", table_name="domain_pair_rules")
        op.drop_constraint("fk_domain_pair_rules_user_id", "domain_pair_rules", type_="foreignkey")
        op.drop_column("domain_pair_rules", "user_id")
