# M08 — Embedding & pgvector Completion Report

**Sprint:** 1 · **Status:** IMPLEMENTED / MOCK TESTED / REAL INFERENCE PENDING

## Delivered in the package

- Provisional model: `intfloat/multilingual-e5-small` via `sentence-transformers`.
- Configured vector dimension: **384**.
- Query/document prefixes: `query: ` / `passage: `.
- L2 normalisation, dimension validation, embedding text builder, ingestion and retrieval implementation.
- pgvector cosine-distance SQL, metadata filters, eligibility rules, Top-3 ranking and model/text provenance.
- Explicit mock/real separation; mock vectors are not permitted for real Postgres repository ingestion/search.

## Verification performed in this audit

- Embedding config, text builder, mock backend, lifecycle, repository SQL contracts, search and evaluation unit tests passed.
- Static checks passed.
- Offline mock pipeline prepared/embedded 50 cases with **256-dimensional test-only vectors**. These are not the configured 384-dimensional real model vectors.

## Not verified in this audit

- Real model load/inference and model-reported dimension.
- Real 384-dimensional vector ingestion.
- Fresh live PostgreSQL/pgvector execution in this audit session.
- Top-3 ranking quality with real embeddings or Hinglish retrieval quality.
- Recall@3 / MRR benchmark.

Environment check: `sentence_transformers`, `psycopg`, `pgvector`, `psql` and PostgreSQL connection variables were unavailable in the current session. The package contains archived evidence of an earlier PostgreSQL 16.15 + pgvector 0.8.0 run with MOCK vectors only; it is not evidence of real inference.

## Pending confirmation

- Aastha: confirm model, prefixes, text construction and retrieval design.
- Group 2: confirm migration 008 and database contract.
- Execute the real inference and live DB steps documented in `README.md` when dependencies and a disposable database are available.

No personal sign-off from Aastha is claimed.
