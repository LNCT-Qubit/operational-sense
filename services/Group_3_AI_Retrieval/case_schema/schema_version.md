# Schema version and change documentation

**Current: `1.0.0`** (`canonical_schema.json`, `$id .../troubleshooting_case/1.0.0`). Every case carries `schema_version: "1.0.0"`; any other value is rejected.

## Versioning rule
- PATCH: wording/description fixes, no behaviour change.
- MINOR: new optional field or new warning-level rule; old records stay valid.
- MAJOR: removed/renamed field, tightened enum, new required field. Needs a migration note below and Group 2 sign-off.

## 1.0.0 (first canonical version)
Origin: no machine-readable M07 schema was present in the three uploaded packages (see `documentation/AUDIT_REPORT.md`). The only approved structure was the database model (migrations 002-006). Version 1.0.0 therefore **derives** the JSON shape from it:
- Every `operational_case` column keeps its name; child tables become arrays (`troubleshooting_steps`, `failure_mappings`, `sources`, `spare_parts`, `verification`).
- Added JSON-side only: `schema_version`, `subsystem_name` (resolved name behind `subsystem_id`), `model_designation` (name behind `equipment_model_id`), `observed_outcome`, `provenance`.
- `observed_outcome` is a **proposal**: the brief requires an observed outcome, but the database has no column. The loader refuses non-null values until Group 2 approves one (no silent drop).
- Conflicts found and how they were resolved are in `documentation/COMMON_DATA_MODEL.md` section 4.

## Breaking changes
None relative to the database baseline. Relative to earlier ad-hoc exports (SQL `VALUES` lists) the JSON form is new; `tests/test_synthetic_dataset.py::test_dataset_roundtrip_no_information_loss` proves no field was lost.

## Backward compatibility
The SQL import scripts remain the source of truth for the loaded data and are unchanged except for the fixes listed in `CHANGELOG.md`.
