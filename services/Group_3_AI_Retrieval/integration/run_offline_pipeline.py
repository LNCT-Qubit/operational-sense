"""Run the full M07 -> M09 -> M08 flow OFFLINE and write an honest evidence file.

  python -m integration.run_offline_pipeline [--dataset synthetic_dataset/synthetic_cases.json]
                                            [--out poc/execution_evidence/offline_pipeline_run.json]

WHAT THIS PROVES   : validation, mapping, text/metadata construction, vector-dimension and identity
                     preservation, filtering, eligibility handling, top-k ordering mechanics.
WHAT THIS DOES NOT : model quality, real embeddings, PostgreSQL, pgvector SQL, RLS. The vectors are TEST-ONLY
                     lexical hashes (tests/fakes.py HashingBackend) and the store is an in-memory MOCK.
Similarity values printed here have NO meaning for multilingual-e5-small.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import sys
from datetime import datetime, timezone

from case_schema.reference_data import load_reference
from retrieval.embedder import EmbeddingService
from retrieval.ingest import run_ingestion
from retrieval.search import search_similar_cases
from tests.fakes import HashingBackend, InMemoryRepository, small_settings

from .pipeline import ORG_DEMO, load_dataset, offline_case_rows, prepare

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUERIES = [  # technician-style queries; NOT a measured evaluation set
    ("bearing garam hai aur ghurr-ghurr awaaz aa rahi hai", None),
    ("seal se paani leak ho raha hai pump chalu karne ke baad", "EQ-PUMP"),
    ("motor start hote hi trip ho jata hai aur jalne ki smell aa rahi hai", "EQ-MOTOR"),
    ("compressor discharge temperature high shutdown oil cooler dusty", "EQ-COMP"),
]


def run(dataset_path: str) -> dict:
    ref = load_reference(os.path.join(ROOT, "database"))
    cases = load_dataset(dataset_path)
    rep = prepare(cases, ref)
    settings = small_settings()
    service = EmbeddingService(settings, backend=HashingBackend(settings.dimension))
    repo = InMemoryRepository(offline_case_rows(rep.prepared), column_dim=settings.dimension)

    # (1) trusted-only ingestion: every synthetic case is DRAFT/demo-only, so NOTHING may be embedded
    trusted = run_ingestion(repo, service, include_demo=False)
    # (2) explicit demo ingestion, run twice to prove re-embedding creates no duplicate vectors
    demo1 = run_ingestion(repo, service, include_demo=True)
    stored_after_first = len(repo.historical)
    demo2 = run_ingestion(repo, service, include_demo=True)
    stored_after_second = len(repo.historical)

    by_ref = {c["case_reference"]: c for c in cases}
    searches = []
    for text, cls in QUERIES:
        t = search_similar_cases(repo, service, text, equipment_class_id=cls, include_demo=False)
        d = search_similar_cases(repo, service, text, equipment_class_id=cls, include_demo=True)
        searches.append({
            "query": text, "class_filter": cls,
            "trusted_mode_status": t.status, "trusted_mode_results": len(t.results),
            "demo_mode_status": d.status,
            "demo_top3": [{"rank": r.rank, "case_reference": r.case_reference, "equipment_class_id": r.equipment_class_id,
                           "subsystem": by_ref[r.case_reference]["subsystem_name"] or f"(unresolved: {r.subsystem_source_label})",
                           "case_status": r.case_status, "evidence_level": r.evidence_level,
                           "summary": (r.symptom_structured or "")[:110], "similarity_MOCK": r.similarity,
                           "details_withheld": bool(r.details_withheld_reason)} for r in d.results],
            "notice": d.notice})
    # identity checks across the whole flow
    drift = []
    for p in rep.prepared:
        src = by_ref[p.case_reference]
        row = p.db_rows["operational_case"]
        for k in ("case_reference", "equipment_class_id", "case_status", "retrieval_eligibility", "is_synthetic"):
            if row[k] != src[k] or p.metadata.get(k, src[k]) != src[k]:
                drift.append((p.case_reference, k))
    dims = {len(h["embedding"]) for h in repo.historical.values()}
    return {
        "executed_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "environment": {"python": platform.python_version(), "platform": platform.platform(),
                        "database": "NONE (in-memory MOCK repository)", "embedding_backend": "TEST-ONLY hashing vectors, dimension %d (NOT multilingual-e5-small)" % settings.dimension,
                        "pgvector_executed": False, "model_inference_executed": False},
        "dataset": os.path.relpath(dataset_path, ROOT),
        "counts": {"cases_loaded": len(cases), "prepared": len(rep.prepared), "rejected": len(rep.rejected),
                   "skipped_no_text": len(rep.skipped_no_text), "validation_warnings": rep.warnings},
        "ingestion": {"trusted_only": {"selected": trusted.selected, "embedded": trusted.embedded},
                      "demo_run_1": {"selected": demo1.selected, "embedded": demo1.embedded},
                      "demo_run_2": {"selected": demo2.selected, "embedded": demo2.embedded},
                      "vectors_after_run_1": stored_after_first, "vectors_after_run_2": stored_after_second,
                      "duplicate_vectors_created": stored_after_second - stored_after_first},
        "vector_dimensions_stored": sorted(dims),
        "identity_drift": drift,
        "searches": searches,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dataset", default=os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "poc", "execution_evidence", "offline_pipeline_run.json"))
    a = ap.parse_args(argv)
    result = run(a.dataset)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(result, fh, indent=2, ensure_ascii=False); fh.write("\n")
    print(json.dumps({k: result[k] for k in ("counts", "ingestion", "vector_dimensions_stored", "identity_drift")}, indent=2))
    for s in result["searches"]:
        print(f"\nQ: {s['query']}  [class={s['class_filter']}]  trusted={s['trusted_mode_status']}  demo={s['demo_mode_status']}")
        for r in s["demo_top3"]:
            print(f"  #{r['rank']} {r['case_reference']:14s} {r['equipment_class_id']:9s} {r['subsystem'][:26]:26s} MOCK-sim={r['similarity_MOCK']:.3f}")
    print("\nNOTE: mock vectors and in-memory store; no model, no PostgreSQL, no pgvector were used.")
    return 1 if (result["identity_drift"] or result["counts"]["rejected"]) else 0


if __name__ == "__main__":
    sys.exit(main())
