"""Command-line similarity search.

  python -m retrieval.search_cases "bearing garam hai aur ghurr-ghurr awaaz" --class EQ-PUMP
  python -m retrieval.search_cases "..." --include-demo --json

Exit codes: 0 ok (including "no results"), 2 configuration, 3 bad query, 4 embedding model problem, 5 database problem.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys

from .embedder import EmbeddingService, validate_query
from .embedding_config import ConfigError, load_embedding_settings
from .errors import DimensionMismatchError, EmbeddingUnavailableError, InvalidQueryError, StorageError
from .search import search_similar_cases


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("query", help="symptom description, in the technician's own words")
    p.add_argument("--class", dest="equipment_class_id", help="e.g. EQ-PUMP, EQ-MOTOR, EQ-COMP")
    p.add_argument("--subsystem-id", type=int)
    p.add_argument("--model-id", dest="equipment_model_id", help="equipment_model UUID")
    p.add_argument("--taxonomy-code", help="e.g. PUMP.BRNG.ROLL (matches case_failure_mapping)")
    p.add_argument("--failure-mode-id", help="e.g. FM-051 (project-local id, not an ISO 14224 code)")
    p.add_argument("--synthetic", choices=["true", "false"], help="filter on the is_synthetic flag")
    p.add_argument("--include-demo", action="store_true", help="include unreviewed DRAFT/SUBMITTED demo cases")
    p.add_argument("--steps", action="store_true", help="include diagnostic steps of TRUSTED cases")
    p.add_argument("--json", action="store_true", help="print JSON")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    try:
        emb_settings = load_embedding_settings()
        validate_query(args.query, emb_settings.max_query_chars)  # fail fast, before any database/model work
        from .config import load_settings          # imported here so a missing package gives a clean message
        from .db import tenant_connection
        from .repository import PostgresRepository
        db_settings = load_settings()
        service = EmbeddingService(emb_settings)
        with tenant_connection(db_settings) as conn:
            repo = PostgresRepository(conn, db_settings.org_id)
            response = search_similar_cases(
                repo, service, args.query, equipment_class_id=args.equipment_class_id,
                subsystem_id=args.subsystem_id, equipment_model_id=args.equipment_model_id,
                taxonomy_code=args.taxonomy_code, failure_mode_id=args.failure_mode_id,
                is_synthetic=None if args.synthetic is None else args.synthetic == "true",
                include_demo=args.include_demo, include_steps=args.steps)
    except InvalidQueryError as exc:
        print("ERROR:", exc); return 3
    except ImportError as exc:
        print("ERROR: a required Python package is missing:", exc, "\nRun: pip install -r requirements.txt"); return 2
    except (RuntimeError, ConfigError) as exc:
        print("ERROR:", exc); return 2
    except (EmbeddingUnavailableError, DimensionMismatchError) as exc:
        print("ERROR:", exc); return 4
    except StorageError as exc:
        print("ERROR:", exc); return 5

    if args.json:
        print(json.dumps(response.as_dict(), indent=2, ensure_ascii=False, default=str))
        return 0

    print(response.notice)
    for w in response.warnings:
        print("!", w)
    for r in response.results:
        print(f"\n#{r.rank} {r.case_reference}  similarity={r.similarity:.3f}  [{r.evidence_level}]")
        print(f"   class={r.equipment_class_id} component={r.component_name} category={r.symptom_category}")
        if r.missing_metadata:
            print("   missing metadata:", ", ".join(r.missing_metadata))
        print("   symptom:", (r.symptom_structured or r.symptom_text or "")[:200])
        if r.historical_suspected_cause:
            print("   historical suspected cause (unconfirmed):", r.historical_suspected_cause[:200])
    return 0


if __name__ == "__main__":
    sys.exit(main())
