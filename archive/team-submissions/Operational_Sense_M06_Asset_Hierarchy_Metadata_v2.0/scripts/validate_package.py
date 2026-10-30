#!/usr/bin/env python3
"""Static validation for the M06 package; never connects to a database."""
from pathlib import Path
import csv
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []
WARNINGS = []

def require(condition, message):
    if not condition:
        ERRORS.append(message)

def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))

fixture = json.loads((ROOT / "tests/fixtures/expected_source_inventory.json").read_text(encoding="utf-8"))
classes = read_csv(ROOT / "sql/seed_data/equipment_class_reference.csv")
components = read_csv(ROOT / "sql/seed_data/equipment_component_reference.csv")
snapshot = read_csv(ROOT / "source_audit/equipment_reference_source_snapshot.csv")

require(len(classes) == 3, f"Expected 3 class rows, found {len(classes)}")
require(len(components) == 30, f"Expected 30 mapping rows, found {len(components)}")
require(len(snapshot) == 30, f"Expected 30 source snapshot rows, found {len(snapshot)}")
require([r["equipment_class_id"] for r in classes] == ["EQ-PUMP", "EQ-MOTOR", "EQ-COMP"],
        "Equipment class IDs/order differ from expected source IDs")
require([r["class_name"] for r in classes] == [
    "Centrifugal Pump", "Three-Phase Induction Motor", "Rotary Screw Air Compressor"
], "Equipment class labels differ from expected source labels")
require([int(r["source_row_number"]) for r in components] == list(range(2, 32)),
        "Mapping source row numbers must preserve Excel rows 2–31")
require([int(r["source_row_number"]) for r in snapshot] == list(range(2, 32)),
        "Source snapshot row numbers must preserve Excel rows 2–31")

# Compare every normalized mapping field to the exact included source snapshot.
for idx, (src, seed) in enumerate(zip(snapshot, components), start=2):
    comparisons = {
        "Equipment Class ID": "equipment_class_id",
        "Equipment Class": "equipment_class",
        "Subsystem / Assembly": "subsystem_assembly",
        "Subsystem ID": "subsystem_id_source_value",
        "Component / Maintainable Item": "component_maintainable_item",
        "Taxonomy Code": "taxonomy_code",
        "Model Information": "model_information_note",
    }
    for source_field, seed_field in comparisons.items():
        require(src[source_field] == seed[seed_field],
                f"Source row {idx}: {source_field} differs from {seed_field}")
    require(seed["source_sheet"] == "Equipment_Reference", f"Mapping row {idx}: source_sheet mismatch")
    require(seed["review_status"] == "PENDING_REVIEW", f"Mapping row {idx}: review status must remain pending")
    require(seed["subsystem_id_source_value"] == "Not defined in taxonomy (no subsystem ID)",
            f"Mapping row {idx}: fabricated/changed subsystem ID note")

first_by_id = {}
for row in snapshot:
    first_by_id.setdefault(row["Equipment Class ID"], row)
require(len(first_by_id) == 3, "Expected three distinct source class IDs")
for row in classes:
    src = first_by_id.get(row["equipment_class_id"])
    require(src is not None, f"Class {row['equipment_class_id']} not present in source snapshot")
    if src:
        require(row["class_name"] == src["Equipment Class"], f"Class label mismatch for {row['equipment_class_id']}")
        require(row["description"] == src["Equipment Description"], f"Class description mismatch for {row['equipment_class_id']}")
        require(int(row["source_row_number"]) == int(src["source_row_number"]),
                f"Class source row mismatch for {row['equipment_class_id']}")
    require(row["review_status"] == "PENDING_REVIEW", "Class seed must remain pending review")

require(fixture["source_sheets"] == len(fixture["source_sheet_names"]) == 18,
        "Fixture sheet inventory mismatch")
require(fixture["equipment_reference_rows"] == 30, "Fixture Equipment_Reference count mismatch")
require(fixture["import_view_case_rows"] == 50, "Fixture Import_View count mismatch")
require(sum(fixture["case_class_counts"].values()) == 50, "Fixture case class counts do not sum to 50")
require(fixture["case_class_counts"] == {
    "Centrifugal Pump": 17,
    "Three-Phase Induction Motor": 17,
    "Rotary Screw Air Compressor": 16,
}, "Fixture class distribution mismatch")

migration_path = ROOT / "sql/migrations/0001_m06_asset_hierarchy.sql"
seed_sql_path = ROOT / "sql/seed_data/seed_m06_reference_data.sql"
migration = migration_path.read_text(encoding="utf-8")
seed_sql = seed_sql_path.read_text(encoding="utf-8")
migration_upper = migration.upper()
require("CREATE TABLE PUBLIC.EQUIPMENT_CLASS" in migration_upper, "Migration missing equipment_class")
require("CREATE TABLE PUBLIC.ASSET_NODE" in migration_upper, "Migration missing asset_node")
require("CREATE TABLE PUBLIC.M06_EQUIPMENT_COMPONENT_REFERENCE" in migration_upper,
        "Migration missing namespaced component reference table")
