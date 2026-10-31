# M08 Repair & Verification Report — Operational Sense

**Prepared:** 2026-10-29  
**Scope:** Uploaded M08 embedding/retrieval package, M05 backend/database package, and M08 screenshot-based verification report.  
**Important:** No separate M07/Udit ZIP was present among the files available in this work session. The schema contract was therefore checked against the schema/migrations bundled in the M05/M08 packages, not against a separately approved M07 deliverable.

## 1. Executive summary

The existing M08 Python implementation already had a retrieval pipeline, tests, and safety/eligibility logic. It was not demonstrated against a live database in the supplied report. I preserved that architecture and fixed the reproducibility issues that could be safely addressed from the available files.

**Current verified results in this environment:**

- Python unit suite: **84 passed**.
- Evaluation dataset validation: **17 queries validated** against case references found in the supplied synthetic-case SQL.
- Shell scripts: `bash -n` passes for `migrate.sh`, `seed.sh`, and `load_synthetic_cases.sh`.
- The code and scripts are packaged without `.env`, Git history, or Python cache files.

**Not verified here:** a live PostgreSQL/pgvector migration, case import, model download/inference, stored real vectors, actual Top-3 retrieval, or Recall@3/MRR. This runtime has no Docker CLI, PostgreSQL client/server, `psycopg`, `pgvector` Python package, or `sentence-transformers` package. No real database or model result is claimed.

## 2. Root-cause findings from supplied evidence

### A. `symptom_text` query error

The displayed schema intentionally stores symptoms in `operational_case`; `historical_case` is a thin vector index containing case IDs, filters/status metadata, and the embedding. The actual M08 repository search joins `historical_case h` to `operational_case c` and selects `c.symptom_text`. Therefore, the failed ad-hoc query that selected `symptom_text` directly from `historical_case` was inconsistent with the schema; it did not by itself prove that the repository's search SQL was wrong. The verification SQL now documents this distinction.

### B. Missing equipment model foreign keys in the asset seed

`seed_data/020_seed_asset_hierarchy.sql` referenced three hard-coded equipment-model UUIDs, but the reference seed did not create those rows. The model import in the later Step 4 case file was the first place that created them, so running the hierarchy seed earlier could fail its foreign key.

**Fix applied:** the hierarchy seed now ensures the demo organisation and the three required illustrative models exist first, resolves their IDs by `(equipment_class_id, model_designation)`, and then creates the asset nodes. It no longer assumes generated UUID values.

### C. Missing demo organisation in the seed entry point

The asset seed assumed the fixed demo organisation existed, but `scripts/seed.sh` only runs the reference and hierarchy seed files, and the hierarchy seed did not create the organisation.

**Fix applied:** `020_seed_asset_hierarchy.sql` now inserts the fixed demo organisation idempotently and checks that the expected ID exists before creating assets. A conflicting organization-name/ID setup fails with an explicit message instead of silently using the wrong tenant.

### D. Database listing / relations appeared inconsistent

The supplied screenshots show migrations apparently creating relations and later checks saying no relations, but do not establish the exact cause. A stale named Docker volume can retain an earlier cluster/database state because `POSTGRES_DB` only initializes a fresh data directory; a command can also inspect a different database/container than the one migrated. The exact cause cannot be confirmed from screenshots alone.

**Fix applied:** `scripts/migrate.sh` now uses the Compose `db` service consistently, prints the target, creates the configured target database if it is absent from the running cluster, uses `ON_ERROR_STOP`, and prints a relation check after migrations. It does not drop data.

### E. No reliable, ordered case-import command

The supplied README did not provide a single executable entry point for the full Step 4 import sequence, and the older `load_steps_links_verification.sql` references missing files.

**Fix applied:** added `scripts/load_synthetic_cases.sh`, which loads sources, taxonomy/vocabulary, measurements, safety/spares, cases, diagnostic steps, then links/verification in dependency order. It stops on the first SQL error and asserts that the demo organization has 50 synthetic cases and 350 diagnostic steps. It never promotes cases to trusted/verified status.

## 3. Files changed or added

