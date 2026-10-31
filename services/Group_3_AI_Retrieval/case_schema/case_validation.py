"""Validation of troubleshooting cases: JSON Schema + semantic rules + dataset-level checks.

Layer 1  JSON Schema      (canonical_schema.json)   structure, types, enums, conditional rules
Layer 2  Semantic rules   (this file)               cross-field / reference-data rules
Layer 3  Dataset checks   (this file)               duplicate IDs, near-duplicates, coverage

Severity:  ERROR   = record must be rejected / not loaded
           WARNING = record is loadable but carries a known gap that is reported, never hidden
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, asdict
from itertools import combinations
from typing import Iterable, Optional

from . import validator
from .reference_data import ReferenceData

SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "canonical_schema.json")
CLASS_PREFIX = {"EQ-PUMP": "PUMP", "EQ-MOTOR": "MOT", "EQ-COMP": "COMP"}
REQUIRED_CLASSES = ("EQ-PUMP", "EQ-MOTOR", "EQ-COMP")
TIER3_THIN_CHARS = 60            # flag threshold for a one-line intervention; a review aid, not a standard
NEAR_DUPLICATE_THRESHOLD = 0.80   # Jaccard on word sets; a flag threshold, not a statistical claim


@dataclass(frozen=True)
class Issue:
    severity: str      # ERROR | WARNING
    code: str
    case_reference: Optional[str]
    path: str
    message: str

    def as_dict(self) -> dict:
        return asdict(self)


def load_schema(path: str = SCHEMA_PATH) -> dict:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _norm(s: object) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def validate_case(case: object, ref: Optional[ReferenceData] = None, schema: Optional[dict] = None) -> list[Issue]:
    """Layer 1 + 2 for one case. Never raises on bad data; returns issues."""
    schema = schema or load_schema()
    if not isinstance(case, dict):
        return [Issue("ERROR", "SCHEMA", None, "$", "case must be a JSON object")]
    cref = case.get("case_reference") if isinstance(case.get("case_reference"), str) else None
    issues = [Issue("ERROR", "SCHEMA", cref, p, m) for p, m in validator.validate(case, schema)]
    if issues or ref is None:
        # Semantic rules assume a structurally valid record; report structure first.
        return issues
    return issues + _semantic(case, ref)


def _semantic(c: dict, ref: ReferenceData) -> list[Issue]:
    out: list[Issue] = []
    cref = c["case_reference"]

    def err(code, path, msg): out.append(Issue("ERROR", code, cref, path, msg))
    def warn(code, path, msg): out.append(Issue("WARNING", code, cref, path, msg))

    cls = c["equipment_class_id"]
    if cls not in ref.class_names:
        err("CLASS", "$.equipment_class_id", f"{cls} is not in the equipment_class seed")
        return out
    if f"-{CLASS_PREFIX.get(cls, '?')}-" not in cref:
        err("REF-CLASS", "$.case_reference", f"{cref} does not match class {cls}")

    # --- equipment / subsystem / model ------------------------------------------------------
    sub, label = c.get("subsystem_name"), c.get("subsystem_source_label")
    if sub is None:
        warn("SUBSYS-UNRESOLVED", "$.subsystem_name", f"no approved subsystem for label {label!r}; never a strict-filter match")
    else:
        if sub not in ref.class_subsystems.get(cls, frozenset()):
            err("SUBSYS-INVALID", "$.subsystem_name", f"{sub!r} is not a subsystem of {cls}")
        if _norm(sub) != _norm(label):
            curated = [a for a in c.get("provenance", {}).get("assumptions", [])
                       if a.startswith("SUBSYSTEM-RESOLUTION:") and sub in a and "M06" in a]
            if curated:
                warn("SUBSYS-CURATED", "$.subsystem_name",
                     f"{sub!r} was set by a documented curated resolution (not an exact label match); Group 1 confirmation pending")
            else:
                err("SUBSYS-GUESSED", "$.subsystem_name",
                    "subsystem_name may only be set by exact (case-insensitive) match of subsystem_source_label, "
                    "or by a documented SUBSYSTEM-RESOLUTION entry in provenance.assumptions; no guessed mapping")
    if not c.get("component_name"):
        warn("COMPONENT-MISSING", "$.component_name", "component not identified")
    mdl = c.get("model_designation")
    if mdl is not None:
        if mdl not in ref.models.get(cls, frozenset()):
            other = [k for k, v in ref.models.items() if mdl in v]
            (err if other else warn)("MODEL-UNKNOWN", "$.model_designation",
                                     f"{mdl!r} is not a known {cls} model" + (f" (belongs to {other})" if other else ""))
    if c["is_synthetic"]:
        if not c["model_is_illustrative"]:
            err("SYNTH-MODEL", "$.model_is_illustrative", "synthetic case must keep model_is_illustrative = true")

    # --- cause separation ------------------------------------------------------------------
    if c["is_synthetic"] and c.get("confirmed_cause") is not None:
        err("SYNTH-CONFIRMED", "$.confirmed_cause", "synthetic cases have no field confirmation; confirmed_cause must be null")
    if c.get("confirmed_cause") and _norm(c["confirmed_cause"]) == _norm(c.get("primary_suspected_cause")) \
            and not c.get("root_cause_confirmation"):
        err("CAUSE-CONFUSED", "$.confirmed_cause", "confirmed_cause duplicates the suspected cause without confirming evidence")
    if c.get("observed_outcome") is not None:
        warn("OUTCOME-UNMAPPED", "$.observed_outcome", "operational_case has no outcome column; the DB mapper will reject this value")

    # --- lifecycle -------------------------------------------------------------------------
    if c["is_synthetic"] and c["case_status"] in ("DRAFT", "SUBMITTED") and c["retrieval_eligibility"] == "eligible":
        err("SYNTH-LIFECYCLE", "$.retrieval_eligibility", "unreviewed synthetic case cannot be retrieval-eligible")

    # --- steps -----------------------------------------------------------------------------
    steps = c["troubleshooting_steps"]
    nums = [s["step_number"] for s in steps]
    if nums != list(range(1, len(steps) + 1)):
        err("STEP-ORDER", "$.troubleshooting_steps", f"step_number must be 1..n in order, got {nums}")
    tiers = [s["tier"] for s in steps]
    if tiers != sorted(tiers):
        warn("STEP-TIER-ORDER", "$.troubleshooting_steps", f"tiers should not go back down (observe -> measure -> intervene), got {tiers}")
    suffix = cref.replace("CASE-", "")
    for s in steps:
        r = s.get("step_reference")
        if r and r != f"DS-{suffix}-{s['step_number']:02d}":
            err("STEP-REF", f"$.troubleshooting_steps[{s['step_number']-1}].step_reference", f"{r} does not match {cref} step {s['step_number']}")
        if s["tier"] == 3:
            where = f"$.troubleshooting_steps[{s['step_number']-1}]"
            whole = " ".join(str(s.get(k) or "") for k in
                             ("check_measurement", "required_instrument", "next_step", "safety_warning", "diagnostic_question"))
            if not re.search(r"\b(LOTO|lock[- ]?out|isolat)", whole, re.I):
                err("TIER3-ISOLATION", where, "tier 3 (intervention) step must state isolation / LOTO somewhere in the step")
            if len(s["check_measurement"].strip()) < TIER3_THIN_CHARS:
                warn("TIER3-THIN", where + ".check_measurement",
                     f"intervention text is under {TIER3_THIN_CHARS} characters ({s['check_measurement']!r}); too generic to act on")

    # --- references ------------------------------------------------------------------------
    for i, m in enumerate(c.get("failure_mappings", [])):
        code, fm = m["taxonomy_code"], m["failure_mode_id"]
        if code is None:
            warn("TAXONOMY-MISSING", f"$.failure_mappings[{i}].taxonomy_code", "no taxonomy code (kept NULL, not guessed)")
        elif code not in ref.taxonomy:
            err("TAXONOMY-INVALID", f"$.failure_mappings[{i}].taxonomy_code", f"{code} is not in failure_mode_taxonomy")
        elif ref.taxonomy[code] != cls:
            err("TAXONOMY-CLASS", f"$.failure_mappings[{i}].taxonomy_code", f"{code} belongs to {ref.taxonomy[code]}, not {cls}")
        if fm is not None:
            if fm not in ref.failure_modes:
                err("FM-INVALID", f"$.failure_mappings[{i}].failure_mode_id", f"{fm} is not in failure_mode_vocabulary")
            elif ref.failure_modes[fm] not in (None, cls):
                err("FM-CLASS", f"$.failure_mappings[{i}].failure_mode_id", f"{fm} belongs to {ref.failure_modes[fm]}, not {cls}")
    for i, s in enumerate(c.get("sources", [])):
        if s["source_id"] not in ref.source_ids:
            err("SOURCE-INVALID", f"$.sources[{i}].source_id", f"{s['source_id']} is not in source_reference")
    return out


# --------------------------------------------------------------------------------------------
def _tokens(c: dict) -> set:
    return set(re.findall(r"[a-z0-9]+", _norm(c.get("symptom_structured") or c.get("symptom_text"))))


def near_duplicates(cases: Iterable[dict], threshold: float = NEAR_DUPLICATE_THRESHOLD) -> list[tuple[str, str, float]]:
    """Pairs of cases of the same class whose symptom word sets overlap >= threshold (Jaccard)."""
    cs = list(cases)
    toks = [_tokens(c) for c in cs]
    pairs = []
    for i, j in combinations(range(len(cs)), 2):
        if cs[i].get("equipment_class_id") != cs[j].get("equipment_class_id"):
            continue
        a, b = toks[i], toks[j]
        if a and b:
            sim = len(a & b) / len(a | b)
            if sim >= threshold:
                pairs.append((cs[i]["case_reference"], cs[j]["case_reference"], round(sim, 3)))
    return pairs


def validate_dataset(cases: list, ref: Optional[ReferenceData] = None, schema: Optional[dict] = None) -> list[Issue]:
    """Layer 3 on top of per-case validation."""
    schema = schema or load_schema()
    issues: list[Issue] = []
    seen: dict = {}
    for c in cases:
        issues += validate_case(c, ref, schema)
        r = c.get("case_reference") if isinstance(c, dict) else None
        if r in seen:
            issues.append(Issue("ERROR", "DUP-ID", r, "$.case_reference", "duplicate case_reference"))
        seen[r] = True
    good = [c for c in cases if isinstance(c, dict) and isinstance(c.get("troubleshooting_steps"), list)]
    refs = [s.get("step_reference") for c in good for s in c["troubleshooting_steps"] if isinstance(s, dict) and s.get("step_reference")]
    for dup in sorted({x for x in refs if refs.count(x) > 1}):
        issues.append(Issue("ERROR", "DUP-STEP-REF", None, "$.troubleshooting_steps", f"duplicate step_reference {dup}"))
    for a, b, sim in near_duplicates([c for c in cases if isinstance(c, dict) and "case_reference" in c]):
        issues.append(Issue("WARNING", "NEAR-DUPLICATE", a, "$.symptom_structured", f"{a} ~ {b} (Jaccard {sim})"))
    present = {c.get("equipment_class_id") for c in cases if isinstance(c, dict)}
    for cls in REQUIRED_CLASSES:
        if cls not in present:
            issues.append(Issue("ERROR", "COVERAGE", None, "$", f"no case for required class {cls}"))
    return issues


def summarize(issues: list[Issue]) -> dict:
    out: dict = {"errors": 0, "warnings": 0, "by_code": {}}
    for i in issues:
        out["errors" if i.severity == "ERROR" else "warnings"] += 1
        out["by_code"][i.code] = out["by_code"].get(i.code, 0) + 1
    return out
