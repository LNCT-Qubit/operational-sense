# Group 3 Sprint 1 — Final Audit Report (V3 working audit)

**Source audited:** `Group_3_AI_Retrieval_Final_v2.zip`  
**Audit date:** 2026-10-30  
**Scope:** Group 3 Sprint 1 only (M07 schema, M08 embeddings/pgvector, M09 synthetic cases, integration and evaluation readiness).

## Executive result

**Status: PARTIAL — internally reviewable, not Sprint 1 accepted.** The source package contains a working canonical JSON schema and validator, an embedding/retrieval implementation with mock/real separation, a 50-case synthetic dataset, SQL migrations and retrieval code. In this audit environment, the offline tests and static checks were freshly rerun successfully. Real embedding inference and live PostgreSQL/pgvector could not be freshly executed: the Python environment has no `sentence-transformers`, `psycopg` or `pgvector` packages, no `psql`/PostgreSQL client, and no database connection variables. Existing `poc/execution_evidence/` records describe earlier scratch-database runs, but are historical package evidence, not a fresh run in this audit.

No synthetic case was promoted from DRAFT. No domain approval, owner sign-off, industrial validation or benchmark result is claimed.

## Freshly executed checks

| Check | Result |
|---|---|
| `python3 -m pytest -q` | **270 passed, 3 skipped**, 35 subtests passed; 0 failed |
| `python3 -W ignore -m unittest discover -s tests -t .` | **273 tests OK, 3 skipped** |
| `bash tools/run_static_checks.sh` | **ALL STATIC CHECKS PASSED** |
| Dataset/mapping validator | Report current; 0 INVALID mappings (known unresolved/ambiguous records remain documented) |
| Mock offline pipeline | 50/50 prepared and embedded; 256-dimensional TEST-ONLY vectors; repeat ingestion created no duplicates |
| Evaluation data validation | 17 queries structurally valid; validation only, not a benchmark |

Three skipped tests require `OPSENSE_LIVE_PG=1` and live PostgreSQL. The current session did not have that infrastructure.

## Dataset facts re-derived from JSON

- 50 unique synthetic cases: 17 pumps, 17 motors, 16 compressors.
- 350 diagnostic steps (7 per case).
- 19 illustrative model designations; all must be treated as illustrative, not actual installed assets or OEM validation.
- 11 cases have `component_name = null`.
- 10 cases have unresolved/null curated subsystem mapping.
- 11 cases have no taxonomy code; no code was fabricated.
- 15 cases carry `needs_depth_expansion`.
- All 50 remain `DRAFT`, `is_synthetic=true`, `retrieval_eligibility=demo_only_until_expert_review`, verification `PENDING`.

These open fields are intentionally not auto-filled: the package does not provide authoritative source evidence to determine the missing components, subsystem decisions or taxonomy codes. They require Group 1/domain review.

## M07 — schema

**Implemented:** `case_schema/canonical_schema.json` v1.0.0, validation rules, semantic validator, field definitions, sample valid/invalid records and tests. Static suite covers schema validation and dataset compatibility. Schema describes null/unresolved values explicitly and preserves source labels.

**Not independently signed off:** The package contains a canonical schema implementation, but no personal confirmation from Udit is present. Confirm that v1.0.0 is the team-approved canonical contract and that all downstream groups accept it.

## M08 — embeddings and retrieval

**Implemented:** provisional `intfloat/multilingual-e5-small`, configured dimension 384, E5 query/document prefixes, L2 normalisation, text builder, model/dimension checks, ingestion, metadata filters, eligibility rules, cosine ranking and Top-3 retrieval code. Migration 006 defines `vector(384)`; migration 008 tracks model/dimension/text provenance and rejects mock/fake vector provenance. Mock backend is explicitly test-only and real repository operations reject mock vectors.

**Fresh real inference: NOT EXECUTED.** `sentence-transformers` is not installed in this environment; no model cache/credentials or network-enabled dependency install is available. Therefore model-reported dimensions, real embeddings, real-vector Top-3 relevance and Hinglish retrieval quality remain unverified here.

**Live DB status:** Existing package evidence records PostgreSQL 16.15 + pgvector 0.8.0 execution with MOCK vectors. That is useful historical evidence, but it is not real-model retrieval. The current audit did not rerun PostgreSQL/pgvector because no client/server/connection was available.

## M09 — synthetic case design and retrieval readiness

**Implemented:** expected 50-case class distribution and 350-step dataset are present; validation, mapping reports, SQL export/round-trip checks and retrieval text preparation are included. The current dataset is synthetic and DRAFT only.

**Partial:** 11 component names, 10 subsystem mappings and 11 taxonomy codes remain unresolved; 15 cases are flagged for depth expansion. No safe source-backed basis exists in this package to invent these values. Group 1 review is required before approval.

## Integrated flow and evaluation

The package implements JSON validation, text construction, embedding interfaces, storage/retrieval code, metadata filtering and trusted/demo eligibility separation. The offline integration run is explicitly a mock demonstration. The evaluation file contains 17 queries and the metric functions are tested, but no valid relevance labels/baseline plus real-vector retrieval result was demonstrated. **Recall@3 and MRR have not been measured in this audit.** The >35% relative improvement target remains a target only.

## Security / RLS

Migration 007 contains SELECT `USING`, INSERT `WITH CHECK`, and UPDATE `USING` + `WITH CHECK` policies; it creates/reasserts `opsense_app` as `NOSUPERUSER NOBYPASSRLS`. Static SQL/security tests passed. The archived evidence folder contains prior live scratch-PostgreSQL RLS test output. Fresh cross-tenant execution was not possible in this audit environment. Do not treat static checks or archived evidence as a current deployment security certification.

## Acceptance matrix

| Deliverable | Implemented | Tested in this audit | Pending approval / verification |
|---|---|---|---|
| M07 schema | Yes | Offline schema/semantic tests | Udit + downstream schema acceptance |
| M08 embeddings & pgvector | Code/config yes | Mock/unit/static only | Real model inference; fresh live pgvector; Aastha/Group 2 confirmation |
| M09 synthetic dataset | Yes, 50 cases | Dataset/mapping/static checks | Group 1 domain review of open mappings/components/taxonomy/depth |
| Integrated Top-3 retrieval | Code yes | Mock Top-3 only | Top-3 with real embeddings and live target DB |
| Evaluation readiness | 17 queries + metrics code | Query validation + metric unit tests | Ground-truth relevance labels, baseline, real benchmark |
| Security & regression | RLS code + tests | Static regression suite | Fresh live RLS tests / Group 4 QA |

## Exact current blockers

1. Install dependencies from `requirements.txt` in a network-enabled Python environment and download/load `intfloat/multilingual-e5-small`.
2. Provide a disposable PostgreSQL 15+ database with pgvector and credentials via environment variables; rerun migrations, seed, RLS and repository integration checks.
3. Execute real embedding ingestion and real-vector search; save logs and model provenance.
4. Obtain approved relevance labels for the 17 evaluation queries and run a keyword baseline before reporting Recall@3/MRR.
5. Obtain Group 1 domain decisions for unresolved synthetic case fields; obtain Udit/Aastha/Group 2/Group 4 confirmations.

## Reproducibility commands

Run from `Group_3_AI_Retrieval/`:

```bash
python3 -m pytest -q
python3 -W ignore -m unittest discover -s tests -t .
bash tools/run_static_checks.sh
python3 -m tools.validate_mappings --check
python3 -m retrieval.evaluate --validate-only
python3 -m integration.run_offline_pipeline
```

Live model/database commands and environment setup remain documented in `README.md` and `database/README.md`. Never place credentials in the package.
