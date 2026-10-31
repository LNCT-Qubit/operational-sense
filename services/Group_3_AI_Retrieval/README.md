# Group 3: AI & Retrieval (Operational Sense, Sprint 1)

Preserving technicians' tacit troubleshooting knowledge: a structured case schema (M07), an embedding and pgvector retrieval layer (M08) and 50 synthetic cases (M09), integrated into one package.

> **Status: PARTIAL (see `documentation/ACCEPTANCE_ASSESSMENT.md`).** 273 tests collected: 270 pass and 3 skip by default (the 3 skipped are the live-PostgreSQL failure tests, which need `OPSENSE_LIVE_PG=1`; with it all 273 pass); 0 fail. The SQL (migrations 001-008, seeds, 50-case load, curation, RLS scripts, pgvector cosine search through the real repository SQL) **was executed on a live scratch PostgreSQL 16.15 + pgvector 0.8.0**, with MOCK vectors only. **Not executed:** real `multilingual-e5-small` inference, the Docker scripts, the psycopg driver path, any retrieval benchmark. All 50 cases are **synthetic, demo-only, DRAFT, not expert-reviewed**. **Similarity is not diagnosis.**

```
Technician observation -> structured case (JSON v1.0.0) -> validation -> embedding text + metadata
  -> vector (multilingual-e5-small, 384-d, provisional) -> pgvector store -> similarity (top 3) -> original case reference
```
Diagrams: `diagrams/architecture.png`, `diagrams/data_flow.png`.

## Layout
| Path | Content | Owner |
|---|---|---|
| `case_schema/` | canonical schema, validator, rules, field definitions, version notes | M07 |
| `sample_cases/` | 5 valid / 21 invalid sample cases | M07 |
| `synthetic_dataset/` | `synthetic_cases.json` (50), quality report, unresolved register | M09 |
| `m09/` | M09 audit helpers (26 checks) | M09 |
| `embedding_strategy/` | `EMBEDDING_STRATEGY.md`, `embedding_config.yaml` | M08 |
| `retrieval/` | embedder, text builder, ingest, search, evaluation set | M08 |
| `integration/` | JSON -> DB mapping, pipeline, offline runner | shared |
| `database/` | Group 2 baseline: migrations 001-007, seeds, loaders, RLS | Group 2 (+M09 fixes) |
| `poc/` | pgvector setup + similarity SQL, live runner, execution evidence | M08 |
| `tests/`, `tools/` | 273 tests; generators (JSON, samples, reports, diagrams), curation overlay, mapping validator, live-check harness | all |
| `documentation/` | audit, data model, integration, tests, limitations, register, changelog, acceptance; `origin/` = untouched original reports | all |

Document index: `documentation/COMMON_DATA_MODEL.md`, `CASE_SCHEMA_DOCUMENTATION.md`, `embedding_strategy/EMBEDDING_STRATEGY.md`, `synthetic_dataset/dataset_quality_report.md` (synthetic dataset report), `INTEGRATION_REPORT.md`, `TEST_EXECUTION_REPORT.md`, `KNOWN_LIMITATIONS.md`, `UNRESOLVED_ITEMS.md`, `CHANGELOG.md`, `AUDIT_REPORT.md`, `ACCEPTANCE_ASSESSMENT.md`.

## A. Offline (no database, no model; Python 3.10+; `jsonschema`/`pytest` optional)
```bash
bash tools/run_static_checks.sh                                    # compile, shell syntax, JSON, schema, dataset, mapping, curation, eval-dataset, mock pipeline, SQL static, full tests
python3 -W ignore -m unittest discover -s tests -t .                # expect: Ran 273 tests ... OK (skipped=3)
python3 -m pytest -q                                               # expect: 270 passed, 3 skipped
```
| Task | Command (all exist in this repo) |
|---|---|
| A. JSON Schema + semantic validation | `python3 -W ignore -m unittest tests.test_case_schema tests.test_synthetic_dataset` |
| B. Synthetic dataset + mapping validation | `python3 -m tools.validate_mappings --check` (0 INVALID) and `python3 -m tools.build_dataset_reports` |
| C. Embedding-text generation | `python3 -W ignore -m unittest tests.test_text_builder tests.test_embedding_strategy` |
| D. Mock integration pipeline | `python3 -m integration.run_offline_pipeline` (256-d TEST-ONLY vectors) |
| Evaluation dataset validation (not a benchmark) | `python3 -m retrieval.evaluate --validate-only` |
| Rebuild generated files | `python3 -m tools.export_synthetic_cases && python3 -m tools.build_curation_sql && python3 -m tools.validate_mappings && python3 -m tools.build_samples && python3 -m tools.build_dataset_reports && python3 -m tools.build_field_docs` |
| M09 audit of the **original** SQL imports | `python3 -m m09.run_audit database /tmp/m09_out` (expect 1 FAIL = Q05, an open expert item) |

