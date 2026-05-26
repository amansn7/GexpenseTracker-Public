"""finally add merchant_aliases.user_id — DROP + ADD fresh inside Alembic txn

Previous migrations (0039-0044) all failed because:
- 0039 batch_alter_table left stale pg_catalog metadata
- 0042 trust stale information_schema → no-op
- 0043 ADD COLUMN IF NOT EXISTS trusts stale pg_catalog → skip
- 0044 DO $$ … EXCEPTION caught duplicate_column, PL/pgSQL
  subtransaction rollback undid the ADD — column never created

The fix: query pg_attribute (storage source of truth). If column is
NOT live, DROP COLUMN IF EXISTS (clears any phantom state) then ADD
COLUMN fresh. All inside Alembic's transaction — no separate connection,
no DO blocks, no EXCEPTION handlers, no subtransaction rollback.

Revision ID: 0045
Revises: 0044
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0045"
down_revision: Union[str, Sequence[str], None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    # ---- Diagnose actual column state via pg_attribute (storage-level truth) ----
    row = conn.execute(sa.text("""
        SELECT attname, attisdropped, attnum
        FROM pg_attribute
        WHERE attrelid = 'merchant_aliases'::regclass
          AND attname = 'user_id'
          AND attnum > 0
    """)).fetchone()

    if row is not None:
        name, dropped, num = row
        print(f"  pg_attribute: user_id exists (attisdropped={dropped}, attnum={num})")
    else:
        print("  pg_attribute: user_id does NOT exist in table storage")

    # Check if column IS live (the only case where we skip)
    live = conn.execute(sa.text("""
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'merchant_aliases'::regclass
          AND attname = 'user_id'
          AND attnum > 0
          AND NOT attisdropped
    """)).fetchone()

    if live is not None:
        print("  ✓ merchant_aliases.user_id already exists as live column — nothing to do")
        return

    # Column is NOT live. DROP first to clear any phantom/dropped state,
    # then ADD fresh. Both inside Alembic's transaction — committed together.
    print("  ! DROP COLUMN IF EXISTS (clears phantom state)...")
    op.execute("ALTER TABLE merchant_aliases DROP COLUMN IF EXISTS user_id")

    print("  ! ADD COLUMN user_id VARCHAR(36)...")
    op.execute("ALTER TABLE merchant_aliases ADD COLUMN user_id VARCHAR(36)")

    # Verify
    verify = conn.execute(sa.text("""
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'merchant_aliases'::regclass
          AND attname = 'user_id'
          AND attnum > 0
          AND NOT attisdropped
    """)).fetchone()

    if verify is not None:
        print("  ✓ Column confirmed live in pg_attribute")
    else:
        print("  ✗ Column STILL not live — this shouldn't happen")
        return

    # Backfill
    conn.execute(sa.text("""
        UPDATE merchant_aliases SET user_id = (
            SELECT id FROM users WHERE role = 'owner'
              AND email != 'service@localhost'
            LIMIT 1
        ) WHERE user_id IS NULL
    """))
    print("  ✓ Backfill done")

    # NOT NULL
    op.alter_column("merchant_aliases", "user_id",
                    existing_type=sa.String(36),
                    nullable=False)
    print("  ✓ NOT NULL set")

    # FK constraint
    fk_exists = conn.execute(sa.text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_merchant_aliases_user_id'
          AND table_name = 'merchant_aliases'
    """)).fetchone()

    if not fk_exists:
        op.create_foreign_key(
            "fk_merchant_aliases_user_id", "merchant_aliases", "users",
            ["user_id"], ["id"], ondelete="CASCADE",
        )
        print("  ✓ FK created")
    else:
        print("  ✓ FK already exists")

    # Unique constraint
    op.execute("ALTER TABLE merchant_aliases DROP CONSTRAINT IF EXISTS merchant_aliases_raw_key")

    uq_exists = conn.execute(sa.text("""
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uq_merchant_alias_user_raw'
          AND table_name = 'merchant_aliases'
    """)).fetchone()

    if not uq_exists:
        op.create_unique_constraint(
            "uq_merchant_alias_user_raw", "merchant_aliases",
            ["user_id", "raw"],
        )
        print("  ✓ Unique constraint created")
    else:
        print("  ✓ Unique constraint already exists")

    # Index — use IF NOT EXISTS for idempotence
    conn.execute(
        sa.text("CREATE INDEX IF NOT EXISTS ix_merchant_aliases_user_id ON merchant_aliases (user_id)")
    )
    print("  ✓ Index ensured")


def downgrade() -> None:
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect != "postgresql":
        return

    op.drop_index("ix_merchant_aliases_user_id", "merchant_aliases")
    op.drop_constraint("uq_merchant_alias_user_raw", "merchant_aliases", type_="unique")
    op.drop_constraint("fk_merchant_aliases_user_id", "merchant_aliases", type_="foreignkey")
    op.alter_column("merchant_aliases", "user_id",
                    existing_type=sa.String(36),
                    nullable=True)
    op.drop_column("merchant_aliases", "user_id")
