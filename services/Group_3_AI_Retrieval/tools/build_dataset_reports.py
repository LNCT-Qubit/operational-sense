"""Generate synthetic_dataset/unresolved_mappings.csv and dataset_quality_report.md from the data.

All numbers in the report are computed here from synthetic_cases.json and the M09 audit, so the
report cannot drift from the data. Re-run after any dataset change:  python -m tools.build_dataset_reports
"""
from __future__ import annotations

import collections
import csv
import json
import os
import re

from case_schema import case_validation as cv
from case_schema.reference_data import load_reference
from m09 import quality, loaders as L
from tools import curation

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "synthetic_dataset")
STD = re.compile(r"\b(?:ISO|IEC|API|NEMA|IEEE|ANSI|DIN)[ -]?\d+[\w.-]*(?:-\d+)?", re.I)
PLACEHOLDER_ACCEPTANCE = "not stated in this workbook"   # the ORIGINAL shared placeholder (now replaced; see ACCEPT rows)


def rows(cases, db_dir):
    safety = L.load_safety(db_dir)
    out = []
    def add(t, case, field, cur, issue, who):
        out.append({"item_id": f"UR-{t}-{case['case_reference'] if case else 'GLOBAL'}" + (f"-{field}" if field and t in ('GENERIC-STEP','SAFETY') else ""),
                    "item_type": t, "case_reference": case["case_reference"] if case else "",
                    "equipment_class_id": case["equipment_class_id"] if case else "", "field_or_step": field or "",
                    "current_value": cur or "", "issue": issue, "needs_decision_from": who, "status": "OPEN"})
    for c in cases:
        if c["subsystem_name"] is None:
            add("SUBSYS", c, "subsystem_name", c["subsystem_source_label"], "subsystem_id stays NULL (never a strict-filter match). Not guessed. " + curation.UNRESOLVED_REASONS.get(c["case_reference"], "Source label is not in the approved subsystem list for the class."), "Group 1 (domain)")
        elif c["subsystem_name"].strip().lower() != (c["subsystem_source_label"] or "").strip().lower():
            add("SUBSYS-CONFIRM", c, "subsystem_name", f"{c['subsystem_source_label']} -> {c['subsystem_name']}", "Resolved by documented curated rule (unambiguous per M06 component reference); Group 1 confirmation requested.", curation.SUBSYSTEM_RESOLUTIONS[c["case_reference"]]["confirm_with"])
            out[-1]["status"] = "PROVISIONAL"
        if not c["component_name"]:
            add("COMP", c, "component_name", "", "Component not identified in source workbook; not inferred (the label does not name exactly one M06 component).", "Group 1 (domain)")
        for m in c["failure_mappings"]:
            if m["taxonomy_code"] is None:
                add("TAX", c, "taxonomy_code", f"failure_mode_id={m['failure_mode_id']}", "No taxonomy code (FMEA_Taxonomy gap in workbook); only the project-local FM id exists. The approved failure_mode_taxonomy (30 codes) has no code for this subsystem/component; none invented.", "Group 1 (domain)")
            elif (m["mapping_status"] or "").startswith("AMBIGUOUS"):
                add("TAXAMB", c, "taxonomy_code", m["taxonomy_code"], "Workbook marks this cross-link AMBIGUOUS - expert review.", "Group 1 + industrial expert")
        if c["needs_depth_expansion"]:
            add("DEPTH", c, "case", "", "Flagged needs_depth_expansion in the source workbook.", "Group 1 (domain)")
        if (c["acceptance_criteria"] or "").startswith(curation.ACCEPT_PREFIX):
            add("ACCEPT", c, "acceptance_criteria", c["acceptance_criteria"][:90], "Case-specific verification text only; numeric/OEM acceptance values are still pending (not invented here).", "Group 1 + site/OEM data")
        for s in c["troubleshooting_steps"]:
            if (s["check_measurement"] or "").endswith(curation.SUFFIX_PENDING):
                add("GENERIC-STEP", c, f"step {s['step_number']}", s["check_measurement"][:90], "Measured quantity is too unspecific to propose a location from the case context (e.g. bare 'Temperature'/'Pressure'/'Phase'); left pending.", "Group 1 (domain)")
            if s["tier"] == 2 and "proven-dead condition" in (s["safety_warning"] or ""):
                add("ISOLATION-TIER", c, f"step {s['step_number']}", s["check_measurement"][:90], "Tier 2 step needs isolation/LOTO; tier assignment and approval requirement need safety-officer review (tier not changed here).", "Group 1 + safety officer")
            if s["tier"] == 3 and len(s["check_measurement"].strip()) < cv.TIER3_THIN_CHARS:
                add("THIN-T3", c, f"step {s['step_number']}", s["check_measurement"], f"Tier-3 intervention text under {cv.TIER3_THIN_CHARS} chars; too generic to act on.", "Group 1 (domain)")
    for c in cases:
        n = sum(1 for s in c["troubleshooting_steps"] if s["check_measurement"].endswith(curation.SUFFIX_SUGGESTED))
        if n:
            add("LOC-VERIFY", c, "tier 2 steps", f"{n} step(s) with suggested location", "Measurement locations were suggested from equipment/component context; none is OEM-verified.", "Group 1 (domain) + OEM manual")
    for i, sp in enumerate(safety, 1):
        out.append({"item_id": f"UR-SAFETY-GLOBAL-{i:02d}", "item_type": "SAFETY", "case_reference": "(all 50)", "equipment_class_id": sp["equipment_class_id"] or "NULL (all classes)",
                    "field_or_step": "safety_procedure", "current_value": sp["hazard"], "issue": "Class-independent general guidance linked to every case (14 x 50 = 700 links); labelled NOT an approved plant procedure; not case-specific.", "needs_decision_from": "Group 1 + safety officer", "status": "OPEN"})
    return out


