# Validation report

## Actual results in this environment

| Check | Status | Evidence |
|---|---|---|
| ZIP integrity of input v1.0 | PASS | `testzip()` returned no corrupt entry |
| Workbook sheet inventory | PASS | 18 worksheets enumerated |
| Source equipment rows | PASS | 3 class IDs and 30 mapping rows extracted from `Equipment_Reference` |
| Source-to-CSV traceability | PASS | Automated static validator compares all 30 normalized rows to the included source snapshot |
| Required source terms/IDs preserved | PASS | Static tests compare class IDs, labels, source row numbers and subsystem ID text |
| SQL static guardrails | PASS | Validator checked non-destructive migration, preflight collision guard, FKs, cycle trigger, idempotent seed and test script presence |
| Python static/unit tests | PASS | `python scripts/validate_package.py` (0 errors); `python -m pytest -p no:cacheprovider -q` (5 passed) |
| PostgreSQL migration execution | NOT RUN | `psql` and Docker are not installed in the environment |
| PostgreSQL seed double-run | NOT RUN | Requires disposable PostgreSQL database |
| FK, self-parent and cycle negative tests | NOT RUN | SQL integration suite is supplied at `../tests/postgres/verify_m06.sql` |
| Rollback behavior | NOT RUN | No PostgreSQL environment; rollback instructions are limited to disposable test setup |
| pgvector extension verification | NOT RUN | No PostgreSQL server/client; M06 does not alter pgvector |
| Repository CI / working tree | BLOCKED | Direct `git ls-remote` failed DNS; no local clone supplied |
| M05 schema compatibility | BLOCKED | No visible M05 migration/schema in public repository listing |
| Architecture/domain approval | PENDING REVIEW | M04 formal approval, Q01/Q02/Q04/Q09/Q10 and stack discrepancy remain open |

## How to run the available tests

Static checks (no database required):

```bash
python scripts/validate_package.py
python -m pytest -p no:cacheprovider -q
```

Database tests (requires a disposable PostgreSQL database whose name contains `test`):

```bash
export M06_TEST_DATABASE_URL='postgresql://.../operational_sense_test'
export M06_ALLOW_DATABASE_MUTATION=YES
bash tests/postgres/run_clean_database_tests.sh
```

The database script refuses to proceed unless the explicit opt-in is set, `psql` exists, and the database name contains `test`. It also refuses to create core tables that already exist. Never point it at production or a shared database.

## pgvector verification

M06 does not create or alter the `vector` extension. Once a PostgreSQL test database is available, verify it separately with:

```sql
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vector';
```

If no row is returned, pgvector is not installed in that database. This check is informational and was not run here.
