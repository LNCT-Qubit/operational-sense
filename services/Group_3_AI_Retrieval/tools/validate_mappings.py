"""Validate subsystem / component / taxonomy mapping of every synthetic case against the project's own reference data.

Produces synthetic_dataset/mapping_validation_report.json and .md with FOUR separate categories:
  RESOLVED               field present and consistent with the reference data (M06 list + failure_mode_taxonomy + vocabulary)
  UNRESOLVED             field empty (never guessed); reason recorded
  INVALID                field present but contradicts the reference data (must be 0; the command exits 1 otherwise)
  REQUIRES_GROUP1_REVIEW unresolved, provisional (curated) or workbook-AMBIGUOUS mappings
Usage: python -m tools.validate_mappings [--check]
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

from case_schema.reference_data import load_reference
from m09 import loaders as L
from tools import curation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "database")
DATA = os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json")


def analyse(cases, db_dir=DB):
    ref = load_reference(db_dir)
    m06 = L.load_m06(db_dir)
    comp_by_class = collections.defaultdict(set)         # class -> {(subsystem, component)}
    code_row = {}                                        # taxonomy_code -> (class, subsystem, component)
    for r in m06:
        comp_by_class[r["equipment_class_id"]].add((r["subsystem_assembly"].strip(), r["component_maintainable_item"].strip()))
        code_row[r["taxonomy_code"]] = (r["equipment_class_id"], r["subsystem_assembly"].strip(), r["component_maintainable_item"].strip())
    out = []
    for c in cases:
        cls, ref_id = c["equipment_class_id"], c["case_reference"]
        rec = {"case_reference": ref_id, "equipment_class_id": cls, "fields": {}, "invalid": [], "review": []}
        sub, label = c.get("subsystem_name"), c.get("subsystem_source_label")
        if sub is None:
            rec["fields"]["subsystem"] = "UNRESOLVED"
            rec["review"].append(("subsystem", curation.UNRESOLVED_REASONS.get(ref_id, "label not in approved list"), "Group 1 (domain)"))
        elif sub not in ref.class_subsystems.get(cls, frozenset()):
            rec["fields"]["subsystem"] = "INVALID"; rec["invalid"].append(f"subsystem {sub!r} not approved for {cls}")
        else:
            rec["fields"]["subsystem"] = "RESOLVED"
            if sub.strip().lower() != (label or "").strip().lower():
                rec["review"].append(("subsystem", "resolved by curated rule; confirmation pending", "Group 1 (domain)"))
        comp = c.get("component_name")
        if not comp:
            rec["fields"]["component"] = "UNRESOLVED"
            rec["review"].append(("component", "component not identified in source; not inferred", "Group 1 (domain)"))
        elif comp.strip() not in {cm for _s, cm in comp_by_class[cls]}:
            rec["fields"]["component"] = "INVALID"; rec["invalid"].append(f"component {comp!r} not in M06 list for {cls}")
        else:
            rec["fields"]["component"] = "RESOLVED"
        maps = c["failure_mappings"]
        states = []
        for m in maps:
            code, fm = m["taxonomy_code"], m["failure_mode_id"]
            if fm is not None and fm not in ref.failure_modes:
                rec["invalid"].append(f"failure_mode_id {fm} not in vocabulary"); states.append("INVALID"); continue
            if code is None:
                states.append("UNRESOLVED")
                rec["review"].append(("taxonomy_code", f"no code in approved taxonomy for this case (failure_mode_id={fm}); none invented", "Group 1 (domain)"))
            elif code not in ref.taxonomy or ref.taxonomy[code] != cls:
                states.append("INVALID"); rec["invalid"].append(f"taxonomy_code {code} invalid for {cls}")
            else:
                states.append("RESOLVED")
                if (m.get("mapping_status") or "").startswith("AMBIGUOUS"):
                    rec["review"].append(("taxonomy_code", f"{code}: workbook marks cross-link AMBIGUOUS", "Group 1 + industrial expert"))
                if sub is not None and code in code_row and code_row[code][1] != sub:
                    rec["review"].append(("taxonomy_code", f"{code} belongs to M06 subsystem {code_row[code][1]!r}, case subsystem is {sub!r}", "Group 1 (domain)"))
        rec["fields"]["taxonomy"] = "INVALID" if "INVALID" in states else ("UNRESOLVED" if "UNRESOLVED" in states else "RESOLVED")
        out.append(rec)
    return out


def summarise(recs):
    cnt = {f: collections.Counter(r["fields"][f] for r in recs) for f in ("subsystem", "component", "taxonomy")}
    return {"cases": len(recs),
            "by_field": {f: dict(v) for f, v in cnt.items()},
            "invalid_cases": [r["case_reference"] for r in recs if r["invalid"]],
            "requires_group1_review_cases": sorted({r["case_reference"] for r in recs if r["review"]}),
            "fully_resolved_cases": [r["case_reference"] for r in recs if all(v == "RESOLVED" for v in r["fields"].values()) and not r["review"]]}


def render_md(recs, summ):
    L_ = ["# Mapping validation report (generated by `python -m tools.validate_mappings`)", "",
          "Checks every case's subsystem, component and taxonomy against the project's own reference data "
          "(M06 component list, `failure_mode_taxonomy`, `failure_mode_vocabulary`). Nothing is guessed; "
          "unresolved fields stay NULL. This is a **structural** check, not expert review.", "",
          "## Summary", "| Field | RESOLVED | UNRESOLVED | INVALID |", "|---|---|---|---|"]
    for f, v in summ["by_field"].items():
        L_.append(f"| {f} | {v.get('RESOLVED', 0)} | {v.get('UNRESOLVED', 0)} | {v.get('INVALID', 0)} |")
    L_ += ["", f"- **INVALID cases:** {len(summ['invalid_cases'])} ({', '.join(summ['invalid_cases']) or 'none'})",
           f"- **Cases requiring Group 1 review:** {len(summ['requires_group1_review_cases'])} of {summ['cases']}",
           f"- **Fully resolved with no review item:** {len(summ['fully_resolved_cases'])}", "",
           "## Requires Group 1 review (case, field, reason, reviewer)", "| Case | Field | Reason | Reviewer |", "|---|---|---|---|"]
    for r in recs:
        for f, why, who in r["review"]:
            L_.append(f"| {r['case_reference']} | {f} | {why.replace('|', '/')} | {who} |")
    L_ += ["", "## Curated resolutions (documented evidence)"]
    for ref_id, r in sorted(curation.SUBSYSTEM_RESOLUTIONS.items()):
        L_.append(f"- **{ref_id}**: `{r['source_label']}` -> `{r['subsystem_name']}`. {r['evidence']} Reviewer: {r['confirm_with']}.")
    L_.append("")
    return "\n".join(L_)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0]); ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    cases = json.load(open(DATA, encoding="utf-8"))["cases"]
    recs = analyse(cases); summ = summarise(recs)
    payload = {"summary": summ, "cases": recs}
    jp = os.path.join(ROOT, "synthetic_dataset", "mapping_validation_report.json")
    mp = os.path.join(ROOT, "synthetic_dataset", "mapping_validation_report.md")
    if a.check:
        ok = json.load(open(jp, encoding="utf-8")) == json.loads(json.dumps(payload))
        print("mapping report up to date" if ok else "mapping report STALE"); return 0 if ok and not summ["invalid_cases"] else 1
    json.dump(payload, open(jp, "w", encoding="utf-8", newline="\n"), indent=2, ensure_ascii=False)
    open(mp, "w", encoding="utf-8", newline="\n").write(render_md(recs, summ))
    print(json.dumps(summ["by_field"]), "invalid:", summ["invalid_cases"], "review:", len(summ["requires_group1_review_cases"]))
    return 1 if summ["invalid_cases"] else 0


if __name__ == "__main__":
    sys.exit(main())
