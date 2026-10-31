"""Database connections. Everything runs as the app role, so row-level security applies."""
from __future__ import annotations

from contextlib import contextmanager

import psycopg

from .config import Settings


def connect(settings: Settings) -> psycopg.Connection:
    """Plain connection with NO tenant set (row-level security will hide tenant rows)."""
    try:
        return psycopg.connect(
            host=settings.host,
            port=settings.port,
            dbname=settings.dbname,
            user=settings.user,
            password=settings.password,
            connect_timeout=5,
        )
    except psycopg.OperationalError as exc:
        first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else "unknown error"
        raise RuntimeError(
            f"Could not connect to PostgreSQL at {settings.host}:{settings.port}/{settings.dbname} "
            f"as '{settings.user}'. Is the Docker container running and are the .env values right? "
            f"Detail: {first_line}"
        ) from None


@contextmanager
def tenant_connection(settings: Settings):
    """One transaction with app.current_org_id set. Commits on success, rolls back on error."""
    conn = connect(settings)
    try:
        with conn.transaction():
            # third argument true = the setting lasts only for this transaction
            conn.execute(
                "SELECT set_config('app.current_org_id', %s, true)", (settings.org_id,)
            )
            yield conn
    finally:
        conn.close()