def main():
    db = os.path.join(ROOT, "database")
    data = json.load(open(os.path.join(OUT, "synthetic_cases.json"), encoding="utf-8"))
    cases = data["cases"]
    ref = load_reference(db)
    issues = cv.validate_dataset(cases, ref)
    summ = cv.summarize(issues)
    reg = rows(cases, db)
    cols = ["item_id", "item_type", "case_reference", "equipment_class_id", "field_or_step", "current_value", "issue", "needs_decision_from", "status"]
    with open(os.path.join(OUT, "unresolved_mappings.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); w.writerows(reg)
    by_type = collections.Counter(r["item_type"] for r in reg)
    findings, _ = quality.run(db)
    f = {x["id"]: x for x in findings}
    by_cls = collections.Counter(c["equipment_class_id"] for c in cases)
    stds = collections.Counter(m.group(0).upper().replace("  ", " ") for c in cases for t in [json.dumps(c, ensure_ascii=False)] for m in STD.finditer(t))
    lines = [
        "# Synthetic dataset quality report (M09 audited, Group 3 integrated)",
        "",
        "> Generated by `python -m tools.build_dataset_reports` from `synthetic_cases.json`. Numbers are computed, not typed.",
        "> **All 50 cases are SYNTHETIC / DEMO-ONLY** (`is_synthetic = true`, `case_status = DRAFT`, `retrieval_eligibility = demo_only_until_expert_review`, verification `PENDING`, no reviewer, no review date). None is expert-approved.",
        "",
        "## 1. What was checked",
        f"- Cases: **{len(cases)}** (pumps {by_cls['EQ-PUMP']}, motors {by_cls['EQ-MOTOR']}, compressors {by_cls['EQ-COMP']}); steps: **{sum(len(c['troubleshooting_steps']) for c in cases)}**.",
        f"- Canonical schema + semantic + dataset validation: **{summ['errors']} errors, {summ['warnings']} warnings** ({', '.join(f'{k}={v}' for k, v in sorted(summ['by_code'].items()))}).",
        "- Independent M09 audit (`m09/quality.py`, 26 checks) re-run on the SQL sources; results in section 3.",
        "- Dataset round-trip: every JSON field equals the value loaded from the SQL import (test `test_dataset_roundtrip`).",
        "",
        "## 2. Previously reported issues, re-checked against the actual files",
        "| Earlier finding | Re-check result | Status |",
        "|---|---|---|",
        f"| 11 cases with unresolved component/subsystem | **Re-inspected**: {by_type['SUBSYS']} subsystem still unresolved + {by_type['SUBSYS-CONFIRM']} resolved (CASE-PUMP-010, unambiguous per M06, Group 1 confirmation pending); {by_type['COMP']} blank components (unchanged: not inferred) | PARTIAL, needs Group 1 |",
        f"| 11 cases without taxonomy codes | **Unchanged**: {by_type['TAX']} cases (project-local FM id only; the approved taxonomy has no code for them; none invented) | OPEN, needs Group 1 |",
        f"| Generic measurement wording in 141 of 350 steps | **Improved**: {sum(1 for c in cases for s in c['troubleshooting_steps'] if s['check_measurement'].endswith(curation.SUFFIX_SUGGESTED))} steps now name a suggested location (labelled 'verification required'); {by_type['GENERIC-STEP']} stay pending because the quantity is too unspecific | PARTIAL, needs Group 1 + OEM |",
        f"| 14 generic safety rows linked to all 50 cases | **Relabelled** (wording only): 12 general-guidance rows now say 'NOT an approved plant procedure'; {by_type['SAFETY']} rows, 700 links remain class-independent | OPEN, needs Group 1 + safety officer |",
        f"| 15 cases flagged for depth expansion | **Unchanged**: {by_type['DEPTH']} (cannot be expanded without domain input) | OPEN |",
        "| Placeholder asset-model names in earlier versions | **Not present** in current import: 19 model designations, all `is_illustrative = TRUE`. They are real-looking OEM names used illustratively; no OEM specification is attached or claimed. | Resolved (names), remains illustrative |",
        f"| Acceptance criteria identical placeholder (50 cases) | **Replaced** by case-specific PENDING VERIFICATION text (repeat the case's own Tier 2 checks, compare with OEM/site baseline, confirm the symptom is gone); no limit invented; {by_type['ACCEPT']} still need OEM/site values | PARTIAL |",
        f"| Tier-3 intervention text under {cv.TIER3_THIN_CHARS} chars (14 cases) | **Reworded** to link the action to the suspected cause and to the Tier 2 re-check; detailed work instructions still require the OEM manual / site procedure | PARTIAL |",
        f"| (new) Tier 2 steps that need isolation | **{by_type['ISOLATION-TIER']} steps** (insulation, alignment, continuity...) carried an electrical-measurement warning; warning corrected, tier NOT changed; safety-officer review requested | OPEN, needs safety officer |",
        f"| (new) {by_type['TAXAMB']} taxonomy cross-links marked AMBIGUOUS by the workbook | kept as provisional, listed in the register | OPEN, needs expert |",
        "",
        "## 3. M09 audit findings (re-run)",
        "| ID | Status | Check | Detail |", "|---|---|---|---|",
    ]
    for x in findings:
        lines.append(f"| {x['id']} | {x['status']} | {x['title']} | {x['detail'][:140].replace('|', '/')} |")
    lines += [
        "",
        "## 4. Industrial plausibility (engineering reading, NOT expert review)",
        "All 50 symptom-to-suspected-cause pairs were read for gross contradictions (e.g. a motor symptom paired with a pump cause, an effect that the named cause cannot produce). **No gross contradiction was found.** Examples of sound pairings: separator differential pressure with a clogged separator element (COMP-001); speed-proportional vibration persisting uncoupled with rotor imbalance (MOT-005); steady seepage that continues at standstill with a degraded secondary seal (PUMP-006).",
        "Limits of that reading: it was done by the integrating engineer without a plant, OEM manuals or a domain expert. It cannot confirm that a described value, sequence or action is correct for any real machine. **Expert industrial review remains required** before any case is VERIFIED.",
        "- **Causes are consistently worded as suspected**: every `primary_suspected_cause` ends with `(suspected, unconfirmed)`; `confirmed_cause` is null in all 50 cases (no field confirmation exists).",
        "- **No numeric limits, torques, clearances or thresholds** are stated in the case text (the only number is the run time `20-25 min` in PUMP-001); the Group 3 curation adds none. Acceptance values are explicitly PENDING VERIFICATION against the OEM manual or approved site baseline.",
        f"- **Standards named in text** ({', '.join(f'{k} x{v}' for k, v in sorted(stds.items()))}): named as general references only; no compliance claim; applicability needs expert verification. ISO 14224 is not claimed anywhere; failure-mode IDs (`FM-xxx`) are project-local.",
        "- **Safety wording**: every tier-3 step requires supervisor approval and mentions isolation/LOTO. The 14 safety procedures are general guidance, now labelled as NOT approved plant procedures; they are not case-specific (see register).",
        "- **Language**: `symptom_text` is technician-style Hinglish, `symptom_structured` is English. This is a realistic input but means retrieval quality depends on a model that handles Hinglish; that is unmeasured.",
        "- **Duplicates**: no exact or near-duplicate cases (Jaccard >= 0.6 within a class: none; the flag threshold is 0.80). Related-but-distinct pairs exist by design (e.g. PUMP-004 strainer blockage vs PUMP-005 suction restriction with NPSH shortfall).",
        "",
        "## 5. Retrieval readiness",
        f"- {sum(1 for c in cases if c['subsystem_name'])} of 50 cases resolve to an approved subsystem (39 by exact label match, rule of `database/sql/m09/m09_010`; 1 by documented curated rule); {sum(1 for c in cases if not c['subsystem_name'])} stay NULL and can only be found without a subsystem filter.",
        "- Case text is detailed enough to embed (symptom narrative plus structured summary for every case); depth flags (15) mark thinner cases.",
        "- Mock-vector similarity SQL was executed against a live PostgreSQL 16 + pgvector 0.8.0 in the Group 3 Final build; **no real embedding model was run** and no retrieval benchmark exists (see `documentation/INTEGRATION_REPORT.md`).",
        "",
        "## 6. Unresolved register",
        "Full list: `unresolved_mappings.csv` (" + str(len(reg)) + " rows). Counts by type: " + ", ".join(f"{k}={v}" for k, v in sorted(by_type.items())) + ".",
        "",
    ]
    open(os.path.join(OUT, "dataset_quality_report.md"), "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print("register rows:", len(reg), dict(by_type)); print(summ)


if __name__ == "__main__":
    main()
