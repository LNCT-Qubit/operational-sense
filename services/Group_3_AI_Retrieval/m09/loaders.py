"""Load the synthetic dataset out of the project's SQL files (no database needed)."""
import os
import re
from . import sqlvalues as sv

PROJECT_FILES = {
    "cases": "Operational_Sense_Step4_5_Import_Operational_Cases.sql",
    "steps": "Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql",
    "links": "Operational_Sense_Step4_Links_and_Verification_FIXED.sql",
    "taxonomy": "Operational_Sense_Step4_Taxonomy_Vocabulary_FIXED.sql",
    "sources": "step4_01_import_sources.sql",
    "safety_spares": "Operational_Sense_Step4_4_Safety_and_Spare_Parts_FIXED.sql",
    "seed_ref": os.path.join("seed_data", "010_seed_reference_from_m06.sql"),
    "seed_assets": os.path.join("seed_data", "020_seed_asset_hierarchy.sql"),
}
STEP_COLS = ["case_reference", "step_number", "tier", "check_measurement", "step_reference",
             "diagnostic_question", "required_instrument", "expected_observation", "interpretation",
             "possible_failure_indication", "next_step", "safety_warning",
             "supervisor_approval_required", "source_reference"]
TAX_COLS = ["taxonomy_code", "equipment_class_id", "subsystem_name", "component_name",
            "failure_mode_name", "description", "failure_effect", "failure_cause",
            "corrective_action", "review_status"]
M06_COLS = ["equipment_class_id", "equipment_class", "subsystem_assembly", "subsystem_id_source_value",
            "component_maintainable_item", "taxonomy_code", "source_sheet", "source_row_number",
            "model_information_note", "review_status"]


def _read(project, key):
    with open(os.path.join(project, PROJECT_FILES[key]), encoding="utf-8") as fh:
        return fh.read()


def _dicts(cols, rws):
    return [dict(zip(cols, r)) for r in rws]


def load_cases(project):
    sql = _read(project, "cases")
    blocks = sv.values_blocks(sql)
    cols = sv.alias_columns(sql, "v")
    models = [(r[0], r[1]) for r in sv.rows(blocks[0])]
    cases = _dicts(cols, sv.rows(blocks[1]))
    # hard-coded literals in the INSERT ... SELECT (not in the VALUES tuples)
    m = re.search(r"'(DRAFT|SUBMITTED|VERIFIED|REJECTED|REVOKED)',\s*'(demo_only_until_expert_review|eligible|excluded)'\s*\nFROM \(VALUES", sql)
    defaults = {"case_status": m.group(1), "retrieval_eligibility": m.group(2)} if m else {}
    sets_subsystem_id = bool(re.search(r"INSERT INTO public\.operational_case \([^)]*\bsubsystem_id\b", sql, re.S))
    return cases, models, defaults, sets_subsystem_id


def load_steps(project):
    return _dicts(STEP_COLS, sv.rows(sv.values_blocks(_read(project, "steps"))[0]))


def load_taxonomy(project):
    sql = _read(project, "taxonomy")
    b = sv.values_blocks(sql)
    tax = _dicts(TAX_COLS, sv.rows(b[0]))
    vocab = _dicts(["failure_mode_id", "preferred_label", "equipment_class_id", "note", "review_status"], sv.rows(b[1]))
    return tax, vocab


def load_m06(project):
    b = sv.values_blocks(_read(project, "seed_ref"))
    return _dicts(M06_COLS, sv.rows(b[1]))


def load_sources(project):
    sql = _read(project, "sources")
    b = [x for x in sv.values_blocks(sql) if x]
    return [r[0] for r in sv.rows(b[0])]


def load_links(project):
    sql = _read(project, "links")
    b = sv.values_blocks(sql)
    seed = _dicts(["case_reference", "taxonomy_code", "failure_mode_id", "source_mapping_note", "source_ref_ids"], sv.rows(b[0]))
    spare = _dicts(["case_reference", "part_name"], sv.rows(b[1]))
    return seed, spare


def load_spare_parts(project):
    sql = _read(project, "safety_spares")
    out = []
    for m in re.finditer(r"INSERT INTO public\.spare_part_reference[^;]*?SELECT\s+(.*?)\s+WHERE NOT EXISTS", sql, re.S):
        parts = sv.split_fields("(" + m.group(1) + ")")
        out.append({"part_name": sv.unquote(parts[0]), "function": sv.unquote(parts[1]),
                    "compatibility_note": sv.unquote(parts[2]), "source_id": sv.unquote(parts[3])})
    return out


def load_safety(project):
    sql = _read(project, "safety_spares")
    out = []
    for m in re.finditer(r"INSERT INTO public\.safety_procedure[^;]*?SELECT\s+(.*?)\s+WHERE NOT EXISTS", sql, re.S):
        p = sv.split_fields("(" + m.group(1) + ")")
        out.append({"equipment_class_id": sv.unquote(p[0]), "hazard": sv.unquote(p[1])})
    return out


def parse_source_ids(text):
    return [x for x in re.split(r"[;,|\s]+", text or "") if x]
