# M09 Senior-Review Evidence — Synthetic Cases & Retrieval Readiness

## Evidence checked
- Source case import: `Operational_Sense_Step4_5_Import_Operational_Cases.sql`
- Diagnostic steps import: `Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql`
- Evaluation query dataset metadata: `evaluation/m08_eval_dataset.json`

## Results from static source inspection
- 50 synthetic case tuples: 17 pump, 17 motor, 16 compressor.
- 350 diagnostic step tuples: 7 per case (3 Tier 1, 3 Tier 2, 1 Tier 3).
- All Tier 3 steps set supervisor approval to TRUE in the source SQL.
- 11 cases have a blank component name.
- 15 cases have `needs_depth_expansion = TRUE`.
- Subsystem source labels are retained, but the import deliberately leaves the subsystem FK unresolved/null.
- Cases are DRAFT and demo-only until expert review.
- Acceptance criteria and measurements include explicit placeholders; no actual field measurements or expert approval are established by these files.

## Readiness decision
**Demo-only, with remediation required; not production/trusted retrieval-ready.** The most important blockers are subsystem FK mapping, case-specific content gaps, and lack of domain-expert review. M08 ranking metrics must be measured from real retrieval output and must not be inferred from the 17-query dataset alone.

## What is not claimed
- No live PostgreSQL row counts or FK checks.
- No actual embeddings or vector retrieval run.
- No measured Recall@3 or MRR.
- No expert validation or formal ISO compliance claim.
