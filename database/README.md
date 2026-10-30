# Group 2: Backend & Database (M05 working folder)

**Status: DRAFT v2, reconciled with M04 v1.2 and M06 v2.0. Pending Common Data Model approval. Not yet run against a live database by its author: run it, then fix any error before relying on it.**

## Setup (needs Docker)
```bash
docker compose up -d            # PostgreSQL 16 + pgvector, database "opsense"
chmod +x scripts/*.sh
./scripts/migrate.sh            # creates tables (001 to 007)
./scripts/seed.sh               # loads reference data (3 classes, 30 component rows, 21 subsystems)
```

## Check it works
```bash
docker exec -i opsense-db psql -U postgres -d opsense < scripts/verify_pgvector.sql
docker exec -i opsense-db psql -U postgres -d opsense < scripts/test_schema.sql   # PASS/FAIL lines, rolled back
docker exec -it opsense-db psql -U postgres -d opsense -c "\dt"
docker exec -it opsense-db psql -U postgres -d opsense -c "SELECT count(*) FROM subsystem;"   # expect 21
```

## Reset (development only, deletes all data)
```bash
docker compose down -v && docker compose up -d && ./scripts/migrate.sh && ./scripts/seed.sh
```

## Migrations
| File | Content |
|---|---|
| 001_extensions.sql | `vector`, `pgcrypto` |
| 002_taxonomy_tables.sql | `equipment_class` (M06-compatible), `subsystem`, `failure_mode_vocabulary`, `failure_mode_taxonomy` |
| 003_reference_tables.sql | `source_reference`, `safety_procedure`, `measurement_reference`, `spare_part_reference` |
| 004_hierarchy_and_assets.sql | `class_subsystem`, `organization`, `equipment_model`, `asset_node` (+ cycle trigger), `m06_equipment_component_reference` |
| 005_cases.sql | `operational_case`, `troubleshooting_step`, `case_failure_mapping`, `case_source`, `case_spare_part`, `case_safety_procedure`, `case_verification`, `media_evidence`, `audit_log` |
| 006_historical_case_vector.sql | `historical_case` (vector column), full-text index |
| 007_row_level_security.sql | `opsense_app` role, grants, RLS policies (can be deferred) |

Seed: `seed_data/010_seed_reference_from_m06.sql` (generated from M06's CSVs; all rows PENDING_REVIEW).

## Reconciliation with M04 and M06
- **Do not run M06's own `0001_m06_asset_hierarchy.sql` on this database.** It refuses to run when `equipment_class` exists. Its tables are merged into 002 and 004 here. M06 needs to agree to this and update their package.
- `asset_node` now has `organization_id` (needed for tenant security) and `equipment_model_id`; the cycle trigger also rejects a parent from another organization.
- Two hierarchies stay separate (M04): real assets (`asset_node`) vs knowledge taxonomy (`class_subsystem`, `failure_mode_taxonomy`). Synthetic cases keep `asset_id` NULL.
- M04's FMEA and criticality tables and the separate CASE_SYMPTOM table are not built (out of MVP scope in the proposal / open decisions).

## Assumptions to confirm at the Common Data Model workshop
1. `subsystem` is its own table with generated IDs (M04 Q01 still open; not in M04's ERD).
2. Case status values: DRAFT, SUBMITTED, VERIFIED, REJECTED, REVOKED (workbook PENDING_VALIDATION loads as SUBMITTED).
3. `vector(384)` is a placeholder; M08 decides the dimension.
4. RLS in Sprint 1 scope is undecided; it is isolated in 007.
5. Asset ID strategy (M04 Q09): M06's BIGINT identity kept.
6. 11 of 50 seed cases use subsystem wording that is not in M06's clean list (for example "Impeller and casing"). The loader keeps the original wording in `subsystem_source_label` and leaves `subsystem_id` empty until Group 1 approves a mapping.

## Still to do
- Load Import_View cases, steps, mappings, sources and verification records (loader)
- Failure-mode taxonomy, vocabulary, sources, safety, measurement and spare-part seeds from the Group 1 workbook
- Constraints and relationships documentation, sample records, final ER diagram update
