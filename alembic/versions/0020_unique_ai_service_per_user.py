"""unique constraint on user_ai_services (user_id, provider, model_id)

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-05
"""
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint(
        "uq_user_ai_service_provider_model",
        "user_ai_services",
        ["user_id", "provider", "model_id"],
    )


def downgrade():
    op.drop_constraint("uq_user_ai_service_provider_model", "user_ai_services", type_="unique")
