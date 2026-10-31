"""Evaluation runner (M08).

  python -m retrieval.evaluate --validate-only          # offline: checks the dataset, runs no model
  python -m retrieval.evaluate --include-demo           # REAL run: needs database + embedding model

If the model or database is unavailable the runner writes a report marked NOT RUN. It never
prints made-up numbers. Results are written to retrieval/evaluation/reports/.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from .errors import RetrievalError
from .metrics import hit_at_k, mean, recall_at_k, reciprocal_rank
from .search import search_similar_cases

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "retrieval" / "evaluation" / "m08_eval_dataset.json"
REPORT_DIR = ROOT / "retrieval" / "evaluation" / "reports"
SEED_CASES_SQL = ROOT / "database" / "Operational_Sense_Step4_5_Import_Operational_Cases.sql"


def load_dataset(path: Path = DATASET_PATH) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def sha256_of(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def known_seed_references(sql_path: Path = SEED_CASES_SQL) -> set[str]:
    text = Path(sql_path).read_text(encoding="utf-8")
    return set(re.findall(r"\(\s*'(CASE-[A-Z]+-\d{3})'", text))


ALLOWED_FILTER_KEYS = {"equipment_class_id"}   # the only filter run_evaluation actually applies


def validate_dataset(dataset: dict, known_refs: set[str], cases: list | None = None,
                     valid_classes: set | None = None) -> list[str]:
    """Return a list of problems (empty = fine).

    With `cases` (canonical case records) and `valid_classes` the check also covers: filter keys the runner
    understands, valid equipment classes, expected cases belonging to the filtered class, duplicate expected IDs.
    This validates the DATASET only; it says nothing about retrieval quality."""
    problems, seen = [], set()
    by_ref = {c["case_reference"]: c for c in (cases or [])}
    for item in dataset.get("queries", []):
        qid = item.get("id", "?")
        if qid in seen:
            problems.append(f"{qid}: duplicate id")
        seen.add(qid)
        if not str(item.get("query", "")).strip():
            problems.append(f"{qid}: empty query")
        exp = item.get("expected_case_ids", [])
        if len(exp) != len(set(exp)):
            problems.append(f"{qid}: duplicate expected case ids")
        for ref in exp:
            if ref not in known_refs:
                problems.append(f"{qid}: expected case {ref} is not in the seed data")
            elif cases is not None and ref not in by_ref:
                problems.append(f"{qid}: expected case {ref} is not in the canonical dataset")
        filters = item.get("filters", {}) or {}
        for key in filters:
            if key not in ALLOWED_FILTER_KEYS:
                problems.append(f"{qid}: unsupported filter '{key}' (it would be silently ignored)")
        cls = filters.get("equipment_class_id")
        if cls is not None:
            if valid_classes is not None and cls not in valid_classes:
                problems.append(f"{qid}: unknown equipment class {cls}")
            for ref in exp:
                if ref in by_ref and by_ref[ref]["equipment_class_id"] != cls:
                    problems.append(f"{qid}: expected case {ref} is {by_ref[ref]['equipment_class_id']} but the filter is {cls}")
    return problems


def run_evaluation(repo, service, dataset: dict, *, include_demo: bool) -> dict:
    """Run every dataset query. Returns per-query rows and aggregate metrics."""
    rows = []
    for item in dataset["queries"]:
        expected = item.get("expected_case_ids", [])
        response = search_similar_cases(
            repo, service, item["query"], include_demo=include_demo,
            equipment_class_id=item.get("filters", {}).get("equipment_class_id"))
        ranked = [r.case_reference for r in response.results]
        rows.append({
            "id": item["id"], "category": item["category"], "expected": expected,
            "top3": ranked, "similarities": [r.similarity for r in response.results],
            "hit_at_3": hit_at_k(ranked, expected), "recall_at_3": recall_at_k(ranked, expected),
            "reciprocal_rank": reciprocal_rank(ranked, expected),
        })
    scored = [r for r in rows if r["expected"]]
    by_cat = {}
    for cat in sorted({r["category"] for r in scored}):
        sub = [r for r in scored if r["category"] == cat]
        by_cat[cat] = {"n": len(sub), "recall_at_3": mean([r["recall_at_3"] for r in sub]),
                       "mrr": mean([r["reciprocal_rank"] for r in sub])}
    return {"rows": rows, "n_scored": len(scored),
            "overall": {"hit_at_3": mean([1.0 if r["hit_at_3"] else 0.0 for r in scored]),
                        "recall_at_3": mean([r["recall_at_3"] for r in scored]),
                        "mrr": mean([r["reciprocal_rank"] for r in scored])},
            "by_category": by_cat}


def _fmt(x):
    return "n/a" if x is None else f"{x:.3f}"


def render_report(status: str, *, dataset_sha: str, reason: str = "", model: str = "",
                  include_demo: bool = False, result: dict | None = None) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = [f"# M08 Evaluation Report\n", f"**STATUS: {status}**  ", f"Generated: {now}  ",
           f"Dataset: `retrieval/evaluation/m08_eval_dataset.json` (sha256 `{dataset_sha}`)  ",
           f"Embedding model: `{model or 'not loaded'}`  ", f"Demo cases included: {include_demo}\n"]
    if status != "COMPLETED":
        out += [f"This evaluation was **NOT RUN**. Reason: {reason}", "",
                "No metrics or retrieved cases are reported because none were produced.\n"]
        return "\n".join(out)
    o = result["overall"]
    out += ["Expected IDs are an engineering reading of synthetic cases, not expert-validated ground truth. "
            "Cases are unreviewed demo data; this measures retrieval behaviour only.\n",
            "## Overall (queries with expected IDs)", "",
            f"- Scored queries: {result['n_scored']}", f"- Hit@3: {_fmt(o['hit_at_3'])}",
            f"- Recall@3: {_fmt(o['recall_at_3'])}", f"- MRR: {_fmt(o['mrr'])}", "",
            "## By category", "", "| Category | n | Recall@3 | MRR |", "|---|---|---|---|"]
    for cat, m in result["by_category"].items():
        out.append(f"| {cat} | {m['n']} | {_fmt(m['recall_at_3'])} | {_fmt(m['mrr'])} |")
    out += ["", "## Per query", "", "| ID | Category | Expected | Actual top 3 (similarity) | Hit@3 |", "|---|---|---|---|---|"]
    for r in result["rows"]:
        top = ", ".join(f"{c} ({s:.3f})" for c, s in zip(r["top3"], r["similarities"])) or "(none)"
        hit = "n/a" if r["hit_at_3"] is None else ("PASS" if r["hit_at_3"] else "FAIL")
        out.append(f"| {r['id']} | {r['category']} | {', '.join(r['expected']) or '-'} | {top} | {hit} |")
    return "\n".join(out) + "\n"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--validate-only", action="store_true", help="check the dataset offline; no model, no database")
    p.add_argument("--include-demo", action="store_true", help="needed while all cases are DRAFT/demo-only")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)

    dataset = load_dataset()
    sha = sha256_of(DATASET_PATH)
    cases = json.loads((ROOT / "synthetic_dataset" / "synthetic_cases.json").read_text(encoding="utf-8"))["cases"]
    problems = validate_dataset(dataset, known_seed_references(), cases, {c["equipment_class_id"] for c in cases})
    if problems:
        print("Dataset problems:\n  " + "\n  ".join(problems)); return 1
    print(f"Dataset OK: {len(dataset['queries'])} queries (sha256 {sha[:12]}...)  [dataset VALIDATION only; not a benchmark result]")
    if args.validate_only:
        return 0

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / "M08_evaluation_report.md"
    try:  # heavy imports only for a real run
        from .config import load_settings
        from .db import tenant_connection
        from .embedder import EmbeddingService
        from .embedding_config import load_embedding_settings
        from .repository import PostgresRepository
        db_settings, emb_settings = load_settings(), load_embedding_settings()
        service = EmbeddingService(emb_settings)
        with tenant_connection(db_settings) as conn:
            result = run_evaluation(PostgresRepository(conn, db_settings.org_id), service, dataset,
                                    include_demo=args.include_demo)
    except (RetrievalError, RuntimeError, ImportError, ValueError) as exc:
        reason = (f"a required Python package is missing ({exc}); run pip install -r requirements.txt"
                  if isinstance(exc, ImportError) else str(exc))
        report_path.write_text(render_report("NOT RUN", dataset_sha=sha, reason=reason,
                                             include_demo=args.include_demo), encoding="utf-8")
        print("NOT RUN:", reason); print("Report written:", report_path); return 2

    report_path.write_text(render_report("COMPLETED", dataset_sha=sha, model=service.model_name,
                                         include_demo=args.include_demo, result=result), encoding="utf-8")
    (REPORT_DIR / "M08_evaluation_results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("Report written:", report_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
