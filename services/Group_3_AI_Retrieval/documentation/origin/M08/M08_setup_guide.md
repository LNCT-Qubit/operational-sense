# M08 Setup Guide — embeddings and similarity search

Run every command from the **project root** (the folder containing `README.md` and `migrations/`).
Status of these steps: the Python/test steps were run in the authoring environment. The database, model-download and search steps were **NOT run** there (no PostgreSQL, no network) and are written from the code and the existing README.

## 1. Install Python dependencies
```bash
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt                         # includes sentence-transformers (large; installs PyTorch)
```

## 2. Create your `.env`
```bash
cp .env.example .env        # then edit .env; never commit it, never share it
```
Fill in: `POSTGRES_PASSWORD` (a local value used by Docker); `OPSENSE_APP_PASSWORD` (for this local-only setup, it must match `<REDACTED-superseded-dev-password>` from migration 007; rotate/configure securely before any shared deployment); `OPSENSE_ORG_ID=b2a7dce7-b449-4381-ba3b-b520f2c88c2e` (the demo organisation seeded by `seed_data/020_seed_asset_hierarchy.sql`). Leave embedding variables at their defaults unless the team approves another model.

## 3. Start PostgreSQL + pgvector and load the schema/reference data
```bash
docker compose up -d --wait
chmod +x scripts/*.sh
./scripts/migrate.sh
./scripts/seed.sh
docker compose exec -T db psql -X -U postgres -d opsense < scripts/diagnose_database.sql
docker compose exec -T db psql -X -U postgres -d opsense < scripts/verify_pgvector.sql
```
The migration script explicitly targets the configured database and prints relation checks. If an old named volume exists, it creates the configured database if missing rather than silently continuing against a different database.

## 4. Load the 50 synthetic cases and supporting records
Use the ordered loader rather than running root SQL files manually:
```bash
./scripts/load_synthetic_cases.sh
```
It runs source references → taxonomy/vocabulary → measurement references → safety/spares → operational cases → diagnostic steps → case links/verification, stopping at the first SQL error. The script prints row counts at the end. All 50 cases remain `DRAFT` + `demo_only_until_expert_review`; they are not approved historical knowledge.

## 5. Check the connection
```bash
python -m retrieval.check_connection
```

## 6. Generate and store embeddings
```bash
python -m retrieval.embed_cases --dry-run                 # no model, writes nothing: shows how many cases qualify
python -m retrieval.embed_cases --include-demo            # DEMO: embeds the 50 DRAFT cases (first run downloads the model)
python -m retrieval.embed_cases                           # trusted only (VERIFIED + eligible); embeds 0 until cases are reviewed
```
Safe to repeat: it updates the single `historical_case` row per case; it never creates duplicates. Add `--withdraw-ineligible` to clear vectors of cases that are no longer eligible. Check the result:
```bash
docker compose exec -T db psql -X -U postgres -d opsense < scripts/verify_m08_retrieval.sql
```

## 7. Search
```bash
python -m retrieval.search_cases "pump me ghurr-ghurr awaaz aur bearing garam hai" --include-demo
python -m retrieval.search_cases "seal leaking after dry run" --class EQ-PUMP --include-demo --json
```
Without `--include-demo` only trusted cases are searched, so right now the answer is "no eligible cases". Exit codes: 0 ok (also for no results), 2 configuration/missing package, 3 invalid query, 4 embedding model problem, 5 database problem, 6 dimension mismatch (embed_cases).

## 8. Tests and evaluation
```bash
python -m unittest discover -s tests -v                   # 84 tests; no database or model needed
python -m retrieval.evaluate --validate-only              # checks the dataset against the seed case list; offline
python -m retrieval.evaluate --include-demo               # REAL evaluation: needs steps 3–6 done; writes evaluation/reports/
```
Tests that use `tests/fakes.py` are **mocks**; they check logic, not embedding quality. If the evaluation cannot reach the model or database it writes a report marked **NOT RUN** and shows no numbers. Fill `evaluation/M08_evaluation_report_TEMPLATE.md` by hand only from a real run.

## 9. Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| `Missing environment variables: OPSENSE_APP_PASSWORD, OPSENSE_ORG_ID` | Add them to `.env` (step 2). |
| `Could not connect to PostgreSQL…` | `docker compose ps`; check `DB_HOST/DB_PORT`; password must match the `opsense_app` role. |
| `a required Python package is missing` | `pip install -r requirements.txt` inside the virtual environment. |
| `Could not load embedding model…` | First run needs internet to download it; check the model name; behind a proxy, pre-download the model. |
| `DimensionMismatchError … vector(384) but OPSENSE_EMBEDDING_DIM is …` | Model and column disagree. Fix the setting, or get the schema change approved (strategy §6). Nothing was written. |
| Search says `NO_RESULTS` | No vectors yet (run step 6), or no eligible cases (add `--include-demo`), or a `--subsystem-id` filter (all seed cases have NULL subsystem). |
| Cases visible in `psql` as postgres but not in Python | Row-level security: the app role only sees `OPSENSE_ORG_ID`'s rows; check the UUID. |
