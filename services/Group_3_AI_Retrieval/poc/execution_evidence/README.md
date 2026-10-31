# Execution evidence (real outputs; nothing fabricated)

| File | What it is | Live DB / model? |
|---|---|---|
| `live_environment.txt` | server version and pgvector version used | PostgreSQL 16.15, pgvector 0.8.0 (**built from GitHub source**, scratch cluster) |
| `live_local_pg_all.txt` | `database/scripts/local_pg.sh all` on a fresh database: migrations, password step, seeds, curation, guards, `m09_030` (31 PASS), `test_schema.sql` (T1-T11 PASS), `verify_rls.sql` (R1-R10 PASS) | **Live DB** |
| `live_app_role_login_check.txt` | `opsense_app` login with configured / wrong / cleared password; flags; no-tenant-context count | **Live DB** |
| `live_pg_check.txt` / `.json` | real `PostgresRepository` SQL through `tools/psql_shim.py`: constraints, ingestion, no duplicates, provenance, model change, trusted vs demo, filters, RLS; rolled back | **Live DB, MOCK vectors only** |
| `static_checks_output.txt`, `test_run_unittest.txt`, `test_run_pytest.txt` | offline checks and the 273-test run (270 passed, 3 skipped) | No |
| `live_failure_tests.txt` | `tests/test_local_pg_failure_handling.py` with `OPSENSE_LIVE_PG=1` (REAL psql, deliberately failing SQL): 15 passed | **Live DB** |
| `live_negative_failing_sql.txt` | real `local_pg.sh migrate` with a deliberately failing migration: exit status 1, later migration not run | **Live DB** |
| `offline_pipeline_run.json` | mock pipeline run (256-d hashing vectors, in-memory store) | No |

**Not produced:** any real-embedding output, any `live_search_*.json` from `poc/run_poc.sh`, any Recall@3/MRR. Mock-vector similarity values prove SQL mechanics only.
