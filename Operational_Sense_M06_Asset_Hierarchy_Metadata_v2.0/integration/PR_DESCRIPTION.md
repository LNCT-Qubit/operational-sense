# PR: M06 asset hierarchy and metadata candidate

## Summary

- Add a provisional PostgreSQL asset hierarchy candidate aligned to the M04 logical fields for `EQUIPMENT_CLASS` and `ASSET_NODE`.
- Preserve three source-backed equipment class IDs and 30 Group 1 equipment reference mappings with source row provenance.
- Add class/parent foreign keys, nonblank checks, source uniqueness constraints, a self-parent check and recursive cycle detection.
- Add an insert-only, rerunnable seed script, SQL validation queries, recursive hierarchy query and PostgreSQL integration test harness.
- Document source audit, decisions, M04/M05 integration boundary, tests and blockers.

## Scope and safeguards

- No synthetic troubleshooting cases are loaded as physical assets.
- No subsystem IDs are fabricated.
- Subsystem/component labels remain source reference metadata; they are not automatically approved taxonomy or physical hierarchy nodes.
- No pgvector extension or retrieval pipeline is changed.
- The migration fails closed if `public.equipment_class` or `public.asset_node` already exists.
- The identifier strategy and physical schema remain provisional pending M05/Common Data Model approval.

## Validation

- Static validation: run `python scripts/validate_package.py`.
- Static unit tests: run `python -m pytest -q`.
- PostgreSQL integration: `NOT RUN` in the authoring environment because `psql` and Docker were unavailable. Run `tests/postgres/run_clean_database_tests.sh` only against a disposable database whose name contains `test`.
- Repository CI: not run; direct Git remote access failed DNS.

## Review required before merge

- Confirm actual M05 schema and migration framework.
- Resolve repository README's Spring Boot backend vs task prompt's Node.js + Express.
- Approve Common Data Model and asset identifier strategy.
- Group 1 to approve hierarchy levels and subsystem-as-node vs metadata.
- Group 4 to review the cross-group schema contract.
- Confirm whether the namespaced component reference table is temporary staging or maps into an approved taxonomy entity.

## Merge recommendation

Treat this as a review candidate, not production-approved schema. Do not merge the migration into the application's migration directory until the M05 and architecture blockers are resolved and the database test suite has been executed.
