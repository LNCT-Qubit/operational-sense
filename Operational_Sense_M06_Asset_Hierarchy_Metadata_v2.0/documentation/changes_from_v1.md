# Changes from v1.0 to v2.0

## Replaced implementation files

- Removed `sql/migrations/0001_asset_node_proposal.sql`, which created a proposal-only table named `asset_node_proposal`.
- Added `sql/migrations/0001_m06_asset_hierarchy.sql`, a candidate migration for M04's `equipment_class` and `asset_node` logical entities plus the namespaced M06 source-reference table. It fails closed if the two core tables already exist.
- Replaced the generic/proposal SQL validation templates with checks targeting the candidate table names and source mappings.
- Updated both seed CSVs with original worksheet row numbers, exact source labels and explicit `PENDING_REVIEW` state.
- Added `sql/seed_data/seed_m06_reference_data.sql` with safe insert-only conflict handling.

## Added executable validation

- Added `source_audit/equipment_reference_source_snapshot.csv`.
- Added `tests/test_m06_package.py`.
- Reworked `scripts/validate_package.py` to compare all 30 mappings to the included source snapshot and verify the SQL guardrails.
- Added `sql/validation/03_seed_data_integrity.sql` and `04_asset_class_assignment_review.sql`.
- Added `tests/postgres/verify_m06.sql` and a guarded `tests/postgres/run_clean_database_tests.sh`.
- Added actual static test outputs under `evidence/`.

## Documentation and diagrams updated

- Replaced the old uppercase documentation files with canonical lowercase files under `documentation/`.
- Updated `README.md`, `MANIFEST.md`, `CHANGELOG.md`, source audit, compatibility audit, open decisions, requirement traceability, integration notes and PR description.
- Updated Mermaid and Graphviz diagram sources and regenerated SVG/PNG outputs.

## Retained from v1.0 where still useful

- Existing source audit and traceability concepts.
- Reference data, hierarchy design intent and relationship diagrams.
- Rollback/safety guidance, review checklist intent and PR handoff materials.

## Important status distinction

The v2.0 candidate is statically validated, but PostgreSQL execution, actual M05 compatibility, repository CI and formal approvals remain unverified or blocked. These changes do not constitute a successful production deployment.
