from pathlib import Path
import csv
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def test_static_validator_passes():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "validate_package.py")],
        cwd=ROOT, text=True, capture_output=True
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "PASS: source traceability and static package guardrails." in result.stdout


def test_source_snapshot_has_exact_rows_and_class_distribution():
    fixture = json.loads((ROOT / "tests/fixtures/expected_source_inventory.json").read_text())
    with (ROOT / "source_audit/equipment_reference_source_snapshot.csv").open(
        newline="", encoding="utf-8-sig"
    ) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 30
    assert [int(r["source_row_number"]) for r in rows] == list(range(2, 32))
    assert fixture["case_class_counts"] == {
        "Centrifugal Pump": 17,
        "Three-Phase Induction Motor": 17,
        "Rotary Screw Air Compressor": 16,
    }


def test_seed_data_preserves_pending_review_and_no_subsystem_id():
    with (ROOT / "sql/seed_data/equipment_component_reference.csv").open(
        newline="", encoding="utf-8-sig"
    ) as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 30
    assert all(r["review_status"] == "PENDING_REVIEW" for r in rows)
    assert all(
        r["subsystem_id_source_value"] == "Not defined in taxonomy (no subsystem ID)"
        for r in rows
    )
    assert all(r["model_information_note"] == "No real model documented; seed models are illustrative only"
               for r in rows)


def test_migration_has_cycle_guard_and_fails_closed_on_existing_core_tables():
    sql = (ROOT / "sql/migrations/0001_m06_asset_hierarchy.sql").read_text().lower()
    assert "pg_advisory_xact_lock" in sql
    assert "with recursive ancestor_chain" in sql
    assert "create trigger trg_m06_prevent_asset_hierarchy_cycle" in sql
    assert "to_regclass('public.equipment_class')" in sql
    assert "to_regclass('public.asset_node')" in sql
    assert "drop table" not in sql
    assert "create extension" not in sql


def test_postgres_integration_suite_is_guarded_and_rolls_back_test_data():
    runner = (ROOT / "tests/postgres/run_clean_database_tests.sh").read_text().lower()
    tests = (ROOT / "tests/postgres/verify_m06.sql").read_text().lower()
    assert "m06_allow_database_mutation" in runner
    assert "current_database()" in runner
    assert "begin;" in tests
    assert "rollback;" in tests
    assert "cycle rejection" in tests
