# Test execution report (Group 3 Final)

## Environment
Python 3.13.18, Linux x86_64; `pytest 9.1.1`, `jsonschema 4.26.0`, `numpy` installed. PostgreSQL **16.15** (Ubuntu package) with **pgvector 0.8.0 compiled from the upstream GitHub source** (the `pgvector/pgvector:pg16` Docker image was not available; Docker daemon absent). Not available: network access to PyPI/Hugging Face, `psycopg`, `sentence-transformers`, PyTorch.

## Baseline (before any change, consolidated package `Group_3_AI_Retrieval_Submission_Ready.zip`)
| Runner | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
| `unittest discover` | 214 | 214 | 0 | 0 |
| `pytest` | 214 | 214 | 0 | 0 |
The earlier report said 213 passed + 1 skipped; the skip was the `jsonschema` cross-check, which runs here because `jsonschema` is installed. Logs: `poc/execution_evidence/` (final) and the baseline numbers above.

## Final
```
python3 -W ignore -m unittest discover -s tests -t .      -> Ran 273 tests ... OK (skipped=3)
python3 -m pytest -q                                      -> 270 passed, 3 skipped, 35 subtests passed
bash tools/run_static_checks.sh                           -> ALL STATIC CHECKS PASSED   (poc/execution_evidence/static_checks_output.txt)
```
| Total | Passed | Failed | Skipped |
|---|---|---|---|
| 273 | 270 | 0 | 3 (live-DB tests; pass when OPSENSE_LIVE_PG=1) |
**+44 tests** versus baseline; **no test removed; no assertion weakened.** Changed expectations (each is a deliberate, documented change): subsystem counts 11->10 unresolved / 39->40 resolved (Fix 2), 7->8 migrations (008 added), vector no longer the last SQL parameter of the upsert (provenance parameters added), the SQL round-trip now excludes only the documented curated fields and a new test proves nothing else changed.

## New regression tests
| Module / class | Covers |
|---|---|
| `test_security_config` (+8) | no hard-coded password anywhere (SQL, shell, Python, docs), migration 007 has no password and keeps `NOSUPERUSER NOBYPASSRLS`, password script reads the environment and refuses placeholders, `.env.example` placeholders, INSERT `WITH CHECK` / UPDATE `USING`+`WITH CHECK`, live RLS script covers cross-tenant SELECT/INSERT/UPDATE |
| `test_synthetic_dataset::Fix2MappingAndFix3Quality` (+11) | only PUMP-010 resolved and only by documented rule, guessed subsystems rejected, 0 invalid FK/taxonomy, unresolved cases kept, no generic placeholder, suggested locations labelled and numeric-free, case-specific pending acceptance text, isolation warnings, Tier-3 rewording, generated SQL fresh and non-destructive |
| `test_group3_final_embedding_lifecycle::Fix4` (+10) | 384 everywhere, contradicting dimension rejected, returned/model dimension checked, mock refused by real repository, DB constraints, no duplicates/IDs preserved, model change detection, E5 prefixes, model-filtered SQL |
| `...::Fix5` (+7) | synthetic/draft/revoked never trusted, approval needs explicit status **and** eligibility, demo mode retrieves labelled demo cases, references preserved, "not a diagnosis" notice, shipped dataset has 0 trusted-eligible cases |
| `...::Fix6` (+5) | dataset validation (references, classes, filters, duplicates), filter/class consistency, metric correctness on controlled rankings, aggregate Recall@3/MRR through the runner, no benchmark numbers shipped |

| `test_local_pg_failure_handling` (+15; v2) | fake `psql` on PATH (offline): success path exit 0; failing migration stops later steps (log shows only 001-003); failing seed stops later seeds/verify; failing password step fatal; password guards never reach psql; FAIL line, ERROR line with psql exit 0, and zero-PASS output all exit non-zero; source has no `|| true`/`set +e`/psql-into-filter pipes. **Live (3 tests, `OPSENSE_LIVE_PG=1`, real psql):** `SELECT 1/0` migration exits non-zero and the next file is not run; syntax error exits non-zero; success exits 0 |

## Additional checks run
`compileall` OK; `bash -n` on all scripts OK; all JSON parses; canonical JSON Schema + semantic validation of 50 cases: 0 errors, 33 warnings (known gaps); `python -m tools.validate_mappings --check`: 0 INVALID; `python -m tools.build_curation_sql --check`: fresh; `python -m retrieval.evaluate --validate-only`: `Dataset OK: 17 queries` (validation only); `python -m integration.run_offline_pipeline`: 50/50 prepared, 0 duplicates, 0 identity drift; `python -m m09.run_audit database out`: FAIL 1 (Q05 blank components, expected open item), WARN 5, PASS 17, INFO 3 (this audit reads the **original** SQL imports, so it still shows 39/11).

## Live PostgreSQL / pgvector (executed; scratch database, `poc/execution_evidence/`)
| Check | Result |
|---|---|
| `database/scripts/local_pg.sh all` on a fresh database (migrations 001-007, password step, seeds, 50-case load, curation, guards, `m09_030`, `test_schema.sql`, `verify_rls.sql`) | every row **PASS** (`live_local_pg_all.txt`) |
| `opsense_app` login: correct password works; wrong password and cleared password fail; role not SUPERUSER/BYPASSRLS; no tenant context -> 0 rows | **PASS** (`live_app_role_login_check.txt`) |
| `tools/live_pg_check.py` (real `PostgresRepository` SQL through a psql shim; MOCK 384-d vectors; rolled back) | 19/19 **PASS** (`live_pg_check.txt`) |
## Not executed
Real `multilingual-e5-small` inference (no network/model); psycopg driver path; Docker compose path (`poc/run_poc.sh`, `migrate.sh`, `seed.sh`, `set_app_password.sh` use Docker; their **SQL** was executed through `local_pg.sh`); `migration 008` and `m09_040` on the Docker image `pgvector/pgvector:pg16` (a different build of the same PostgreSQL major version); any retrieval benchmark.
