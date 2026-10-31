# Embedding strategy (M08, integrated)

**Status: PROVISIONAL.** No real embedding model was loaded or executed in any build of this package (**real inference: NOT EXECUTED**). The similarity SQL and the repository SQL *were* executed against a live PostgreSQL 16.15 + pgvector 0.8.0 scratch database in the Group 3 Final build, using clearly labelled TEST-ONLY vectors inside a rolled-back transaction (`poc/execution_evidence/`). Similarity numbers from those runs mean nothing about model quality.

## 1. Model and configuration (unchanged from M08; not silently replaced)
| Item | Value | Status |
|---|---|---|
| Model | `intfloat/multilingual-e5-small` via `sentence-transformers` | provisional, not approved by the team, Hinglish quality **unmeasured** |
| Dimension | 384 = `historical_case.embedding vector(384)` (migration 006) | consistent across SQL, `embedding_config.py`, `.env.example`, `embedding_config.yaml` (test-checked) |
| Prefixes | documents `passage: `, queries `query: ` (E5 requirement) | added by `EmbeddingService`, not by the text builder |
| Normalisation | L2, so cosine distance and dot product rank identically | tested |
| Similarity | `1 - (embedding <=> query)` (cosine similarity), top 3, ties by `case_reference` | no cut-off approved; none invented |
| Index | none (exact scan, ~50 vectors). HNSW `vector_cosine_ops` only with thousands of vectors; an approximate index plus WHERE filters can return fewer than K rows | documented in `poc/pgvector_setup.sql` |
**Prefix rule status:** the E5 family convention (`query: ` for search queries, `passage: ` for stored documents) is implemented identically on both sides by `EmbeddingService`. It comes from the model-card convention and is **NOT re-verified from the source** in the Group 3 Final environment (the Hugging Face page was not reachable). Re-check on the first real run. The input limit (~512 tokens) is likewise unverified.

**Mock vs real mode:** the 256-dimensional hashing backend (`tests/fakes.py`) is mock-only (`is_mock = True`). `EmbeddingService.require_real()` and the repository flag `ALLOWS_MOCK_VECTORS` make ingestion/search into `PostgresRepository` raise `MockEmbeddingError`; `build_backend` cannot select a mock provider from the environment; and migration 008 adds `chk_embedding_not_mock` (model name must not match mock/fake/hashing/test-only) and `chk_embedding_has_provenance` (stored dimension must equal `vector_dims(embedding)`). Real mode checks every returned vector length against `OPSENSE_EMBEDDING_DIM`, the model's own reported dimension, the DB column `vector(N)`, and rejects a configured dimension that contradicts a known model (384 for multilingual-e5-small).

## 2. Text construction: `symptom-side-v2`, deterministic
```
Symptom (technician): <symptom_text, verbatim, whitespace collapsed>
Symptom (summary): <symptom_structured>
Equipment: <class name from equipment_class>            (v2)
Subsystem: <subsystem_source_label>                      (v2)
Component: <component_name>
Category: <symptom_category>
Operating status: <operating_status without "(illustrative...)" tag>
Frequency: <symptom_frequency without tag>
```
Fixed order and labels; blank/NULL lines omitted; at least one symptom field is required or the case is skipped (never crashes). `text_sha256()` fingerprints the exact text.

## 3. Embedding content vs metadata filters
| Information | Embedded? | Filterable as metadata? |
|---|---|---|
| Symptom narrative + summary, operating status, frequency, category | yes | no |
| Equipment class, subsystem, component | yes (context) | class, subsystem id, model: **yes** (`WHERE`) |
| Failure category (`taxonomy_code`, `failure_mode_id`) | no | **yes** (EXISTS on `case_failure_mapping`) |
| `case_status`, `retrieval_eligibility` | no | **always applied** (eligibility rule) |
| `is_synthetic` | no | **yes** |
| Review status (`verification.overall_decision`) | no | extracted into metadata; enforced through the eligibility rule, not a separate SQL filter |
| Asset model | no | `equipment_model_id` filter |

## 4. Deviation from the brief, and why
The brief lists suspected/confirmed causes, diagnostic observations, inspection steps, corrective actions and outcome as embedding candidates. They are **excluded** on purpose:
1. A technician's new query describes what they see. A cause or repair text can never appear in it, so embedding it adds text the query cannot match and moves similarity toward "same cause" rather than "similar symptoms".
2. Similarity must not look like diagnosis; cause text inside the vector would make a hit read like a diagnosis.
3. Suspected causes of synthetic cases are unconfirmed by definition.
This is a **design argument, not a measured result.** The 17-query evaluation (`retrieval/evaluation/`) exists to test it, and a richer "case-side" text variant can be compared once a real model runs. Outcome is not embedded because no case has one.

## 5. Safety and eligibility
Trusted results = `VERIFIED` + `eligible`. Demo mode (`--include-demo`) must be requested; it shows symptom side only and **withholds causes, actions and steps**. Every response carries "similar historical cases, not a diagnosis".

## 6. Re-embedding, model changes and duplicates
`historical_case.case_id` is the primary key; ingestion is `INSERT ... ON CONFLICT (case_id) DO UPDATE`, so re-running never adds rows and original case IDs/references are preserved (tested offline; also run live on mock-labelled rows in a rolled-back transaction). **Migration 008** stores per row `embedding_model`, `embedding_dimension`, `embedding_text_sha256`, `embedding_text_version`, `embedded_at`. Ingestion compares the stored triple (model, text hash, text version) with the current one and counts differing rows as `stale_replaced`; every run re-embeds the selected cases, so a model/text change is fully applied by simply re-running. Search filters `h.embedding_model = <current model>`, so vectors from different models are **never ranked together**; until re-embedding finishes, stale rows are simply not returned (fewer results, never wrong mixing). Changing the dimension additionally needs `ALTER TABLE historical_case ALTER COLUMN embedding TYPE vector(N)` (team approval); the code never alters the column and aborts on mismatch. Migration 008 is **provisional** pending the schema owner (Group 2).

## 7. Verification status
| Claim | Class |
|---|---|
| Text deterministic, empty-safe, no cause leakage, equipment labels match the seed | Implemented and tested (offline) |
| Metadata extraction never crashes on missing fields | Implemented and tested |
| Dimension checks, L2 normalisation, wrong-dimension refusal, mock/real separation, model-change safety | Implemented and tested (mock backend, offline) |
| Filtering, ordering, top-3, eligibility, idempotent re-embedding | Implemented and tested against an **in-memory mock**, not SQL |
| Migrations 001-008, seeds, curation SQL, RLS scripts, pgvector cosine SQL | **Executed live** (PostgreSQL 16.15, pgvector 0.8.0 built from source) |
| `PostgresRepository` Python driver path (psycopg) | Implemented but **not executed** (psycopg not installable offline) |
| Real model inference, Hinglish quality, Recall@3 / MRR on real retrieval | **NOT EXECUTED**, no numbers exist |
| Model choice | Provisional |
