"""
Find rows with NULL user_id in sender_rules and merchant_aliases.

Run via Railway tunnel:
  railway run bash -c '.venv/bin/python scripts/find_orphaned_rows.py'
"""
import os
import sys
import urllib.parse

import psycopg2


def main():
    raw_url = os.environ["DATABASE_URL"]
    print(f"Connecting via: {raw_url[:40]}...", file=sys.stderr)

    parsed = urllib.parse.urlparse(raw_url)
    conn = psycopg2.connect(
        host=parsed.hostname,
        port=parsed.port or 5432,
        user=parsed.username,
        password=parsed.password,
        dbname=parsed.path.lstrip("/"),
        connect_timeout=5,
    )
    conn.set_session(autocommit=True)
    cur = conn.cursor()

    print("\n=== sender_rules with NULL user_id ===")
    cur.execute(
        "SELECT id, sender_domain, label, category, source, created_at "
        "FROM sender_rules WHERE user_id IS NULL ORDER BY created_at"
    )
    rows = cur.fetchall()
    if rows:
        print(f"Found {len(rows)} orphaned row(s):")
        for r in rows:
            print(f"  id={r[0]}  domain={r[1]}  label={r[2]}  category={r[3]}  source={r[4]}  created_at={r[5]}")
    else:
        print("  (none)")

    print("\n=== merchant_aliases with NULL user_id ===")
    cur.execute(
        "SELECT id, raw, canonical, category, confidence, source, hit_count, created_at "
        "FROM merchant_aliases WHERE user_id IS NULL ORDER BY created_at"
    )
    rows = cur.fetchall()
    if rows:
        print(f"Found {len(rows)} orphaned row(s):")
        for r in rows:
            print(f"  id={r[0]}  raw={r[1]}  canonical={r[2]}  category={r[3]}  "
                  f"confidence={r[4]}  source={r[5]}  hits={r[6]}  created_at={r[7]}")
    else:
        print("  (none)")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
