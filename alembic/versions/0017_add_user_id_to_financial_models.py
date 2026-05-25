"""add user_id to financial models

Revision ID: 0017
Revises: 0016
Create Date: 2026-04-28 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0017'
down_revision: Union[str, None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('budgets') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_budgets_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
        batch_op.drop_constraint('budgets_category_key', type_='unique')
        batch_op.create_unique_constraint('uq_budget_user_category', ['user_id', 'category'])
    op.create_index('ix_budgets_user_id', 'budgets', ['user_id'])

    with op.batch_alter_table('debts') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_debts_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_debts_user_id', 'debts', ['user_id'])

    with op.batch_alter_table('recurring_expenses') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_recurring_expenses_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_recurring_expenses_user_id', 'recurring_expenses', ['user_id'])

    with op.batch_alter_table('sender_rules') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_sender_rules_user_id', 'users', ['user_id'], ['id'], ondelete='CASCADE')
        batch_op.drop_constraint('sender_rules_sender_domain_key', type_='unique')
        batch_op.create_unique_constraint('uq_sender_rule_user_domain', ['user_id', 'sender_domain'])
    op.create_index('ix_sender_rules_user_id', 'sender_rules', ['user_id'])

    # Backfill existing rows to the owner user
    op.execute("""
        UPDATE budgets SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)
    op.execute("""
        UPDATE debts SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)
    op.execute("""
        UPDATE recurring_expenses SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)
    op.execute("""
        UPDATE sender_rules SET user_id = (
            SELECT id FROM users WHERE role = 'owner' AND email != 'service@localhost' LIMIT 1
        ) WHERE user_id IS NULL
    """)


def downgrade() -> None:
    with op.batch_alter_table('budgets') as batch_op:
        batch_op.drop_constraint('uq_budget_user_category', type_='unique')
        batch_op.create_unique_constraint('budgets_category_key', ['category'])
    op.drop_index('ix_budgets_user_id', 'budgets')
    op.drop_column('budgets', 'user_id')

    op.drop_index('ix_debts_user_id', 'debts')
    op.drop_column('debts', 'user_id')

    op.drop_index('ix_recurring_expenses_user_id', 'recurring_expenses')
    op.drop_column('recurring_expenses', 'user_id')

    with op.batch_alter_table('sender_rules') as batch_op:
        batch_op.drop_constraint('uq_sender_rule_user_domain', type_='unique')
        batch_op.create_unique_constraint('sender_rules_sender_domain_key', ['sender_domain'])
    op.drop_index('ix_sender_rules_user_id', 'sender_rules')
    op.drop_column('sender_rules', 'user_id')
