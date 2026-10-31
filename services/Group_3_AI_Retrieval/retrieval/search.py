"""Similarity search over eligible historical cases (top three).

SAFETY: results are SIMILAR HISTORICAL CASES, not diagnoses. Similarity is a text
similarity score, not a probability that the cause is the same. Corrective actions
and diagnostic steps are shown only for TRUSTED (verified + eligible) cases and are
labelled as historical information that still needs supervisor/site-procedure approval.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

from . import eligibility
from .embedder import EmbeddingService, to_pgvector_literal, validate_query
from .errors import InvalidQueryError

log = logging.getLogger("retrieval.search")

TOP_K = 3

NOTICE = (
    "These are similar HISTORICAL cases, not a diagnosis. Similarity does not show that the cause "
    "or action is the same for your equipment. Any action needs supervisor approval and your site's "
    "safety procedures (isolation / LOTO) before work."
)
DEMO_NOTICE = (
    "DEMO MODE: results include DRAFT/SUBMITTED synthetic cases that have not had expert review. "
    "They are not trusted evidence. Causes, actions and steps are withheld for them."
)
FILTER_NOTE = (
    "A subsystem filter only matches cases whose subsystem_id is set; cases with only a "
    "source subsystem label (subsystem_id NULL) are excluded by that filter."
)

# Fields whose absence is worth telling the user about.
_TRACKED_METADATA = ("subsystem_id", "component_name", "symptom_category", "source_reliability")


@dataclass
class SearchResult:
    rank: int
    case_id: str
    case_reference: str
    similarity: float
    evidence_level: str
    case_status: str
    retrieval_eligibility: str
    equipment_class_id: Optional[str]
    subsystem_id: Optional[int]
    subsystem_source_label: Optional[str]
    component_name: Optional[str]
    symptom_category: Optional[str]
    symptom_text: Optional[str]
    symptom_structured: Optional[str]
    source_reliability: Optional[str]
    is_synthetic: Optional[bool]
    historical_suspected_cause: Optional[str] = None   # unconfirmed, TRUSTED cases only
    historical_action_text: Optional[str] = None       # TRUSTED cases only
    diagnostic_steps: list = field(default_factory=list)  # TRUSTED cases, only if requested
    missing_metadata: list = field(default_factory=list)
    details_withheld_reason: Optional[str] = None


@dataclass
class SearchResponse:
    status: str                      # "OK" or "NO_RESULTS"
    query: str
    results: list
    filters: dict
    embedding_model: str
    include_demo: bool
    notice: str = NOTICE
    warnings: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def search_similar_cases(repo: Any, service: EmbeddingService, query: str, *,
                         equipment_class_id: Optional[str] = None,
                         subsystem_id: Optional[int] = None,
                         equipment_model_id: Optional[str] = None,
                         taxonomy_code: Optional[str] = None, failure_mode_id: Optional[str] = None,
                         is_synthetic: Optional[bool] = None,
                         include_demo: bool = False, include_steps: bool = False,
                         limit: int = TOP_K, min_similarity: Optional[float] = None) -> SearchResponse:
    cleaned = validate_query(query, service.settings.max_query_chars)  # raises InvalidQueryError
    if not isinstance(limit, int) or limit < 1:
        raise InvalidQueryError("limit must be a positive whole number.")
    limit = min(limit, TOP_K)
    if min_similarity is None:
        min_similarity = service.settings.min_similarity

    log.info("Search: %d characters, class=%s, subsystem=%s, demo=%s",
             len(cleaned), equipment_class_id, subsystem_id, include_demo)

    if service.is_mock and not getattr(repo, "ALLOWS_MOCK_VECTORS", False):
        service.require_real("searching a real database")           # raises MockEmbeddingError
    vector = service.embed_query(cleaned)
    rows = repo.search(
        to_pgvector_literal(vector), include_demo=include_demo, limit=limit,
        equipment_class_id=equipment_class_id, subsystem_id=subsystem_id,
        equipment_model_id=equipment_model_id, taxonomy_code=taxonomy_code,
        failure_mode_id=failure_mode_id, is_synthetic=is_synthetic,
        embedding_model=service.model_name,
    )

    results: list[SearchResult] = []
    for row in rows:
        level = eligibility.evidence_level(row.get("case_status"), row.get("retrieval_eligibility"),
                                           include_demo=include_demo)
        if level is None:  # second safety net in case a repository returns something it should not
            log.error("Dropped %s: not eligible", row.get("case_reference"))
            continue
        similarity = float(row["similarity"])
        if min_similarity is not None and similarity < min_similarity:
            continue
        item = SearchResult(
            rank=0, case_id=str(row["case_id"]), case_reference=row.get("case_reference"),
            similarity=round(similarity, 6), evidence_level=level,
            case_status=row.get("case_status"), retrieval_eligibility=row.get("retrieval_eligibility"),
            equipment_class_id=row.get("equipment_class_id"), subsystem_id=row.get("subsystem_id"),
            subsystem_source_label=row.get("subsystem_source_label"),
            component_name=row.get("component_name"), symptom_category=row.get("symptom_category"),
            symptom_text=row.get("symptom_text"), symptom_structured=row.get("symptom_structured"),
            source_reliability=row.get("source_reliability"), is_synthetic=row.get("is_synthetic"),
            missing_metadata=[f for f in _TRACKED_METADATA if row.get(f) in (None, "")],
        )
        if level == eligibility.TRUSTED:
            item.historical_suspected_cause = row.get("primary_suspected_cause")
            item.historical_action_text = row.get("corrective_action_text")
        else:
            item.details_withheld_reason = "Case is not verified; causes/actions/steps are not shown."
        results.append(item)

    results = results[:TOP_K]
    for i, item in enumerate(results, start=1):
        item.rank = i

    if include_steps:
        trusted = [r for r in results if r.evidence_level == eligibility.TRUSTED]
        steps = repo.fetch_steps([r.case_id for r in trusted])
        for r in trusted:
            r.diagnostic_steps = steps.get(r.case_id, [])

    warnings = []
    if include_demo:
        warnings.append(DEMO_NOTICE)
    if subsystem_id is not None:
        warnings.append(FILTER_NOTE)
    if not results:
        warnings.append("No eligible similar historical cases were found. This does not mean the "
                        "problem is new or safe; continue with your normal troubleshooting procedure.")

    return SearchResponse(
        status="OK" if results else "NO_RESULTS", query=cleaned, results=results,
        filters={"equipment_class_id": equipment_class_id, "subsystem_id": subsystem_id,
                 "equipment_model_id": equipment_model_id, "taxonomy_code": taxonomy_code,
                 "failure_mode_id": failure_mode_id, "is_synthetic": is_synthetic},
        embedding_model=service.model_name, include_demo=include_demo, warnings=warnings,
    )

