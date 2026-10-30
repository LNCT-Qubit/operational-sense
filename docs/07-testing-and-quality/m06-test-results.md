# Actual test results — M06 v2.0

## Executed and passed

### Static source/package validator

Command:

```bash
PYTHONDONTWRITEBYTECODE=1 python scripts/validate_package.py
```

Actual output:

```text
M06 v2.0 static validation
Source snapshot rows: 30
Equipment classes: 3
Component/reference mappings: 30
Source sheets: 18
Synthetic Import_View rows audited, not seeded: 50
Required package files checked: 21
Errors: 0
PASS: source traceability and static package guardrails.
NOTE: PostgreSQL migration/seed/rollback and repository integration are not proven by this validator.
```

### Python unit tests

Command:

```bash
PYTHONDONTWRITEBYTECODE=1 python -m pytest -p no:cacheprovider -q
```

Actual output:

```text
.....                                                                    [100%]
5 passed in 0.65s
```

### Shell syntax check

Command:

```bash
bash -n tests/postgres/run_clean_database_tests.sh
```

Result: PASS (exit code 0; no output).

### Diagram render

Graphviz `dot` successfully generated `diagrams/equipment_hierarchy.svg` and `diagrams/equipment_hierarchy.png` from `diagrams/equipment_hierarchy.dot`.

## Not run / blocked

| Check | Status | Exact reason |
|---|---|---|
| Apply migration to PostgreSQL | NOT RUN | `psql` is not installed; Docker CLI is unavailable |
| Seed script twice against PostgreSQL | NOT RUN | No PostgreSQL client/server environment was available |
| Database FK/duplicate/self-parent/cycle tests | NOT RUN | `tests/postgres/verify_m06.sql` requires a real PostgreSQL database |
| SQL syntax/runtime validation on PostgreSQL | NOT RUN | No PostgreSQL execution environment |
| Rollback behavior | NOT RUN | No PostgreSQL database |
| pgvector extension check | NOT RUN | No PostgreSQL database/client; M06 does not alter the extension |
| Live repository branch/status/diff | BLOCKED | No local clone supplied; `git ls-remote` failed with `Could not resolve host: github.com` |
| M05 compatibility | BLOCKED | No M05 schema/migration files visible in the public repository root listing |
| Formal M04/Common Data Model approval | PENDING REVIEW | M04 v1.1 explicitly says formal approval pending |
| Group 1 subsystem/hierarchy approval | PENDING REVIEW | M04 Q01 remains open |
| Backend stack selection | PENDING REVIEW | Repository README says Spring Boot; task prompt says Node.js + Express |

No PostgreSQL test result, repository change, branch, commit, push or PR is claimed.


## Final ZIP extraction verification

After creating the v2.0 archive, its contents were extracted to a temporary directory and the checks were rerun against that extracted package.

- Static validator: PASS, 0 errors.
- Python unit tests: PASS, 5 passed in 0.72s.
- Bash syntax check: PASS.
- ZIP integrity: PASS, 52 entries.
- Byte-for-byte comparison between packaged files and the tested output directory: PASS.
