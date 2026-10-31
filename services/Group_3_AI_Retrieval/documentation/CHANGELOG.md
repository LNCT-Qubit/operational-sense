# Changelog

## v2 - local_pg.sh fail-fast repair (2026-10-30)
- `database/scripts/local_pg.sh` rewritten: every psql call is `psql -X -v ON_ERROR_STOP=1`; output goes to a temp file so psql's exit status is read directly (previously `| grep -v NOTICE || true` / `| tail -2 || true` / `| grep -E "PASS|FAIL" || true` hid failures); first failing file stops the run with exit 1; verification exits non-zero on a FAIL result, an ERROR line, or no PASS line; NOTICE lines are filtered from display only; readable logs kept.
- New `tests/test_local_pg_failure_handling.py` (15 tests; 3 need a live disposable DB). No existing test removed or weakened; the 50-case dataset, mappings, taxonomy and OEM content untouched.
- Stale "NOT executed" headers/comments/docs corrected to the four levels (static / mock integration / scratch PostgreSQL+pgvector / real inference). Real inference remains NOT executed.

## Group 3 Final stabilisation (2026-10-30)
### Fixed
- **Credentials (Fix 1):** migration 007 no longer contains a password (role created `LOGIN NOSUPERUSER NOBYPASSRLS`, no password = password login fails closed). New `database/scripts/set_app_password.sh` and `local_pg.sh password` read `OPSENSE_APP_PASSWORD` from the environment (`\getenv`, never on a command line). `poc/set_app_password.sql` removed. The old dev password was redacted from the origin documents. `.env.example` placeholders only. New `database/scripts/verify_rls.sql` (policy catalogue, cross-tenant SELECT/INSERT/UPDATE on `historical_case` and children, fail-closed context).
- **Mapping (Fix 2):** CASE-PUMP-010 subsystem resolved (*Hydraulic End*) by a documented M06 rule; the other 10 stay unresolved with reasons. Validator accepts a non-exact subsystem only with a `SUBSYSTEM-RESOLUTION` assumption (new warning `SUBSYS-CURATED`). `tools/validate_mappings.py` report.
- **Diagnostic quality (Fix 3):** `tools/curation.py` overlay (original SQL untouched): 127 suggested measurement locations (labelled), 14 pending; case-specific PENDING VERIFICATION acceptance text (50); 13 isolation warnings corrected; 14 thin Tier-3 steps linked to cause and re-check; general safety rows labelled "NOT an approved plant procedure". Generated `database/sql/m09/m09_040_apply_curation.sql`.
- **Embeddings (Fix 4):** migration 008 (model/dimension/text hash/version/timestamp per vector; `chk_embedding_not_mock`; `chk_embedding_has_provenance`); mock backends flagged `is_mock` and refused by `PostgresRepository`; model-reported dimension and known-model dimension checks; search filtered on `embedding_model`; stale-row detection on re-embedding; `poc/similarity_search.sql` model filter.
- **Lifecycle (Fix 5):** behaviour unchanged (already correct); 7 regression tests added; `m09_020` guards now part of the load order.
- **Evaluation (Fix 6):** `validate_dataset` checks filters, classes, class/filter consistency, duplicates; metric tests on controlled rankings.
- **Reproducibility (Fix 7):** `database/scripts/local_pg.sh` (Docker-free), `tools/run_static_checks.sh`, `tools/live_pg_check.py`, `tools/psql_shim.py`; evidence in `poc/execution_evidence/`.
### Tests
214 -> 273 tests (270 pass + 3 live-only skips by default), 0 failed (see TEST_EXECUTION_REPORT.md).
### Changed expectations (not weakened)
Subsystem counts, migration count 7->8, upsert parameter order, SQL round-trip excludes documented curated fields (a separate test proves nothing else changed), register counts.

## Group 3 consolidated submission (2026-10-30)
### Added
- `case_schema/`: canonical JSON Schema 1.0.0, stdlib validator, semantic + dataset rules, reference data parsed from the SQL seeds, generated field definitions.
- `sample_cases/`: 5 valid, 21 invalid samples.
- `synthetic_dataset/synthetic_cases.json` (50 cases, round-trip verified), unresolved register (280 rows), quality report.
- `integration/`: fail-closed JSON -> DB mapping, pipeline, offline runner with evidence file.
- Retrieval filters: `taxonomy_code`, `failure_mode_id`, `is_synthetic` (repository, search, CLI, mock).
- `retrieval/text_builder.py`: `extract_metadata`, `text_sha256`, version tag; **text v2** adds Equipment and Subsystem lines; `repository` selects `subsystem_source_label`.
- `poc/`: `pgvector_setup.sql`, `similarity_search.sql`, `run_poc.sh`, `set_app_password.sql` (Docker/model path not executed; SQL exercised on a scratch PostgreSQL via local_pg.sh).
- 77 new tests; security/config tests; diagrams; documentation set.
- Layout note: `retrieval/` stays one flat package (embedder, text builder/metadata, ingest, search) with `retrieval/evaluation/`; splitting it into `embedding_pipeline/`/`metadata/` sub-packages would break imports for no functional gain.
### Changed (documented, minimal)
- Database baseline unified into `database/` (M09 fixed SQL + M08 hardened `007`, `migrate.sh`, `seed.sh`).
- `docker-compose.yml`: port bound to `127.0.0.1`; host port configurable.
- `load_all_m09.sh`: uses `docker compose exec` (was fixed container name).
- Tests adapted to the new layout: `tests/common.py` (`PROJECT` = `database/`), `test_seed_sql_contract.py` (checks canonical seed 005/020 and `load_all_m09.sh`), `test_regressions.py` (allows `.env.example`), `test_search.py` (mock-only threshold 0.7 -> 0.6 for the longer v2 text). `retrieval/evaluate.py` paths -> `retrieval/evaluation/`, `database/`.
- `requirements.txt`: upper bounds added; dev extras separate.
### Removed from the package (not deleted from the originals)
- `.env` (real credentials), `.git`, `__MACOSX`, `.DS_Store`, duplicate copies of the database baseline.
### Breaking changes
None for the database. JSON case format is new (1.0.0).
### Not changed
Migrations 001-006, RLS policies, case/step/taxonomy data content, all case statuses (DRAFT), eligibility (demo-only).

## Earlier work preserved (see `documentation/origin/`)
M05 backend baseline (Oct 25-28); M08 retrieval implementation and repair pass (Oct 29); M09 audit and SQL fixes F1-F7 (Oct 29).
