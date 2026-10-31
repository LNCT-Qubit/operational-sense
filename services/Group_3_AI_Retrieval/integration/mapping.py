"""Maps a canonical JSON case (schema 1.0.0) to the rows of the agreed database structure.

Column names are those of database/migrations/005_cases.sql. The mapper FAILS CLOSED:
 * a structurally invalid case is refused (it never reaches the database);
 * a value for which the database has no column (observed_outcome) is refused, not dropped;
 * identifiers (case_reference, equipment_class_id, status, eligibility) are copied, never rewritten.

Fields that are deliberately not stored are listed in UNSTORED_FIELDS with the reason, and a test
proves that every schema property is either mapped or listed there (nothing disappears silently).
"""
from __future__ import annotations

import uuid
from typing import Optional

from case_schema import case_validation as cv
from case_schema.reference_data import ReferenceData

# operational_case columns that take the JSON value unchanged
CASE_COLUMNS = (
    "case_reference", "equipment_class_id", "subsystem_source_label", "component_name", "plant_facility",
    "production_line", "symptom_category", "symptom_text", "symptom_structured", "operating_status",
    "symptom_frequency", "severity_proposed", "primary_suspected_cause", "alternative_causes", "confirmed_cause",
    "root_cause_confirmation", "failure_mechanism", "failure_effect", "differential_diagnosis",
    "corrective_action_text", "required_spares_text", "post_repair_verification", "acceptance_criteria",
    "recurrence_prevention", "early_warning", "case_origin", "evidence_type", "source_reliability",
    "is_synthetic", "model_is_illustrative", "needs_depth_expansion", "case_status", "retrieval_eligibility",
    "verification_duration_seconds", "created_at", "updated_at", "asset_id",
)
# JSON properties that are resolved to something else, or stored in a child table
RESOLVED_FIELDS = {
    "subsystem_name": "resolved to operational_case.subsystem_id (BIGINT identity) at load time by name",
    "model_designation": "resolved to operational_case.equipment_model_id (UUID) at load time by (class, designation)",
    "troubleshooting_steps": "troubleshooting_step rows",
    "failure_mappings": "case_failure_mapping rows",
    "sources": "case_source rows",
    "spare_parts": "case_spare_part rows (case-specific)",
    "verification": "case_verification row",
}
UNSTORED_FIELDS = {
    "schema_version": "JSON envelope version; the database schema version is the migration number",
    "provenance": "JSON-side provenance (export source, assumptions, unresolved item IDs); not an operational_case column",
    "observed_outcome": "NO database column exists; non-null values are REFUSED until Group 2 approves a column",
}
STEP_UNSTORED = {"source_reference": "troubleshooting_step has no such column; case-level sources are in case_source"}


class MappingError(ValueError):
    pass


def surrogate_case_id(organization_id: str, case_reference: str) -> str:
    """OFFLINE surrogate only. The real database assigns case_id with gen_random_uuid() on insert."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"opsense:{organization_id}:{case_reference}"))


def case_to_db_rows(case: dict, ref: ReferenceData, organization_id: str, *, case_id: Optional[str] = None) -> dict:
    issues = [i for i in cv.validate_case(case, ref) if i.severity == "ERROR"]
    if issues:
        raise MappingError(f"{case.get('case_reference')}: refused, {len(issues)} validation error(s): "
                           + "; ".join(f"{i.code} {i.path}" for i in issues[:5]))
    if case.get("observed_outcome") is not None:
        raise MappingError(f"{case['case_reference']}: observed_outcome has no database column; refused (not dropped)")
    cid = case_id or surrogate_case_id(organization_id, case["case_reference"])
    row = {k: case.get(k) for k in CASE_COLUMNS}
    row.update({"case_id": cid, "organization_id": organization_id,
                "subsystem_name": case.get("subsystem_name"),          # kept for the loader's name resolution
                "model_designation": case.get("model_designation"),
                "subsystem_id": None, "equipment_model_id": None})      # resolved by the database loader
    steps = [{"case_id": cid, "step_reference": s.get("step_reference"), "step_number": s["step_number"], "tier": s["tier"],
              "diagnostic_question": s.get("diagnostic_question"), "check_measurement": s["check_measurement"],
              "required_instrument": s.get("required_instrument"), "expected_observation": s.get("expected_observation"),
              "interpretation": s.get("interpretation"), "possible_failure_indication": s.get("possible_failure_indication"),
              "next_step": s.get("next_step"), "safety_warning": s.get("safety_warning"),
              "supervisor_approval_required": s["supervisor_approval_required"]} for s in case["troubleshooting_steps"]]
    v = case["verification"]
    return {
        "operational_case": row,
        "troubleshooting_step": steps,
        "case_failure_mapping": [dict(m, case_id=cid) for m in case.get("failure_mappings", [])],
        "case_source": [dict(s, case_id=cid) for s in case.get("sources", [])],
        "case_spare_part": [dict(p, case_id=cid) for p in case.get("spare_parts", [])],
        "case_verification": {"case_id": cid, **v},
    }


def schema_property_coverage(schema: dict) -> dict:
    """Which top-level schema properties are mapped / resolved / unstored / UNACCOUNTED (should be empty)."""
    props = set(schema["properties"])
    mapped = set(CASE_COLUMNS)
    accounted = mapped | set(RESOLVED_FIELDS) | set(UNSTORED_FIELDS)
    return {"mapped": sorted(props & mapped), "resolved": sorted(props & set(RESOLVED_FIELDS)),
            "unstored": sorted(props & set(UNSTORED_FIELDS)), "unaccounted": sorted(props - accounted),
            "columns_without_property": sorted(mapped - props)}
