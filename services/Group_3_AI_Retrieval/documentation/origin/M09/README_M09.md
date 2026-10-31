# README_M09 - setup and verification (Windows)

Folder: `project/` = backend DB files (with M09 fixes), `m09/` = Python helpers, `tests/` = tests, `data/` = generated evidence, `reports/` = run logs.
Use PowerShell from this folder. Python 3.10+ only; no pip packages.

## Part A - offline (no database, no Docker)
```powershell
py -3 -m unittest discover -s tests -t . -v      # expect: Ran 53 tests ... OK
py -3 -m m09.run_audit project data              # prints findings Q01-Q26, rewrites data\m09_*.{json,csv}
```
Expected: only `Q05` FAIL (11 blank components = open expert-review item). Shell syntax (Git Bash or WSL): `bash -n project/scripts/load_all_m09.sh`.

## Part B - needs PostgreSQL 16 + pgvector (NOT run by the author)
Prerequisite: Docker Desktop. Use **Git Bash or WSL** for the `.sh` scripts (they use `<` redirection). Create `project/.env` yourself (not in this package):
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=choose-a-local-password
POSTGRES_DB=opsense
```
Use a **disposable** instance (a different container name/port/volume if you already have data). Do **not** run `docker compose down -v` on a database you want to keep.
```bash
cd project
docker compose up -d
chmod +x scripts/*.sh
./scripts/migrate.sh                 # migrations 001-007 (M09 SQL is deliberately not auto-applied)
./scripts/load_all_m09.sh            # org, reference, sources, taxonomy, measurements, safety/spares, assets, cases, steps, links, subsystem FK
docker exec -i opsense-db psql -U postgres -d opsense < sql/m09/m09_030_validate_live.sql    # every line should say PASS
docker exec -i opsense-db psql -U postgres -d opsense < scripts/verify_pgvector.sql
docker exec -i opsense-db psql -U postgres -d opsense < scripts/test_schema.sql
```
PowerShell alternative to `< file`: `Get-Content -Raw sql\m09\m09_030_validate_live.sql | docker exec -i opsense-db psql -U postgres -d opsense`.
Optional, review first: `sql/m09/m09_020_retrieval_guards.sql` (CHECK constraints + trusted/demo views). Apply it the same way on the disposable DB, then re-run `scripts/test_schema.sql` and `documentation`-style RLS checks.
If a step fails (the order was derived by reading the files, never executed), send me the error text.
Expected in `m09_030_validate_live.sql`: cases 50, steps 350, subsystem_id 39, DRAFT 50, trusted-eligible 0, case_spare_part 98, spare_part_reference 80, case_safety_procedure 700.
If you loaded the **old** scripts into an existing DB, expect FAILs for spare links (120) and spare rows (81); decide yourself whether to delete the old rows - nothing here deletes data.

## Still not covered by anything here
M08 retrieval run, embeddings, vector search, Recall@3/MRR, expert review. Never mark synthetic cases VERIFIED to make retrieval return results.
