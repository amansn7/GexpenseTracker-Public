#!/usr/bin/env python3
"""
Cashbook Excel Import Tool
Usage: python scripts/cashbook_import.py <path-to-cashbook.xlsx> [--dry-run]

Three operations performed in sequence:
  A) Import historical transactions (null email_id)
  B) Seed sender rules from merchant→category mappings
  C) Reconcile Excel rows against existing DB transactions
"""

import sys
import asyncio
import argparse
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models import Transaction, SenderRule, TransactionStatus, RuleSource
from app.config import DATABASE_URL

# ─── Category mapping: Excel category → standard app category ─────────────────
CATEGORY_MAP = {
    "groceries": "Groceries",
    "swiggy": "Food",
    "zomato": "Food",
    "eating out": "Food",
    "food": "Food",
    "local travel": "Transport",
    "transport": "Transport",
    "travel": "Travel",
    "murdeshwar trip": "Travel",
    "trip": "Travel",
    "salary": "Income",
    "income": "Income",
    "subscriptions": "Subscriptions",
    "shopping": "Shopping",
    "misc": "Other",
    "miscellaneous": "Other",
    "utilities": "Utilities",
    "🪴": "Other",
    "plants": "Other",
}

# ─── Merchant keyword → (sender_domain, category) ─────────────────────────────
MERCHANT_RULES = {
    "swiggy food":      ("swiggy.com",       "Food"),
    "swiggy instamart": ("instamrt.swiggy.com", "Groceries"),
    "swiggy":           ("swiggy.com",       "Food"),
    "zomato":           ("zomato.com",       "Food"),
    "apple":            ("apple.com",        "Subscriptions"),
    "netflix":          ("netflix.com",      "Subscriptions"),
    "spotify":          ("spotify.com",      "Subscriptions"),
    "redbus":           ("redbus.in",        "Travel"),
    "metro":            ("dmrc.co.in",       "Transport"),
    "uber":             ("uber.com",         "Transport"),
    "ola":              ("olacabs.com",      "Transport"),
    "amazon":           ("amazon.in",        "Shopping"),
    "flipkart":         ("flipkart.com",     "Shopping"),
    "blinkit":          ("blinkit.com",      "Groceries"),
    "zepto":            ("zepto.now",        "Groceries"),
    "bigbasket":        ("bigbasket.com",    "Groceries"),
}

# ─── Type → label ──────────────────────────────────────────────────────────────
TYPE_LABEL = {
    "exp.":         "expense",
    "expense":      "expense",
    "income":       "income",
    "transfer-in":  "ignore",
    "transfer-out": "ignore",
    "transfer":     "ignore",
}


def _norm_category(raw: str) -> str:
    key = raw.strip().lower()
    return CATEGORY_MAP.get(key, raw.strip().title())


def _merchant_domain(note: str) -> Optional[tuple[str, str]]:
    """Return (domain, category) for a known merchant note, else None."""
    note_lower = note.strip().lower()
    for keyword, (domain, cat) in MERCHANT_RULES.items():
        if keyword in note_lower:
            return domain, cat
    return None


def parse_cashbook(path: str) -> list[dict]:
    """Parse Excel cashbook → list of row dicts."""
    wb = openpyxl.load_workbook(path)
    ws = wb.active

    rows = []
    headers = None
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if all(v is None for v in row):
            continue
        if headers is None:
            headers = [str(h).strip().lower() if h else f"col{i}" for i, h in enumerate(row)]
            continue
        rec = dict(zip(headers, row))

        # Skip completely empty rows
        if not any(rec.values()):
            continue

        # Parse date — Period column may be date or string
        period = rec.get("period") or rec.get("date")
        txn_date: Optional[date] = None
        if isinstance(period, (datetime,)):
            txn_date = period.date()
        elif isinstance(period, date):
            txn_date = period
        elif isinstance(period, str) and period.strip():
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
                try:
                    txn_date = datetime.strptime(period.strip(), fmt).date()
                    break
                except ValueError:
                    pass

        # Determine type/label
        raw_type = str(rec.get("accounts") or "").strip()
        label = TYPE_LABEL.get(raw_type.lower(), "expense")

        # Amount: prefer Expense col for expenses, Income col for income
        amount = None
        expense_val = rec.get("expense") or rec.get("inr")
        income_val = rec.get("income")
        amount_val = rec.get("amount")

        if label == "income" and income_val:
            amount = float(income_val)
        elif label == "expense" and expense_val:
            amount = float(expense_val)
        elif amount_val:
            amount = float(amount_val)

        # Category
        raw_cat = str(rec.get("category") or "").strip()
        category = _norm_category(raw_cat) if raw_cat else None

        # Note / merchant
        note = str(rec.get("note") or "").strip()

        rows.append({
            "txn_date": txn_date,
            "label": label,
            "amount": amount,
            "category": category,
            "merchant": note or None,
            "raw_type": raw_type,
            "raw_category": raw_cat,
        })

    return rows


