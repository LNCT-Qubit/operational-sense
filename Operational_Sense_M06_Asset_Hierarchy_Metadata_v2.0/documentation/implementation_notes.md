# Implementation notes

## What is implemented in v2.0

- Candidate PostgreSQL schema for `equipment_class` and `asset_node`.
- Namespaced provenance/reference table for the 30 Group 1 component/subsystem mappings.
- Source-backed seed CSVs and SQL seed script for three equipment classes and 30 mapping rows.
- Primary keys, foreign keys, required/nonblank checks, unique source provenance/mapping constraints and supporting indexes.
- Self-parent check and a trigger that detects arbitrary-depth parent cycles.
- Transaction-scoped advisory lock around parent-link changes to serialize cycle validation.
- Recursive descendant query with a path guard.
- SQL validation queries and a disposable-database integration test script.
- Static source traceability tests and a machine-readable fixture.
- Updated diagrams, source audit, data dictionary, decisions, integration plan and PR handoff.

## What is deliberately not implemented

- No Express API or Spring Boot service code: the actual target backend stack is inconsistent between the task prompt and the repository README, and M06 is a data-model task.
- No pgvector extension or embedding changes.
- No model table, location table, criticality assessment or FMEA implementation: M04 marks related concepts as unresolved/proposed and they are outside the supported M06 seed data.
- No synthetic troubleshooting case or diagnostic-step data loaded as physical assets.
- No subsystem IDs fabricated and no hierarchy levels promoted to approved values.
- No repository branch, commit, push or pull request created.

## Migration execution

The migration is raw PostgreSQL SQL so it can be adapted to the project's selected migration runner. It intentionally fails if the two core target tables already exist. The database test runner wraps migration execution in a single transaction. Before using another migration framework, confirm whether that framework wraps migrations in transactions and adapt invocation accordingly.

## Rollback

No automatic production down-migration is included. Dropping the candidate tables is destructive and should only be considered on a disposable database created specifically for the M06 test run. On a shared database, plan a reviewed forward correction instead of dropping tables.
