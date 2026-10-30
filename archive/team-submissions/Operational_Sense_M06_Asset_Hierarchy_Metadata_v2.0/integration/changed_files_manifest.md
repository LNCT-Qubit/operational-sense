# Changed-file and repository integration manifest

## Files in this package

- `sql/migrations/0001_m06_asset_hierarchy.sql` — provisional PostgreSQL candidate migration; fails closed if `equipment_class` or `asset_node` already exists.
- `sql/seed_data/seed_m06_reference_data.sql` — idempotent reference seed; inserts three classes and 30 mapping rows without overwriting conflicts.
- `sql/seed_data/equipment_class_reference.csv` — class seed source mapping.
- `sql/seed_data/equipment_component_reference.csv` — exact component/subsystem reference mapping.
- `sql/validation/*.sql` and `sql/queries/*.sql` — database validation and retrieval templates.
- `tests/postgres/*` — guarded PostgreSQL integration test runner and rollback-based test SQL.
- `scripts/validate_package.py`, `tests/test_m06_package.py` — static validator and unit tests.
- `source_audit/*`, `documentation/*`, `diagrams/*`, `evidence/*` — audit, traceability, design, tests and review evidence.

## Proposed repository destination

The current public repository listing only shows `README.md`, so no established backend migration directory can be verified. Keep the package as a reviewable M06 folder until the project owner confirms the actual code layout. Do not merge the migration into a backend-specific directory until the Spring Boot vs Node.js + Express conflict and M05 schema are resolved.

If Spring Boot/Flyway is confirmed, likely destination is the existing Flyway migration directory (often `backend/src/main/resources/db/migration/`), but verify actual files first. If Node.js + Express is confirmed, use the existing migration framework and directory; do not invent a new runner when a project convention may exist.

No actual repository files were modified.
