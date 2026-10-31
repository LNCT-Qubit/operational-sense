"""Reads connection settings from the project's .env file."""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    dbname: str
    user: str
    password: str = field(repr=False)  # repr=False: never shown if the object is printed
    org_id: str


def load_settings() -> Settings:
    load_dotenv(ENV_PATH)

    needed = ("POSTGRES_DB", "OPSENSE_APP_PASSWORD", "OPSENSE_ORG_ID")
    missing = [name for name in needed if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "Missing environment variables: " + ", ".join(missing)
            + f". Add them to {ENV_PATH}"
        )

    org_id = os.environ["OPSENSE_ORG_ID"]
    try:
        uuid.UUID(org_id)
    except ValueError:
        raise RuntimeError("OPSENSE_ORG_ID is not a valid UUID.") from None

    return Settings(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.environ["POSTGRES_DB"],
        user=os.getenv("OPSENSE_APP_USER", "opsense_app"),
        password=os.environ["OPSENSE_APP_PASSWORD"],
        org_id=org_id,
    )
