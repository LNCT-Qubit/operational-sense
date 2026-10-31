# Initial audit report (Phase 1)

Inspected: the three uploaded ZIPs, file by file (430 files incl. git metadata). Re-derived, not trusted: every count below comes from running code on the files.

## 1. What was in the three packages
| Package | Actually contained | Notes |
|---|---|---|
| `Operational_Sense_Backend_Database-1.zip` | Group 2 database baseline (migrations 001-007, seeds, Step 4 SQL imports for 50 cases / 350 steps, schema snapshot), early `retrieval/` stub (config, db, text_builder, 7 tests), `.git` history, **`.env`**, `.DS_Store`, `__MACOSX` | Baseline of the other two |
| `Operational_Sense_M08_Fixed.zip` | M08: `retrieval/` package (embedder, ingest, repository, search, evaluate, metrics), 17-query evaluation set, setup guide, strategy doc, 84 tests, hardened `007`, `migrate.sh`, `seed.sh` | No Step4_5 case import file |
| `M09_Final_Package.zip` | M09: audit package `m09/` + 53 tests, fixed SQL (org seed, asset seed, spare-part join, subsystem FK script, guards), load order script, reports | Contains a full copy of the database baseline in `project/` |

**No M07 deliverable was present.** There is no JSON schema, no JSON sample case, and no validation code. The only "case schema" is the PostgreSQL model (migrations 002-006), still labelled "DRAFT, pending Common Data Model v1.0". M08's and M09's own reports say the same. The canonical schema in this package is therefore **derived from the database**, not taken from Udit's work (see `COMMON_DATA_MODEL.md`).

## 2. Existing functionality (verified by running it)
- Original M08 suite: 84 tests OK. Original M09 suite: 53 tests OK (M08's report says 81; the real count is 84).
- M09 audit (26 checks) reproduces its own numbers: 50 cases, 350 steps, 17/17/16 per class, 11 blank components, 141 generic steps, 15 depth flags, 14 generic safety rows.
- M08: text builder, embedder with dimension check and L2 normalisation, eligibility rule, idempotent upsert, search with filters, evaluation runner that refuses to invent metrics.

## 3. Duplicated and conflicting implementations
| Item | Variants | Resolution |
|---|---|---|
| Database baseline | 3 copies (Backend, M08, M09) differing in `007`, `migrate.sh`, `seed.sh`, `020_seed_asset_hierarchy.sql`, Step4_4/Links SQL, README | One copy in `database/`: M09's fixed SQL + M08's hardened `007`/`migrate.sh`/`seed.sh` |
| Asset seed `020` | M09 creates models only and relies on seed `005` for the organisation; M08 creates organisation and models inside `020` | M09 variant kept (matches its tested load order); M08's contract test rewritten to check the canonical files |
| Container access | `docker exec opsense-db` (M09) vs `docker compose exec db` (M08) | `load_all_m09.sh` switched to compose service |
| Embedding text | v1 (symptom fields only) | extended to v2 (adds Equipment + Subsystem lines), documented |
| Case status after import | README/`validate_step5.sql` said SUBMITTED, import loads DRAFT | DRAFT is authoritative (M09 fixed the validator) |

## 4. Confirmed defects
| # | Severity | Defect | Status here |
|---|---|---|---|
| D1 | High | No machine-readable case schema or validator existed (M07 missing); JSON samples absent | **Fixed**: canonical schema, validator, samples, tests |
| D2 | High | **Real credentials file `.env`** shipped inside the backend ZIP (also `.git`) | **Fixed**: not packaged; test enforces absence |
| D3 | High | `docker-compose.yml` published PostgreSQL on all interfaces (`5432:5432`) | **Fixed**: loopback only |
| D4 | High | `007` created role `opsense_app` with a hard-coded dev password and (Backend/M09 copies) did not re-assert `NOSUPERUSER NOBYPASSRLS` for a pre-existing role | **Partly fixed**: M08's `ALTER ROLE` reassertion adopted; rotation script added; dev password still ships in the migration (documented) |
| D5 | High | Fresh load failed: no script created the demo organisation; asset seed used UUIDs from the author's DB; spare-part join fanned out (120 rows) | Already fixed by M09; kept and regression-tested |
| D6 | High | `subsystem_id` NULL for 50/50 cases, so the strict subsystem filter could not match | M09 fix script adopted (39 resolved, 11 unresolved); executed later on scratch PostgreSQL 16.15 (see TEST_EXECUTION_REPORT.md) |
| D7 | Medium | Observed outcome required by the brief has no database column | Handled as JSON proposal; loader refuses non-null values |
| D8 | Medium | Search supported only class/subsystem/model filters; taxonomy/failure mode/synthetic filters (required) missing | **Fixed** in repository, search, CLI, mock |
| D9 | Medium | Embedding text had no equipment/subsystem context | **Fixed** (v2) |
| D10 | Medium | M08 test `test_seed_sql_contract` and `evaluate.py` hard-coded old paths; M09 test forbade any `.env*` | Paths adapted; `.env.example` allowed |
| D11 | Low | M08 report cites 81 tests; actual is 84 | Noted |
| D12 | Medium (new) | 14 tier-3 intervention steps are one-line text (e.g. `Supervisor approval: adjust settings per OEM.`) | Reported as warning TIER3-THIN, register rows |
| D13 | Info | `005` refers to a non-existent migration `008`; `scripts/load_steps_links_verification.sql` is stale (marked DO NOT RUN) | Left in place, listed in limitations |

## 5. Compatibility problems
- JSON field names vs DB: none after canonicalisation (round-trip test). Resolved IDs (`subsystem_id`, `equipment_model_id`, `case_id`) are database-generated, so JSON carries names; the loader resolves them.
- `historical_case.status` duplicates `operational_case.case_status`; search guards with `h.status = c.case_status`. Open: who promotes cases into `historical_case` (nobody owns it in the inspected files).

## 6. Missing deliverables found
M07 schema/samples/validation; a retrieval POC execution log; `unresolved` register; integration tests; a single load order document (M09 supplied one).

## 7. Security concerns
See D2-D4; additionally: dev password in migration, unpinned Docker image tag (`pgvector/pgvector:pg16`), `sentence-transformers` unbounded in the originals (bounded now), SQL built with f-strings only from constants (checked), RLS policies have USING and WITH CHECK where required (tested statically, **not on a live DB**).

## 8. Testing limitations of the build environment
No PostgreSQL, Docker, pgvector, `psycopg`, `jsonschema`, `pytest`, network, or embedding model. Everything that needs them was written offline at audit time (level 1-2). **Update (v1/v2):** scratch PostgreSQL 16.15 + pgvector 0.8.0 was later built from source and the SQL executed there (level 3, MOCK vectors); Docker, psycopg and real embedding inference remain NOT executed.


> **Update (Group 3 Final):** statements above that the SQL "never ran" or that migration 007 holds a dev password are superseded: see `TEST_EXECUTION_REPORT.md`, `ACCEPTANCE_ASSESSMENT.md` and `CHANGELOG.md`.