## B. Live PostgreSQL + pgvector WITHOUT Docker (executed in the Group 3 Final build)
Needs PostgreSQL 15+ with the `vector` extension (the build used 16.15 + pgvector 0.8.0). Use a disposable database.
```bash
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=...  PGDATABASE=opsense   # database must exist
export OPSENSE_APP_PASSWORD='<12+ chars>'                          # never committed; never in a file in the repo
bash database/scripts/local_pg.sh all                               # F migrate (001-008) -> app password -> G seed (50 cases, curation, guards) -> I verify (m09_030, test_schema, verify_rls); every row PASS, no FAIL
pip install -r requirements.txt                                     # psycopg, pgvector, sentence-transformers (needs network)
python3 -m tools.live_pg_check                                      # H real repository SQL + pgvector with MOCK vectors, rolled back (needs only psql)
```
## C. Real embedding inference and Docker path (NOT executed in the build)
```bash
pip install -r requirements.txt && cp .env.example .env            # set POSTGRES_PASSWORD and OPSENSE_APP_PASSWORD (>=12 chars)
bash poc/run_poc.sh     # compose up -> migrate -> set_app_password -> seed -> load 50 cases -> checks -> RLS -> embed (downloads the model) -> search
python3 -m retrieval.embed_cases --include-demo        # E: real embeddings, 384-d, stored with model/hash provenance
python3 -m retrieval.search_cases "bearing garam hai aur ghurr-ghurr awaaz" --include-demo
python3 -m retrieval.evaluate --include-demo           # real benchmark; writes retrieval/evaluation/reports/ (do not cite before a baseline exists)
```
Credentials: `.env` is git-ignored; real passwords never go into SQL, scripts or docs (see `database/README.md`, "Credentials"). Embedding settings live in `.env` (`OPSENSE_EMBEDDING_*`); the dimension must equal the column `vector(384)`; changing the model needs approval and re-embedding (stale rows are detected and never mixed into a ranking).

## Demo vs trusted retrieval
| | Trusted (default) | Demo (`--include-demo`) |
|---|---|---|
| Eligible rows | `VERIFIED` **and** `retrieval_eligibility='eligible'` | `DRAFT`/`SUBMITTED` **and** `demo_only_until_expert_review` |
| Synthetic / draft cases | never returned | returned, labelled `DEMO_UNVERIFIED`, causes/actions/steps withheld |
| Today's data | 0 results (no expert-approved case exists; states were **not** changed to get results) | 3 results per query |
| Filtering | in SQL **and** re-checked in Python before anything is shown | same |
Every response says: similar historical cases, **not a diagnosis**; original `case_reference` is always kept.

## Safety rules built in
Synthetic cases cannot be retrieval-eligible or VERIFIED without a named reviewer and date; demo mode needs an explicit flag and hides causes/actions/steps; unknown values stay `null` and are reported; no OEM limits, torques or ISO 14224 claims are made.

## V3 audit note (2026-10-30)
The V2 source was re-audited and the offline checks were freshly rerun while preparing V3. Results and limitations are recorded in `GROUP_3_FINAL_AUDIT_REPORT.md`, with owner-specific reports in the package root. Fresh audit results: pytest 270 passed / 3 skipped; unittest 273 OK / 3 skipped; static checks passed. Real model inference and fresh live PostgreSQL/pgvector execution were not possible in the audit environment. The dataset remains synthetic, DRAFT and demo-only; open mapping fields remain pending domain review. See `PENDING_DEPENDENCIES.md`.
