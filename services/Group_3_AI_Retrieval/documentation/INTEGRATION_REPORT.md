# Integration report (M07 + M08 + M09, Group 3 Final)

## Flow
1. `synthetic_dataset/synthetic_cases.json`, exported from the SQL imports by `tools/export_synthetic_cases.py`, **plus the Group 3 curation overlay** (`tools/curation.py`; `--raw` gives the plain export). The same overlay generates `database/sql/m09/m09_040_apply_curation.sql`, so JSON and database cannot drift (tested; verified live: 0 mismatches over 350 steps / 50 cases).
2. `case_schema` validation (schema + semantic + dataset). 3. `integration/mapping.py` JSON -> DB rows (fail-closed). 4. `retrieval/text_builder.py` text + metadata. 5. `retrieval/embedder.py` (injected backend). 6. `retrieval/ingest.py` -> `historical_case` with per-row provenance (migration 008). 7. `retrieval/search.py` -> top 3 with original `case_reference`.
Identities are copied, never rewritten (tests + offline runner: 0 drift).

## Mock / demo behaviour (offline, `python -m integration.run_offline_pipeline`)
256-d TEST-ONLY hashing vectors + in-memory store. 50 prepared, 0 rejected, trusted search 0 results, demo ingestion 50 vectors, 0 duplicates on re-run. Similarity values are meaningless for the real model. Mock vectors are refused by `PostgresRepository` and by DB constraints (below).

## Implemented and executed live (PostgreSQL 16.15 + pgvector 0.8.0 built from source; see TEST_EXECUTION_REPORT.md)
Migrations, seeds, 50-case load (50 cases / 350 steps / 40 subsystem ids / DRAFT 50 / trusted-eligible 0), curation SQL (idempotent), retrieval guards, RLS scripts, application-role login, and the real repository SQL: ingestion, no duplicates, provenance, stale-model detection, trusted vs demo, class/subsystem/taxonomy filters, RLS cross-tenant isolation. **All embedding vectors in those runs were MOCK (384-d hashing), inside rolled-back transactions.**

## Implemented but NOT executed
Real embeddings with multilingual-e5-small; psycopg driver path; the Docker-based scripts (`poc/run_poc.sh`, `migrate.sh`, `seed.sh`, `load_all_m09.sh`, `set_app_password.sh`) end to end; Recall@3 / MRR on real retrieval.

## Findings from the integration
- Documentation/DB mismatch found and fixed: no per-row model metadata existed, so a model change could silently mix vectors (migration 008, model-filtered search).
- 10 cases still cannot match a subsystem filter; they remain findable without it.
- Isolation-dependent Tier 2 steps (13) carried an electrical-measurement warning; corrected, tier assignment left for the safety officer.
- Reproduce: see README sections A-C.
