"""End-to-end flow, offline-capable:

  JSON case -> schema + semantic validation -> DB row mapping -> embedding text -> metadata
            -> embedding (injected backend) -> vector store (injected repository) -> similarity search
            -> original case reference + metadata

The embedding backend and the repository are injected, so the same code runs against
  * a MOCK (hashing vectors + in-memory store)  - offline tests, no model, no database   [mock integration, level 2; also executed against scratch PostgreSQL with MOCK vectors via tools/live_pg_check.py]
  * the real model + PostgreSQL/pgvector       - via retrieval.embed_cases / search_cases [real model: NEVER executed; real DB path: scratch PostgreSQL only]
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Optional

from case_schema import case_validation as cv
from case_schema.reference_data import ReferenceData
from retrieval.embedder import EmbeddingService, to_pgvector_literal
from retrieval.ingest import run_ingestion
from retrieval.search import search_similar_cases
from retrieval.text_builder import TEXT_BUILDER_VERSION, build_case_text, extract_metadata, text_sha256

from .mapping import case_to_db_rows

ORG_DEMO = "b2a7dce7-b449-4381-ba3b-b520f2c88c2e"   # demo organisation of the seed scripts (synthetic tenant)


def load_dataset(path: str) -> list:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return data["cases"] if isinstance(data, dict) and "cases" in data else data


@dataclass
class PreparedCase:
    case_reference: str
    db_rows: dict
    text: Optional[str]
    text_sha256: Optional[str]
    metadata: dict


@dataclass
class PrepareReport:
    prepared: list = field(default_factory=list)
    rejected: list = field(default_factory=list)       # (case_reference, reason)
    skipped_no_text: list = field(default_factory=list)
    warnings: int = 0


def prepare(cases: list, ref: ReferenceData, organization_id: str = ORG_DEMO) -> PrepareReport:
    """Validate, map, build text and metadata. Invalid cases are rejected, never repaired."""
    rep = PrepareReport()
    dataset_errors = [i for i in cv.validate_dataset(cases, ref) if i.severity == "ERROR" and i.code in ("DUP-ID", "DUP-STEP-REF")]
    if dataset_errors:
        raise ValueError("dataset-level errors: " + "; ".join(f"{i.code} {i.case_reference or ''}" for i in dataset_errors))
    from .mapping import MappingError
    for c in cases:
        try:
            rows = case_to_db_rows(c, ref, organization_id)
        except MappingError as exc:
            rep.rejected.append((c.get("case_reference"), str(exc)))
            continue
        rep.warnings += sum(1 for i in cv.validate_case(c, ref) if i.severity == "WARNING")
        text = build_case_text(rows["operational_case"])
        if text is None:
            rep.skipped_no_text.append(c["case_reference"])
        meta = extract_metadata({**c, **rows["operational_case"]})
        rep.prepared.append(PreparedCase(c["case_reference"], rows, text, text_sha256(text) if text else None, meta))
    return rep


def offline_case_rows(prepared: list) -> list:
    """Rows shaped like PostgresRepository.fetch_cases_for_embedding() output, for the in-memory repository.

    OFFLINE STAND-IN: subsystem_id carries the approved subsystem NAME (or None) because the real BIGINT
    identity does not exist without a database. The real loader resolves the name to the id.
    """
    out = []
    for p in prepared:
        r = dict(p.db_rows["operational_case"])
        r["subsystem_id"] = r.get("subsystem_name")
        out.append(r)
    return out
