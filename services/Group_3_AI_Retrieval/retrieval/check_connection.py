"""Read-only health check. Run:  python -m retrieval.check_connection"""
from __future__ import annotations

import sys

from .config import load_settings
from .db import connect, tenant_connection


def main() -> int:
    settings = load_settings()
    print(f"Connecting to {settings.host}:{settings.port}/{settings.dbname} as {settings.user}")
    problems = 0

    with tenant_connection(settings) as conn:
        superuser, bypass = conn.execute(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
        ).fetchone()
        print(f"Role superuser / bypass RLS: ({superuser}, {bypass})  (expect False, False)")
        if superuser or bypass:
            problems += 1

        col_type = conn.execute(
            "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
            "WHERE attrelid = 'public.historical_case'::regclass AND attname = 'embedding'"
        ).fetchone()[0]
        print(f"historical_case.embedding column type: {col_type}")

        rows = conn.execute(
            "SELECT equipment_class_id, count(*) FROM operational_case GROUP BY 1 ORDER BY 1"
        ).fetchall()
        total = sum(n for _, n in rows)
        detail = ", ".join(f"{cls} {n}" for cls, n in rows)
        print(f"Cases visible WITH tenant context: {total}  ({detail})")
        if total == 0:
            problems += 1

        hist = conn.execute("SELECT count(*) FROM historical_case").fetchone()[0]
        print(f"Rows in historical_case: {hist}")

    conn = connect(settings)  # no tenant set on purpose
    try:
        hidden = conn.execute("SELECT count(*) FROM operational_case").fetchone()[0]
    finally:
        conn.close()
    print(f"Cases visible WITHOUT tenant context: {hidden}  (expect 0)")
    if hidden != 0:
        problems += 1

    print("RESULT:", "OK" if problems == 0 else f"{problems} check(s) need attention")
    return 1 if problems else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as exc:
        print("ERROR:", exc)
        sys.exit(2)
