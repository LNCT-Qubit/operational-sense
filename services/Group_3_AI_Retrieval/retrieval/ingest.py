"""Embedding pipeline: eligible cases -> case text -> vectors -> historical_case.

Safe to re-run: historical_case has one row per case (primary key case_id) and the
pipeline uses INSERT ... ON CONFLICT DO UPDATE, so repeating it never creates duplicates.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

from .embedder import EmbeddingService, to_pgvector_literal
from .errors import DimensionMismatchError
from .text_builder import TEXT_BUILDER_VERSION, build_case_text, text_sha256

log = logging.getLogger("retrieval.ingest")


@dataclass
class IngestSummary:
    model: str
    dimension: int
    include_demo: bool
    dry_run: bool
    selected: int = 0
    embedded: int = 0
    skipped_no_text: list = field(default_factory=list)   # case_reference values
    withdrawn: int = 0
    stale_replaced: int = 0       # rows whose stored model / text hash / text version differed and were re-embedded

    def as_dict(self) -> dict:
        return asdict(self)


def check_dimension_matches_database(repo: Any, service: EmbeddingService) -> None:
    """Refuse to run if the configured dimension differs from historical_case.embedding."""
    column_dim = repo.get_embedding_column_dimension()
    if column_dim is None:
        log.warning("historical_case.embedding has no fixed dimension; cannot cross-check.")
        return
    if column_dim != service.dimension:
        raise DimensionMismatchError(
            f"historical_case.embedding is vector({column_dim}) but OPSENSE_EMBEDDING_DIM is "
            f"{service.dimension} (model {service.model_name}). Nothing was changed. "
            "Changing the column needs team approval - see embedding_strategy.md section 'Re-embedding'."
        )


def run_ingestion(repo: Any, service: EmbeddingService, *, include_demo: bool = False,
                  limit: Optional[int] = None, dry_run: bool = False,
                  withdraw_ineligible: bool = False, actor: str = "m08-embed-cases") -> IngestSummary:
    summary = IngestSummary(model=service.model_name, dimension=service.dimension,
                            include_demo=include_demo, dry_run=dry_run)
    if service.is_mock and not getattr(repo, "ALLOWS_MOCK_VECTORS", False):
        service.require_real("ingestion into a real database")      # raises MockEmbeddingError
    check_dimension_matches_database(repo, service)
    if not dry_run and not service.is_mock:
        service.verify_model_dimension()                              # model's own dimension vs configuration

    cases = repo.fetch_cases_for_embedding(include_demo=include_demo, limit=limit)
    summary.selected = len(cases)

    prepared: list[tuple[dict, str]] = []
    for case in cases:
        text = build_case_text(case)
        if text is None:
            summary.skipped_no_text.append(case.get("case_reference"))
            log.warning("Skipping %s: no usable symptom text", case.get("case_reference"))
            continue
        prepared.append((case, text))

    if dry_run:
        log.info("Dry run: %d case(s) would be embedded; nothing written.", len(prepared))
        return summary

    state = repo.fetch_embedding_state() if hasattr(repo, "fetch_embedding_state") else {}
    vectors = service.embed_documents([t for _, t in prepared]) if prepared else []
    for (case, text), vector in zip(prepared, vectors):
        meta = {"model": service.model_name, "dimension": service.dimension,
                "text_sha256": text_sha256(text), "text_version": TEXT_BUILDER_VERSION}
        old = state.get(str(case["case_id"]))
        if old is not None and old != (meta["model"], meta["text_sha256"], meta["text_version"]):
            summary.stale_replaced += 1
        try:
            repo.upsert_embedding(case, to_pgvector_literal(vector), meta)
        except TypeError:                      # a repository without metadata support
            repo.upsert_embedding(case, to_pgvector_literal(vector))
        summary.embedded += 1

    if withdraw_ineligible:
        summary.withdrawn = repo.withdraw_ineligible(include_demo=include_demo)

    # Model, dimension and text hash are stored per row (migration 008) and summarised in audit_log.
    repo.record_run(actor, "EMBEDDING_RUN", summary.as_dict())
    log.info("Embedded %d case(s) with %s.", summary.embedded, service.model_name)
    return summary