- `seed_data/020_seed_asset_hierarchy.sql` — creates/checks demo organisation and required illustrative models; uses looked-up model IDs instead of hard-coded UUIDs.
- `scripts/migrate.sh` — consistent Compose/database targeting, target database creation if missing, fail-fast migrations, post-migration relation check.
- `scripts/seed.sh` — consistent Compose targeting and schema preflight.
- `scripts/load_synthetic_cases.sh` — ordered Step 4 loader and 50-case/350-step assertions.
- `scripts/diagnose_database.sql` — read-only diagnostics for current database, relations, row counts, and column ownership.
- `scripts/verify_m08_retrieval.sql` — updated checks for actual case/vector counts, status consistency, ineligible vectors, and self-distance; explicitly notes symptoms live in `operational_case`.
- `tests/test_seed_sql_contract.py` — regression checks for seed dependencies, model lookup, schema/query contract, and import order.
- `migrations/007_row_level_security.sql` — reasserts that `opsense_app` is not superuser and does not have `BYPASSRLS`, including if the role already existed.
- `.env.example`, `README.md`, `documentation/m08/M08_setup_guide.md` — updated setup commands, demo org ID, password caveat, and verification steps.
- `M08_FINAL_REPORT.md` — marked as historical; this report supersedes its earlier 81-test count.

## 4. Commands for a machine with Docker and internet/model access

Run from the project root:

```bash
cp .env.example .env
# Edit POSTGRES_PASSWORD. Keep OPSENSE_APP_PASSWORD=<REDACTED-superseded-dev-password> for this local-only migration setup.
# Set OPSENSE_ORG_ID=b2a7dce7-b449-4381-ba3b-b520f2c88c2e.
# Do not share the development password; configure/rotate credentials before any shared deployment.

docker compose up -d --wait
chmod +x scripts/*.sh
./scripts/migrate.sh
./scripts/seed.sh
./scripts/load_synthetic_cases.sh

docker compose exec -T db psql -X -U postgres -d opsense < scripts/diagnose_database.sql
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m retrieval.check_connection
python -m retrieval.embed_cases --dry-run
python -m retrieval.embed_cases --include-demo

docker compose exec -T db psql -X -U postgres -d opsense < scripts/verify_m08_retrieval.sql
python -m retrieval.search_cases "pump me ghurr-ghurr awaaz aur bearing garam hai" --include-demo --json
python -m retrieval.evaluate --include-demo
```

Use `--include-demo` only for explicitly labelled synthetic demonstration/evaluation. Without it, the system should return no trusted cases until expert review promotes eligible cases. Do not set seed cases to `VERIFIED` merely to make search return results.

## 5. Tests actually run here

```text
python -m pytest -q
84 passed in 0.22s

python -m retrieval.evaluate --validate-only
Dataset OK: 17 queries (sha256 ca331cf1b855...)

bash -n scripts/migrate.sh scripts/seed.sh scripts/load_synthetic_cases.sh
shell syntax OK
```

## 6. Execution blockers and remaining work

| Check | Status | Why |
|---|---|---|
| Python unit tests | PASS — 84 | Executed in this environment |
| Evaluation dataset references | PASS — 17 queries | Offline validation only |
| Shell syntax | PASS | `bash -n` |
| Fresh database migration | NOT RUN | Docker and PostgreSQL client/server unavailable |
| Seed/import SQL against PostgreSQL | NOT RUN | No live PostgreSQL available |
| Real embedding model and 384-D response | NOT RUN | `sentence-transformers` is not installed; model was not downloaded/executed |
| Real vector insert and pgvector nearest-neighbour query | NOT RUN | No database or `psycopg`/`pgvector` runtime available |
| Actual Top-3 results | NOT RUN | Depends on live database and real model |
| Recall@3 / MRR | NOT RUN | No actual retrieval results; no metrics invented |

Once run on a suitable machine, if the loader fails, use the first failing SQL statement as the next fix target. If the 50-case/350-step assertion fails, do not ignore it: inspect import errors and duplicate/foreign-key conflicts. If the database contains zero vectors after embedding, check model download, connection settings, the tenant ID, and whether demo mode was explicitly enabled. Subsystem filtering will still return no cases until the missing subsystem mappings are approved and loaded; no mappings were fabricated here.

## 7. Safety and data integrity notes

- The 50 supplied cases remain synthetic and DRAFT/demo-only; no approval or trusted status was fabricated.
- The model choice `intfloat/multilingual-e5-small` and 384 dimensions remain provisional until real inference and team approval.
- Similarity scores are ranking signals, not diagnosis confidence.
- No tenant isolation or RLS eligibility policy was disabled to make the demo work.
- The exact cause of the prior screenshot's database mismatch remains unconfirmed until the new diagnostics are run in the actual Docker environment.
