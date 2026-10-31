# M09 Retrieval Readiness Report

**Bottom line:** the cases are **structurally ready for a labelled demo retrieval** and **correctly kept out of trusted retrieval by the data**.
M08's code, its evaluation dataset, a database, an embedding model and vector search were **not available**, so no retrieval was run
and **no Recall@3 or MRR exists**. Retrieval quality: **NOT VERIFIED**.

## 1. Retrieval-related requirements (from the task text and the project files)
1. Stable case identifiers -> `case_reference` is unique per case (50/50); used as the id in every helper.
2. Metadata filters: equipment class, subsystem, status/eligibility, model.
3. Unreviewed cases excluded from trusted retrieval; demo only by explicit opt-in.
4. Similarity shown as historical similarity, never as diagnosis; no autonomous hazardous actions; supervisor review kept.
5. Provenance and case id preserved in results; empty results handled safely.

## 2. Metadata and eligibility filters
| Requirement | Evidence | Status |
|---|---|---|
| Class filter | `idx_case_class_sub (equipment_class_id, subsystem_id, case_status)`; `equipment_class_id` is NOT NULL in all 50 | Supported by schema |
| Subsystem filter | Was **broken**: `subsystem_id` NULL for all 50. `m09_010` resolves 39; 11 stay NULL and can never strict-match | Fix written, **not run on PostgreSQL**; 11 open |
| Status / eligibility | Import: all `DRAFT` + `demo_only_until_expert_review` -> 0 trusted-eligible cases | Pass (files) |
| DB guard against marking unreviewed cases eligible | None existed. Added `m09_020_retrieval_guards.sql`: CHECK `eligible` requires `VERIFIED`; `v_retrieval_trusted`, `v_retrieval_demo` with `security_invoker = true` (keeps tenant RLS) | Optional; **not run on PostgreSQL** |
| Model / provenance in results | `equipment_model_id`, `source_reliability`, `case_origin`, `evidence_type` exist; included in the retrieval text and views | Pass (design) |
| Missing metadata | `is_retrievable` fails closed (missing/unknown status -> not retrievable); NULL subsystem never matches a subsystem filter | Tested offline |

## 3. Retrieval document (what would be embedded)
`m09/retrieval_prep.py::build_case_document` builds one deterministic text per case: synthetic banner, case id, class, model (marked illustrative),
subsystem label, component, symptom + structured summary, failure mode (+ taxonomy code), suspected cause (marked unconfirmed), alternatives,
Tier 1-2 checks, an outcome line stating that corrective work needs supervisor approval and LOTO, and provenance. Missing values print as
"not recorded (flag for expert review)" instead of being invented. Tier-3 repair text is intentionally **not** embedded. Tests build all 50 documents.
This is a *proposal for M08's input*; it is not wired into M08, and **no embeddings were generated**. `historical_case` is empty by design in Sprint 1; `vector(384)` is still the placeholder dimension.

## 4. Evaluation dataset and metric validation
- The earlier M09 report cites `evaluation/m08_eval_dataset.json` (17 queries). **That file is not in any ZIP I received**, so query ids, labels,
  class coverage, duplicates and baseline/improved parity are **NOT VERIFIED**. The report itself says the labels were written from the same synthetic cases and are not expert ground truth.
- `m09/metrics.py` implements Recall@k (fraction of labelled relevant cases found in the top k, averaged over labelled queries), reciprocal rank / MRR
  (first relevant hit), relative improvement (undefined when baseline is 0), and `validate_eval_dataset` (duplicate ids/texts, trivial queries, unknown cases, class mismatch).
  The dataset schema it expects is **assumed**; adjust it once the real file is available.
- Unit tests check the arithmetic on hand-made toy numbers (clearly not results).
- A keyword baseline: **not present** in the supplied files, and not invented. If the project requires >35% relative improvement in Recall@3 and MRR over a
  keyword baseline, that is a **target; nothing has been measured**. The full-text index `idx_case_fts` exists (migration 006) and could serve as the baseline.

## 5. Integration findings (M08 / M07)
| Dependency | Available? | Consequence |
|---|---|---|
| M08 retrieval source | **No** | Cannot check its joins, filters, empty-result handling or provenance. BLOCKED |
| `evaluation/m08_eval_dataset.json` | **No** | Evaluation validation NOT VERIFIED |
| M07 schema source | Only the resulting `migrations/001-007` and a `pg_dump` schema snapshot (PG 16.15, schema only) | Used as the schema reference |
| PostgreSQL / pgvector / embedding model | **No** (not installed, network off) | No live checks, no embeddings, no vector query |
What M08 must enforce (checklist for the reviewer): apply status+eligibility before ranking; use `subsystem_id` (not the text label) for strict filters; never treat NULL subsystem as a strict match;
label demo results and require explicit opt-in; keep `case_reference`, model and reliability in results; return a clear message on empty results; connect as `opsense_app`, not a superuser (superusers bypass RLS).

## 6. Actual retrieval results
**None.** Nothing was executed against retrieval. Any Top-3 list, Recall@3 or MRR you see elsewhere is not from this package.
