"""Build sample_cases/valid_samples.json and invalid_samples.json from real exported synthetic cases.

Valid samples are copied unchanged (plus one minimal record). Invalid samples are produced by
ONE deliberate mutation each, so every failure has a single known cause. Reproducible:
    python -m tools.build_samples
"""
from __future__ import annotations

import copy
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _load():
    with open(os.path.join(ROOT, "synthetic_dataset", "synthetic_cases.json"), encoding="utf-8") as fh:
        return {c["case_reference"]: c for c in json.load(fh)["cases"]}


def _mut(base, fn):
    c = copy.deepcopy(base)
    fn(c)
    return c


def build():
    cases = _load()
    pump, motor, comp = cases["CASE-PUMP-001"], cases["CASE-MOT-001"], cases["CASE-COMP-001"]
    unresolved = cases["CASE-PUMP-010"]          # real case with unresolved subsystem/component/taxonomy
    minimal = {
        "schema_version": "1.0.0", "case_reference": "CASE-PUMP-901", "equipment_class_id": "EQ-PUMP",
        "model_is_illustrative": True, "symptom_text": "Pump makes noise near the bearing (minimal format demonstration).",
        "is_synthetic": True, "case_status": "DRAFT", "retrieval_eligibility": "demo_only_until_expert_review",
        "troubleshooting_steps": [{"step_number": 1, "tier": 1, "check_measurement": "Listen for noise from a safe distance",
                                   "supervisor_approval_required": False}],
        "verification": {"overall_decision": "PENDING"},
        "provenance": {"assumptions": ["Minimal record demonstrating that all optional fields may be omitted. Not a real case."]}}
    valid = [
        {"id": "V1-pump", "description": "Full synthetic pump case (unchanged export of CASE-PUMP-001).", "case": pump},
        {"id": "V2-motor", "description": "Full synthetic motor case (unchanged export of CASE-MOT-001).", "case": motor},
        {"id": "V3-compressor", "description": "Full synthetic compressor case (unchanged export of CASE-COMP-001).", "case": comp},
        {"id": "V4-unresolved-values", "description": "Valid but with unresolved subsystem, component and taxonomy code kept as null (reported as warnings, never guessed).", "case": unresolved},
        {"id": "V5-minimal", "description": "Only required fields; unknown optional values omitted.", "case": minimal},
    ]

    def set_(k, v): return lambda c: c.__setitem__(k, v)
    def drop(k): return lambda c: c.pop(k)
    def step_(i, k, v): return lambda c: c["troubleshooting_steps"][i].__setitem__(k, v)
    def approve(c):
        c["case_status"] = "VERIFIED"
    inv = [
        ("I01-missing-required", "schema", "missing required property 'symptom_text'", drop("symptom_text"), "pump"),
        ("I02-blank-symptom", "schema", "does not match pattern", set_("symptom_text", "   "), "pump"),
        ("I03-invalid-class", "schema", "is not one of", set_("equipment_class_id", "EQ-TURBINE"), "pump"),
        ("I04-wrong-type", "schema", "expected type integer", step_(0, "tier", "2"), "pump"),
        ("I05-unknown-property", "schema", "unexpected property", set_("diagnosis_confirmed", True), "pump"),
        ("I06-tier3-no-approval", "schema", "must equal True", step_(6, "supervisor_approval_required", False), "pump"),
        ("I07-verified-without-review", "schema", "is not one of", approve, "pump"),
        ("I08-eligible-while-draft", "schema", "must equal 'VERIFIED'", set_("retrieval_eligibility", "eligible"), "pump"),
        ("I09-confirmed-without-evidence", "schema", "expected type string", set_("confirmed_cause", "Bearing spalling"), "pump"),
        ("I10-synthetic-with-asset", "schema", "expected type null", set_("asset_id", 17), "pump"),
        ("I11-subsystem-wrong-class", "semantic", "SUBSYS-INVALID", set_("subsystem_name", "Stator & Windings"), "pump"),
        ("I12-subsystem-guessed", "semantic", "SUBSYS-GUESSED", lambda c: c.__setitem__("subsystem_name", "Drive Train"), "unresolved"),
        ("I13-synthetic-confirmed-cause", "semantic", "SYNTH-CONFIRMED",
         lambda c: c.update({"confirmed_cause": "Contaminated grease", "root_cause_confirmation": "None - invented"}), "pump"),
        ("I14-step-order-gap", "semantic", "STEP-ORDER", step_(2, "step_number", 5), "pump"),
        ("I15-unknown-taxonomy", "semantic", "TAXONOMY-INVALID", lambda c: c["failure_mappings"][0].__setitem__("taxonomy_code", "PUMP.XXXX.NONE"), "pump"),
        ("I16-taxonomy-wrong-class", "semantic", "TAXONOMY-CLASS", lambda c: c["failure_mappings"][0].__setitem__("taxonomy_code", "ELEC.MOT.STAT"), "pump"),
        ("I17-unknown-source", "semantic", "SOURCE-INVALID", lambda c: c["sources"][0].__setitem__("source_id", "S99"), "pump"),
        ("I18-case-ref-wrong-class", "semantic", "REF-CLASS", set_("case_reference", "CASE-MOT-001"), "pump"),
        ("I19-wrong-schema-version", "schema", "must equal '1.0.0'", set_("schema_version", "0.9"), "pump"),
        ("I20-tier3-no-isolation", "semantic", "TIER3-ISOLATION",
         lambda c: c["troubleshooting_steps"][6].update({"check_measurement": "Replace the bearing", "required_instrument": "Spanner",
                                                         "next_step": "Run", "safety_warning": "Careful", "diagnostic_question": "Done?"}), "pump"),
    ]
    base = {"pump": pump, "unresolved": unresolved}
    invalid = [{"id": i, "layer": layer, "expect": expect, "case": _mut(base[b], fn),
                "description": f"One mutation of {base[b]['case_reference']}; must be rejected ({layer}: {expect})."}
               for i, layer, expect, fn, b in inv]
    # dataset-level
    dup = copy.deepcopy(pump)
    invalid.append({"id": "I21-duplicate-case-reference", "layer": "dataset", "expect": "DUP-ID",
                    "case": dup, "also_include": "V1-pump",
                    "description": "Same case_reference appears twice in one dataset."})
    return valid, invalid


def main():
    valid, invalid = build()
    out = os.path.join(ROOT, "sample_cases")
    os.makedirs(out, exist_ok=True)
    note = ("Derived from synthetic_dataset/synthetic_cases.json. All records are synthetic / demo-only; "
            "none is a real plant record or an expert-approved case.")
    for name, items in (("valid_samples.json", valid), ("invalid_samples.json", invalid)):
        with open(os.path.join(out, name), "w", encoding="utf-8", newline="\n") as fh:
            json.dump({"schema_version": "1.0.0", "note": note, "samples": items}, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    print(f"valid={len(valid)} invalid={len(invalid)}")


if __name__ == "__main__":
    main()