# ─── A: Import transactions ────────────────────────────────────────────────────
async def import_transactions(rows: list[dict], session: AsyncSession, dry_run: bool) -> int:
    imported = 0
    for row in rows:
        # Skip transfers and rows with no useful data
        if row["label"] == "ignore":
            continue
        if not row["amount"] and not row["merchant"]:
            continue

        t = Transaction(
            id=str(uuid.uuid4()),
            email_id=None,
            label=row["label"],
            amount=row["amount"],
            currency="INR",
            merchant=row["merchant"],
            category=row["category"],
            txn_date=row["txn_date"],
            confidence=1.0,
            status=TransactionStatus.confirmed.value,
            classifier_method="rule",
            user_notes="Imported from cashbook",
        )
        if not dry_run:
            session.add(t)
        imported += 1

    if not dry_run:
        await session.commit()

    return imported


# ─── B: Seed sender rules ──────────────────────────────────────────────────────
async def seed_rules(rows: list[dict], session: AsyncSession, dry_run: bool) -> int:
    # Build unique (domain, label, category) from merchants seen in cashbook
    to_seed: dict[str, tuple[str, str]] = {}  # domain → (label, category)

    for row in rows:
        if not row["merchant"]:
            continue
        result = _merchant_domain(row["merchant"])
        if result:
            domain, cat = result
            label = row["label"] if row["label"] != "ignore" else "expense"
            to_seed[domain] = (label, cat)

    seeded = 0
    for domain, (label, category) in to_seed.items():
        existing = (await session.execute(
            select(SenderRule).where(SenderRule.sender_domain == domain)
        )).scalar_one_or_none()

        if existing:
            print(f"  [skip] rule exists: {domain}")
            continue

        if not dry_run:
            session.add(SenderRule(
                sender_domain=domain,
                label=label,
                category=category,
                source=RuleSource.builtin.value,
            ))
        seeded += 1
        print(f"  [seed] {domain} → {label} / {category}")

    if not dry_run:
        await session.commit()

    return seeded


# ─── C: Reconciliation report ─────────────────────────────────────────────────
async def reconcile(rows: list[dict], session: AsyncSession) -> None:
    # Fetch all existing confirmed/auto transactions with a txn_date
    existing = (await session.execute(
        select(Transaction).where(
            Transaction.txn_date.isnot(None),
            Transaction.label == "expense",
        )
    )).scalars().all()

    # Index DB rows by (date, amount)
    db_index: dict[tuple, list[Transaction]] = {}
    for t in existing:
        key = (t.txn_date, round(float(t.amount), 2) if t.amount else None)
        db_index.setdefault(key, []).append(t)

    matched = []
    unmatched = []

    for row in rows:
        if row["label"] != "expense":
            continue
        if not row["amount"]:
            continue

        key = (row["txn_date"], round(row["amount"], 2))
        if key in db_index:
            matched.append((row, db_index[key]))
        else:
            unmatched.append(row)

    print(f"\n{'─'*60}")
    print(f"  RECONCILIATION REPORT")
    print(f"{'─'*60}")
    print(f"  Excel expense rows : {len(matched) + len(unmatched)}")
    print(f"  Matched in DB      : {len(matched)}")
    print(f"  Not found in DB    : {len(unmatched)}")
    print(f"{'─'*60}")

    if unmatched:
        print("\n  Missing from DB (Excel has, DB doesn't):")
        for row in unmatched:
            dt = row["txn_date"].isoformat() if row["txn_date"] else "no-date"
            print(f"    {dt}  ₹{row['amount']:<8}  {row['merchant'] or '—'}  [{row['category'] or '—'}]")

    if matched:
        print(f"\n  Matched transactions ({len(matched)}):")
        for row, txns in matched[:10]:  # show first 10
            dt = row["txn_date"].isoformat() if row["txn_date"] else "no-date"
            db_merchants = ", ".join(t.merchant or "—" for t in txns)
            print(f"    {dt}  ₹{row['amount']:<8}  Excel: {row['merchant'] or '—'}  DB: {db_merchants}")
        if len(matched) > 10:
            print(f"    ... and {len(matched) - 10} more")
    print()


# ─── Main ──────────────────────────────────────────────────────────────────────
async def main() -> None:
    parser = argparse.ArgumentParser(description="Import cashbook Excel into expense tracker")
    parser.add_argument("path", help="Path to cashbook .xlsx file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing to DB")
    parser.add_argument("--skip-import", action="store_true", help="Skip transaction import (A)")
    parser.add_argument("--skip-rules", action="store_true", help="Skip rule seeding (B)")
    parser.add_argument("--skip-reconcile", action="store_true", help="Skip reconciliation report (C)")
    args = parser.parse_args()

    if not Path(args.path).exists():
        print(f"ERROR: file not found: {args.path}")
        sys.exit(1)

    print(f"\nParsing {args.path} …")
    rows = parse_cashbook(args.path)
    print(f"Parsed {len(rows)} rows")

    if args.dry_run:
        print("DRY RUN — no writes to DB\n")

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # C: Reconcile first (read-only, useful even in dry-run)
        if not args.skip_reconcile:
            print("\n[C] Reconciliation …")
            await reconcile(rows, session)

        # B: Seed rules
        if not args.skip_rules:
            print("[B] Seeding sender rules …")
            seeded = await seed_rules(rows, session, dry_run=args.dry_run)
            print(f"    {seeded} rules {'would be ' if args.dry_run else ''}added\n")

        # A: Import transactions
        if not args.skip_import:
            print("[A] Importing transactions …")
            imported = await import_transactions(rows, session, dry_run=args.dry_run)
            print(f"    {imported} transactions {'would be ' if args.dry_run else ''}imported\n")

    await engine.dispose()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