require("REFERENCES PUBLIC.ASSET_NODE (ASSET_ID)" in migration_upper, "Missing parent self-FK")
require("REFERENCES PUBLIC.EQUIPMENT_CLASS (EQUIPMENT_CLASS_ID)" in migration_upper, "Missing class FK")
require("PG_ADVISORY_XACT_LOCK" in migration_upper, "Missing transaction-scoped hierarchy edit lock")
require("WITH RECURSIVE ANCESTOR_CHAIN" in migration_upper, "Missing recursive cycle detection")
require("TRG_M06_PREVENT_ASSET_HIERARCHY_CYCLE" in migration_upper, "Missing cycle trigger")
require("ON DELETE RESTRICT" in migration_upper, "Expected conservative FK delete behavior")
require("TO_REGCLASS('PUBLIC.EQUIPMENT_CLASS')" in migration_upper, "Missing class-table preflight collision guard")
require("TO_REGCLASS('PUBLIC.ASSET_NODE')" in migration_upper, "Missing asset-node preflight collision guard")
require("DROP TABLE" not in migration_upper, "Migration must not drop tables")
require("TRUNCATE" not in migration_upper, "Migration must not truncate data")
require("CREATE EXTENSION" not in migration_upper, "M06 must not change extensions")
require("PGVECTOR" not in migration_upper, "M06 must not alter pgvector")
require("ON CONFLICT DO NOTHING" in seed_sql.upper(), "Seed SQL should be insert-only and safely rerunnable")
require("PUMP.BRNG.ROLL" in seed_sql and "COMP.COND.DRN" in seed_sql,
        "Seed SQL missing expected source mapping examples")
for row in classes:
    for field in ("equipment_class_id", "class_name", "description"):
        require(row[field].replace("'", "''") in seed_sql,
                f"Seed SQL missing class {field} value for {row['equipment_class_id']}")
for row in components:
    for field in ("equipment_class_id", "equipment_class", "subsystem_assembly",
                  "subsystem_id_source_value", "component_maintainable_item", "taxonomy_code",
                  "model_information_note"):
        require(row[field].replace("'", "''") in seed_sql,
                f"Seed SQL missing mapping {field} value from source row {row['source_row_number']}")
require(seed_sql.count("PENDING_REVIEW") >= 33, "Seed SQL must preserve pending review state")
require("BEGIN;" in (ROOT / "tests/postgres/verify_m06.sql").read_text(encoding="utf-8"),
        "PostgreSQL tests must run in a rollback transaction")
require("ROLLBACK;" in (ROOT / "tests/postgres/verify_m06.sql").read_text(encoding="utf-8"),
        "PostgreSQL tests must roll back test records")

required = [
    "README.md", "MANIFEST.md", "source_audit/source_inventory.md",
    "source_audit/compatibility_audit.md", "source_audit/requirements_traceability.csv",
    "source_audit/open_decisions.csv", "source_audit/equipment_reference_source_snapshot.csv",
    "documentation/source_audit.md", "documentation/data_dictionary.md",
    "documentation/hierarchy_and_relationships.md", "documentation/seed_data_mapping.md",
    "documentation/validation_report.md", "documentation/decisions_and_open_questions.md",
    "documentation/integration_with_m04_m05.md", "documentation/implementation_notes.md",
    "documentation/pr_review_checklist.md", "documentation/changes_from_v1.md", "sql/migrations/0001_m06_asset_hierarchy.sql",
    "sql/seed_data/seed_m06_reference_data.sql", "tests/postgres/verify_m06.sql",
    "tests/postgres/run_clean_database_tests.sh", "integration/PR_DESCRIPTION.md",
]
for rel in required:
    require((ROOT / rel).is_file(), f"Missing required package file: {rel}")

stale = []
for p in ROOT.rglob("*"):
    if p.is_file() and p.suffix.lower() in {".md", ".sql", ".csv", ".py", ".sh", ".json"}:
        try:
            content = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        rel = str(p.relative_to(ROOT))
        historical_files = {"CHANGELOG.md", "documentation/changes_from_v1.md"}
        if ("0001" + "_asset_node_proposal.sql") in content and rel not in historical_files:
            stale.append(rel)
require(not stale, f"Stale proposal migration references found: {stale}")

print("M06 v2.0 static validation")
print(f"Source snapshot rows: {len(snapshot)}")
print(f"Equipment classes: {len(classes)}")
print(f"Component/reference mappings: {len(components)}")
print(f"Source sheets: {fixture['source_sheets']}")
print(f"Synthetic Import_View rows audited, not seeded: {fixture['import_view_case_rows']}")
print(f"Required package files checked: {len(required)}")
print(f"Errors: {len(ERRORS)}")
for error in ERRORS:
    print("FAIL:", error)
for warning in WARNINGS:
    print("WARN:", warning)
if ERRORS:
    sys.exit(1)
print("PASS: source traceability and static package guardrails.")
print("NOTE: PostgreSQL migration/seed/rollback and repository integration are not proven by this validator.")
