# M06 tests

## Static tests

```bash
python scripts/validate_package.py
python -m pytest -q
```

These tests run without a PostgreSQL server. They compare the normalized CSVs to the included `Equipment_Reference` source snapshot, validate source row provenance, inspect required SQL safeguards and ensure all referenced package files exist.

## PostgreSQL integration tests

Use only a disposable PostgreSQL test database with a database name containing `test`.

```bash
export M06_TEST_DATABASE_URL='postgresql://user:password@localhost:5432/operational_sense_test'
export M06_ALLOW_DATABASE_MUTATION=YES
bash tests/postgres/run_clean_database_tests.sh
```

The script applies the migration, loads seed data twice, runs integrity assertions, then tests invalid FK references, duplicate class ID rejection, self-parent rejection, arbitrary-depth cycle rejection and recursive traversal. The integration test's data changes are rolled back.

The script was not run in the authoring environment because `psql` and Docker were unavailable. Do not mark the database suite as passed until actual output is captured.
