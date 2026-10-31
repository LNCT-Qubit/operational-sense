> Historical report from the initial M08 implementation pass. For current fixes and current test counts, see `M08_REPAIR_AND_VERIFICATION_REPORT.md`.

# M08 Final Implementation & Verification Report
Embedding Strategy & Retrieval Readiness — Operational Sense
Date of work: 2026-10-29 · Source of truth: the uploaded `Operational_Sense_Backend_Database.zip` (original GitHub repo untouched; nothing pushed).

## 1. Headline (read this first)
| Question | Answer |
|---|---|
| Embedding / retrieval code written and unit-tested? | **Yes** — 81 tests pass (7 original + 74 new), run locally. |
| Real embedding model run? | **NO.** No network, `sentence-transformers`/`torch` not installed. |
| Real PostgreSQL + pgvector retrieval verified? | **NO.** No PostgreSQL/Docker/`psycopg` available. The SQL was written and read for syntax, and its text/parameters are unit-tested with a recording fake, but **it has never been executed**. |
| Evaluation metrics (Recall@3, MRR)? | **NOT RUN.** Dataset and runner exist; no metrics exist and none are claimed. |
| Anything usable for trusted retrieval today? | **No.** All 50 seed cases are DRAFT/demo-only, so a trusted-only search correctly returns nothing until cases are reviewed. Demo mode (`--include-demo`) is provided, off by default, needs team approval. |

## 2. What was inspected
The whole ZIP: migrations 001–007, seed data, Step4 import SQL, scripts, `retrieval/` package, existing test, docs, `.gitignore`, `docker-compose.yml`, `requirements.txt`, git metadata. Details: `documentation/m08/M08_audit_report.md`. Original 7 tests: **7/7 pass** (`python3 -m unittest discover -s tests -v`).

## 3. What was implemented (new files unless noted)
| Area | File |
|---|---|
| Embedding settings (env vars) | `retrieval/embedding_config.py` |
| Error types | `retrieval/errors.py` |
| Eligibility rule (Python + SQL from one definition) | `retrieval/eligibility.py` |
| Embedding service: prefixes, validation, dimension check, L2 normalisation, lazy model loading | `retrieval/embedder.py` |
| All SQL (RLS-compatible, parameterised) | `retrieval/repository.py` |
| Ingestion pipeline (idempotent upsert, dry-run, withdraw, audit row) | `retrieval/ingest.py`, CLI `retrieval/embed_cases.py` |
| Top-3 similarity search, filters, traceable results, safety notice | `retrieval/search.py`, CLI `retrieval/search_cases.py` |
| Metrics and evaluation runner (NOT RUN-safe) | `retrieval/metrics.py`, `retrieval/evaluate.py` |
| Evaluation data/report | `evaluation/m08_eval_dataset.json` (17 queries), `evaluation/M08_evaluation_report_TEMPLATE.md`, `evaluation/reports/M08_evaluation_report.md` (status **NOT RUN**, produced by a real attempt) |
| Tests | `tests/fakes.py`, `test_embedder.py`, `test_embedding_config.py`, `test_eligibility.py`, `test_ingest.py`, `test_search.py`, `test_repository_sql.py`, `test_evaluation.py` |
| DB check script (not run) | `scripts/verify_m08_retrieval.sql` |
| Schema proposal (NOT applied, outside `migrations/`) | `proposals/M08_proposal_historical_case_embedding_metadata.sql` |
| Docs | `documentation/m08/M08_audit_report.md`, `embedding_strategy.md`, `M08_setup_guide.md`; this file |
| Config template | `.env.example` (placeholders only) |
| **Modified** | `requirements.txt` — appended `sentence-transformers>=2.7` |

Not modified: migrations, existing `retrieval/*.py`, existing test, README, seed/Step4 SQL.
Excluded from the package: `.env`, `.git`, `__MACOSX`, `.DS_Store`, caches.

## 4. Tests run and actual results
```
python3 -m unittest discover -s tests          → Ran 81 tests — OK
python3 -m retrieval.evaluate --validate-only  → Dataset OK: 17 queries; all expected IDs exist among the 50 seed cases
python3 -m retrieval.search_cases ""           → clean error, exit 3 (empty query)
python3 -m retrieval.search_cases "bearing hot"→ clean "package missing" message, exit 2 (psycopg absent)
python3 -m retrieval.evaluate --include-demo   → "NOT RUN: a required Python package is missing…", report written, no metrics
```
**Mocked/simulated:** `tests/fakes.py` (hashing "embedding" and in-memory repository) backs `test_search`, `test_ingest` and the runner test. They prove logic: ranking order, top-3 cap, filters, eligibility, idempotent re-ingestion, error paths (empty query, provider outage, wrong dimension, storage failure, empty results, missing metadata, draft cases). They are **not** evidence of real embedding quality. Test names `Mock…` mark them. `test_repository_sql` checks SQL text/parameters only.
**Real (no mocks):** eligibility rules, text builder, config parsing, validation, metrics, dataset validity against the real seed file.

## 5. Evaluation status
17 synthetic queries (near-exact, paraphrase, Hinglish variant, cross-equipment, hard negatives, class filter, 2 irrelevant) with expected case IDs written from the seed cases **before any model was run**. They are the author's engineering reading, not expert ground truth. **Recall@3 / MRR: NOT RUN — no numbers exist.** Dataset sha256 `ca331cf1b8556471e29ec5e448d2e4db864cf125c0665d693156e8a48a9c4333`.

## 6. Known limitations and unresolved decisions
1. Model choice (`intfloat/multilingual-e5-small`, 384-d) is **provisional**; Hinglish quality is unmeasured; model facts come from memory of model cards and need re-checking.
2. "Trusted" = `VERIFIED` + `eligible` is my strictest reading; the schema does not define it. Whether `case_verification = APPROVED` is also required is open.
3. Demo mode needs approval; in demo mode corrective actions/steps are withheld.
4. No similarity cut-off is set (none invented); irrelevant queries still return the nearest 3 unless a threshold is chosen from real results.
5. `subsystem_id` is NULL for all seed cases, so subsystem filtering returns nothing today.
6. Model/version is only recorded in `audit_log`; `historical_case` has no column for it (proposal provided).
7. Nobody owns promotion of reviewed cases into `historical_case`/`promoted_at` in the inspected files.
8. Data-load order of the root `Step4_*.sql` files is not documented; the setup guide's order is inferred and unexecuted. `scripts/load_steps_links_verification.sql` looks stale (refers to missing files). `005` mentions a non-existent migration 008.
9. Security notes: a `.env` was inside the ZIP (not packaged; password is a trivial local default); migration 007 holds a hard-coded dev password for `opsense_app` (change for shared environments).
10. M07 and M09 do not appear anywhere in the ZIP; no dependency on them is claimed.

## 7. Next actions
**You (M08), on a machine with Docker + internet:** follow `documentation/m08/M08_setup_guide.md` steps 1–8; paste the output of `python -m retrieval.embed_cases --include-demo`, `scripts/verify_m08_retrieval.sql`, and the generated `evaluation/reports/M08_evaluation_report.md` back for review. If any SQL fails, send me the error: the SQL has not been run.
**M05 (schema):** confirm "trusted" definition and demo mode; decide on the proposed metadata columns; confirm data-load order; own promotion into `historical_case`.
**Group 1 / reviewers:** review cases so some become `VERIFIED` + `eligible`; approve subsystem mapping so `subsystem_id` can be filled; ideally validate the evaluation's expected IDs.
**Team lead:** approve (or replace) the embedding model/dimension; set a similarity cut-off after the real evaluation.
