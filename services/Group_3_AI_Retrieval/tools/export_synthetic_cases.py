"""Export the 50 synthetic cases from the project's SQL imports to canonical JSON (schema 1.0.0).

Source of truth stays the SQL (database/*.sql). This tool reads it with the M09 loaders and
writes synthetic_dataset/synthetic_cases.json. Nothing is invented:
  * values are copied as found ('' -> null only for blank fields);
  * subsystem_name is set ONLY by the exact-match rule used by database/sql/m09/m09_010 (no guessing);
  * taxonomy_code stays null where the source has none;
  * status/eligibility are copied from the import script (DRAFT / demo_only_until_expert_review);
  * created_at / updated_at stay null (DB-generated; no DB was available).

Group 3 Final: the curation overlay in tools/curation.py is applied by default (use --raw for the plain SQL export).

Usage:  python -m tools.export_synthetic_cases [--raw] [--db-dir database] [--out synthetic_dataset/synthetic_cases.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re

from case_schema import SCHEMA_VERSION
from case_schema.reference_data import load_reference
from m09 import loaders as L, sqlvalues as sv
from tools import curation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CASE_TEXT_FIELDS = [
    "subsystem_source_label", "component_name", "model_designation", "plant_facility", "production_line",
    "symptom_category", "symptom_text", "symptom_structured", "operating_status", "symptom_frequency",
    "severity_proposed", "primary_suspected_cause", "alternative_causes", "failure_mechanism",
    "differential_diagnosis", "corrective_action_text", "required_spares_text", "post_repair_verification",
    "acceptance_criteria", "recurrence_prevention", "early_warning", "case_origin", "evidence_type",
]
VERIFICATION_COLS = ["case_reference", "reviewer", "review_date", "technical_status", "taxonomy_status",
                     "source_status", "safety_status", "measurement_status", "overall_decision", "comments"]


def _blank_to_none(v):
    return None if v is None or (isinstance(v, str) and not v.strip()) else v


def _sha(path: str) -> str:
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def _verification_rows(db_dir: str) -> dict:
    with open(os.path.join(db_dir, L.PROJECT_FILES["links"]), encoding="utf-8") as fh:
        sql = fh.read()
    blocks = [b for b in sv.values_blocks(sql) if b]
    rows = [r for b in blocks for r in sv.rows(b) if len(r) == len(VERIFICATION_COLS)]
    return {r[0]: dict(zip(VERIFICATION_COLS, r)) for r in rows}


def build(db_dir: str, curate: bool = True) -> dict:
    ref = load_reference(db_dir)
    cases, _models, defaults, _ = L.load_cases(db_dir)
    steps = L.load_steps(db_dir)
    links, spares = L.load_links(db_dir)
    verification = _verification_rows(db_dir)
    steps_by, link_by, spare_by = {}, {}, {}
    for s in steps:
        steps_by.setdefault(s["case_reference"], []).append(s)
    for l in links:
        link_by.setdefault(l["case_reference"], []).append(l)
    for p in spares:
        spare_by.setdefault(p["case_reference"], []).append(p["part_name"])

    out = []
    for c in cases:
        cref, cls = c["case_reference"], c["equipment_class_id"]
        label = _blank_to_none(c["subsystem_source_label"])
        subsystem_name = None
        if label:
            for cand in sorted(ref.class_subsystems.get(cls, ())):
                if cand.strip().lower() == label.strip().lower():
                    subsystem_name = cand
        rec = {"schema_version": SCHEMA_VERSION, "case_reference": cref, "equipment_class_id": cls,
               "subsystem_source_label": label, "subsystem_name": subsystem_name}
        for f in CASE_TEXT_FIELDS[1:]:
            rec[f] = _blank_to_none(c[f])
        rec.update({
            "model_is_illustrative": True, "asset_id": None, "confirmed_cause": None,
            "root_cause_confirmation": None, "failure_effect": None, "observed_outcome": None,
            "source_reliability": c["source_reliability"], "is_synthetic": True,
            "needs_depth_expansion": bool(c["needs_depth_expansion"]),
            "case_status": defaults["case_status"], "retrieval_eligibility": defaults["retrieval_eligibility"],
            "verification_duration_seconds": None, "created_at": None, "updated_at": None,
        })
        rec["troubleshooting_steps"] = [
            {"step_number": int(s["step_number"]), "tier": int(s["tier"]),
             "step_reference": _blank_to_none(s["step_reference"]),
             "diagnostic_question": _blank_to_none(s["diagnostic_question"]),
             "check_measurement": s["check_measurement"],
             "required_instrument": _blank_to_none(s["required_instrument"]),
             "expected_observation": _blank_to_none(s["expected_observation"]),
             "interpretation": _blank_to_none(s["interpretation"]),
             "possible_failure_indication": _blank_to_none(s["possible_failure_indication"]),
             "next_step": _blank_to_none(s["next_step"]),
             "safety_warning": _blank_to_none(s["safety_warning"]),
             "supervisor_approval_required": bool(s["supervisor_approval_required"]),
             "source_reference": _blank_to_none(s["source_reference"])}
            for s in sorted(steps_by.get(cref, []), key=lambda s: int(s["step_number"]))]
        rec["failure_mappings"] = [
            {"taxonomy_code": _blank_to_none(l["taxonomy_code"]), "failure_mode_id": _blank_to_none(l["failure_mode_id"]),
             "mapping_status": _blank_to_none(l["source_mapping_note"]), "review_note": None}
            for l in link_by.get(cref, [])]
        src_ids = []
        for l in link_by.get(cref, []):
            src_ids += L.parse_source_ids(l["source_ref_ids"])
        rec["sources"] = [{"source_id": s, "relation_note": "Workbook Import_View source reference; not independently verified",
                           "evidence_role": None} for s in dict.fromkeys(src_ids)]
        rec["spare_parts"] = [{"part_name": p, "usage_note": None} for p in spare_by.get(cref, [])]
        v = verification[cref]
        rec["verification"] = {
            "reviewer": _blank_to_none(v["reviewer"]), "review_date": _blank_to_none(v["review_date"]),
            "technical_accuracy_status": v["technical_status"], "taxonomy_mapping_status": v["taxonomy_status"],
            "source_verification_status": v["source_status"], "safety_review_status": v["safety_status"],
            "measurement_validation_status": v["measurement_status"], "overall_decision": v["overall_decision"],
            "comments": v["comments"]}
        unresolved = []
        if subsystem_name is None: unresolved.append(f"UR-SUBSYS-{cref}")
        if not rec["component_name"]: unresolved.append(f"UR-COMP-{cref}")
        if any(m["taxonomy_code"] is None for m in rec["failure_mappings"]): unresolved.append(f"UR-TAX-{cref}")
        if rec["needs_depth_expansion"]: unresolved.append(f"UR-DEPTH-{cref}")
        rec["provenance"] = {
            "exported_from": "database/*.sql (Step 4.5 cases, Step 4.6 steps, Step 4 links)",
            "source_files": [L.PROJECT_FILES[k] for k in ("cases", "steps", "links")],
            "assumptions": ["Synthetic scenario; no field record and no OEM manual consulted.",
                            "Model designation and operating values are illustrative.",
                            "OEM/site-specific limits are not stated and require verification."],
            "unresolved_items": unresolved}
        if curate:
            rec = curation.curate_case(rec, ref.class_subsystems)
        out.append(rec)
    out.sort(key=lambda r: r["case_reference"])
    return {
        "dataset_id": "operational-sense-synthetic-v1",
        "schema_version": SCHEMA_VERSION,
        "data_status": "SYNTHETIC / DEMO-ONLY. Not reviewed by a qualified industrial expert; not production-ready.",
        "curation": ({"version": curation.CURATION_VERSION, "overlay": "tools/curation.py",
                      "note": "Group 3 Final overlay applied on top of the SQL imports (see documentation/CHANGELOG.md)."}
                     if curate else None),
        "generated_from": {os.path.join("database", L.PROJECT_FILES[k]): _sha(os.path.join(db_dir, L.PROJECT_FILES[k]))
                           for k in ("cases", "steps", "links")},
        "cases": out,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db-dir", default=os.path.join(ROOT, "database"))
    ap.add_argument("--raw", action="store_true", help="export the SQL imports as-is, without the Group 3 curation overlay")
    ap.add_argument("--out", default=os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"))
    a = ap.parse_args(argv)
    data = build(a.db_dir, curate=not a.raw)
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {len(data['cases'])} cases -> {os.path.relpath(a.out, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
