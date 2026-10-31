"""Generate and store embeddings for eligible cases.

  python -m retrieval.embed_cases --dry-run              # no model, no writes
  python -m retrieval.embed_cases                        # TRUSTED cases only (VERIFIED + eligible)
  python -m retrieval.embed_cases --include-demo         # also DRAFT/SUBMITTED demo cases

Exit codes: 0 ok, 2 configuration, 4 embedding model problem, 5 database problem, 6 dimension mismatch.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

from .embedder import EmbeddingService
from .embedding_config import ConfigError, load_embedding_settings
from .errors import DimensionMismatchError, EmbeddingUnavailableError, StorageError
from .ingest import run_ingestion


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--include-demo", action="store_true",
                   help="also embed DRAFT/SUBMITTED demo-only cases (never treated as trusted)")
    p.add_argument("--limit", type=int, help="only the first N cases (testing)")
    p.add_argument("--dry-run", action="store_true", help="select cases and build text; load no model, write nothing")
    p.add_argument("--withdraw-ineligible", action="store_true",
                   help="clear vectors of cases that are no longer eligible")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    try:
        from .config import load_settings          # imported here so a missing package gives a clean message
        from .db import tenant_connection
        from .repository import PostgresRepository
        db_settings = load_settings()
        emb_settings = load_embedding_settings()
        service = EmbeddingService(emb_settings) if not args.dry_run else _DryRunService(emb_settings)
        with tenant_connection(db_settings) as conn:
            repo = PostgresRepository(conn, db_settings.org_id)
            summary = run_ingestion(repo, service, include_demo=args.include_demo, limit=args.limit,
                                    dry_run=args.dry_run, withdraw_ineligible=args.withdraw_ineligible)
    except ImportError as exc:
        print("ERROR: a required Python package is missing:", exc, "\nRun: pip install -r requirements.txt"); return 2
    except (RuntimeError, ConfigError) as exc:   # config.py and db.py raise RuntimeError
        print("ERROR:", exc); return 2
    except DimensionMismatchError as exc:
        print("ERROR:", exc); return 6
    except EmbeddingUnavailableError as exc:
        print("ERROR:", exc); return 4
    except StorageError as exc:
        print("ERROR:", exc, "(no changes were saved)"); return 5

    print(json.dumps(summary.as_dict(), indent=2, default=str))
    return 0


class _DryRunService:
    """Stands in for EmbeddingService when --dry-run: never loads a model."""
    def __init__(self, settings):
        self.settings = settings
        self.model_name = settings.model
        self.dimension = settings.dimension


if __name__ == "__main__":
    sys.exit(main())
