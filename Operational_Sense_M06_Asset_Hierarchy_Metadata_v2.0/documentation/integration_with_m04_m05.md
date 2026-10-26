# Integration with M04 and M05

## M04 contract reflected

The candidate implements the logical fields M04 associates with `EQUIPMENT_CLASS` and `ASSET_NODE`. It preserves the self-referencing hierarchy and equipment-class FK. It does not enforce hierarchy-level combinations because M04 makes those dependent on Group 1 approval.

## M05 status

No M05 schema or migration files were visible in the repository's current public root listing, and no local repository checkout was available. Direct Git remote inspection failed with DNS resolution error. The migration therefore:
- uses M04's logical table names for the candidate core entities;
- fails before DDL if `public.equipment_class` or `public.asset_node` already exists;
- avoids dropping or overwriting existing objects;
- must be reconciled against M05 before use in a database where M05 has created either table.

## Recommended repository destination map

The live repository README presents a broad modular-monolith structure, but the current public root listing does not expose these directories. Confirm actual conventions before adding files. Proposed destinations:

| Package path | Proposed repository destination | Integration note |
|---|---|---|
| `sql/migrations/0001_m06_asset_hierarchy.sql` | `backend/src/main/resources/db/migration/` **if Spring Boot/Flyway is confirmed**, otherwise the existing Node migration directory | Do not copy as a duplicate migration; adapt naming/transaction behavior to the chosen runner |
| `sql/seed_data/seed_m06_reference_data.sql` | existing database seed/reference-data directory | Run after the migration, only on an approved dev/test DB |
| `sql/seed_data/*.csv` | `data/reference/` or existing approved seed directory | Source-backed review dataset |
| `sql/validation/*.sql` | `tests/database/` or current SQL validation directory | Adapt schema/search path if required |
| `tests/postgres/*` | existing database integration test directory | Keep test database guardrails |
| `scripts/validate_package.py` and `tests/test_m06_package.py` | existing validation/test directories or `tools/m06/` | These do not require a database |
| `documentation/*.md`, `source_audit/*`, `diagrams/*` | `docs/03-domain-knowledge/` and/or `docs/04-data-governance/` per repo README | Avoid duplicate canonical docs |

This is a proposed mapping, not a claim that those paths exist in the current checkout.

## Safe integration steps

1. Obtain a fresh clone and inspect `git status --short --branch`, `git ls-files`, migrations, package scripts, and CI.
2. Inspect the actual M05 DDL and migration framework.
3. Confirm backend stack discrepancy (Spring Boot vs Node.js + Express).
4. Compare candidate columns/types/constraints against M05 and the approved Common Data Model.
5. If M05 already owns `equipment_class` or `asset_node`, create a narrow compatible migration; do not create competing tables.
6. Decide whether `m06_equipment_component_reference` is a temporary import table or should map into an approved taxonomy table.
7. Apply migration and seeds to a clean disposable PostgreSQL database; run the included tests and project CI.
8. Obtain Group 1, M05 and Group 4 reviews before merging.
