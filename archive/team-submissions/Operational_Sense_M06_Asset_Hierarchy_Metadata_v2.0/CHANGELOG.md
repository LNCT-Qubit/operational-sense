# Changelog

## v2.0 — M06 implementation candidate

- Replaced proposal-only `asset_node_proposal` SQL with a fail-closed candidate migration for `equipment_class`, `asset_node`, and a namespaced M06 component-reference table.
- Added parent FK, class FK, nonblank checks, source uniqueness constraints, self-parent rejection, recursive cycle detection and transaction-scoped advisory locking.
- Regenerated source seed CSVs directly from the inspected Group 1 `Equipment_Reference` sheet with original row numbers.
- Added insert-only seed SQL, source integrity SQL, recursive hierarchy query and guarded PostgreSQL integration tests.
- Added source snapshot and static unit tests.
- Updated source audit, M04/M05 compatibility, data dictionary, integration plan, review checklist, PR description and diagrams.
- Clearly marked PostgreSQL execution, M05 compatibility, backend stack selection and formal domain approval as not verified/blocked/pending.

## v1.0

- Initial review package with source audit, seed CSVs, diagrams, validation templates and proposal-only hierarchy SQL.
