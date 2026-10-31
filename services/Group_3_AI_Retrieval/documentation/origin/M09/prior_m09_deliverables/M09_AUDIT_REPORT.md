# Operational Sense — M09 Synthetic Case Quality & Retrieval Readiness Audit

**Prepared from:** `Operational_Sense_Step4_5_Import_Operational_Cases.sql`, `Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql`, and `evaluation/m08_eval_dataset.json` in the supplied M08 package.  
**Audit type:** Static/source-file audit. This is not a live PostgreSQL audit, field validation, or domain-expert approval.  
**Purpose:** M09 handoff evidence for synthetic case quality and retrieval readiness.

## Executive result

The source SQL contains **50 synthetic cases** and **350 diagnostic steps**. Cases cover pumps, motors and compressors. The scripts explicitly keep the cases **DRAFT** and `demo_only_until_expert_review`; they must not be presented as approved operational knowledge.

| Check | Source-file result | Meaning |
|---|---:|---|
| Cases in import SQL | 50 | Structural count verified from SQL tuples |
| Pumps | 17 | Synthetic cases |
| Motors | 17 | Synthetic cases |
| Compressors | 16 | Synthetic cases |
| Diagnostic steps | 350 | Structural count verified |
| Cases with 7 steps | 50/50 | All cases have 7 steps in the source file |
| Tier 1 / Tier 2 / Tier 3 steps | 150 / 150 / 50 | 3 + 3 + 1 per case |
| Tier 3 steps missing supervisor approval flag | 0 | Static check of the SQL tuples |
| Cases with blank component name | 11 | Needs authoring follow-up |
| Cases marked `needs_depth_expansion = TRUE` | 15 | Explicitly flagged for further detail |
| Cases whose acceptance criterion says OEM/site source is not stated in workbook | 50/50 | Not a validated numeric acceptance limit |
| Steps using generic `Per OEM / site procedure` measurement-point wording | 141 | Needs asset/site-specific detail before production use |

## Findings and required actions

### 1. Subsystem mapping is not complete

The case import maps the source subsystem label into `subsystem_source_label` but intentionally does not populate the `subsystem_id` foreign key. Therefore, the labels exist, but the approved taxonomy relation is **unresolved** in the import script. Do not report these as fully mapped. Complete the mapping against the approved taxonomy and verify class/subsystem compatibility before enabling filters that depend on `subsystem_id`.

### 2. Case detail needs targeted improvement

- **11 cases** have no `component_name` in the case import rows.
- **15 cases** are explicitly marked `needs_depth_expansion = TRUE`.
- All cases use illustrative operating context and have no recorded field readings in the source text.
- The acceptance criteria refer to OEM/site specifications but the script says the source was not stated in the workbook. These are placeholders, not verified limits.
- Source reliability is labelled `D` and evidence type is engineering interpretation. This is consistent with synthetic scenarios, but it is not field evidence.

Actions: fill missing component names when supported; enrich weak cases with discriminating observations, measurement point/instrument/units, negative-result interpretation and escalation criteria; do not invent site readings, OEM limits or part numbers.

### 3. Diagnostic-step structure passes basic static checks, but content still needs review

The source file has seven steps per case: three Tier 1, three Tier 2, and one Tier 3. Every Tier 3 row is flagged as requiring supervisor approval in the SQL source. This confirms structure only—not that every measurement is appropriate, every safety warning is sufficient, or every interpretation is technically correct. 141 measurement entries still use generic `Per OEM / site procedure` wording.

### 4. Retrieval readiness

- **Trusted/production retrieval:** Not ready. Source import values are `case_status = DRAFT` and `retrieval_eligibility = demo_only_until_expert_review`.
- **Demo retrieval:** Can be used only through the explicitly enabled demo path (for example, M08's `--include-demo` behavior), with a clear synthetic/demo label.
- **Subsystem filtering:** Will not work as intended until the `subsystem_id` foreign keys are mapped.
- **Embedding and ranking quality:** Not established by this audit. The evaluation dataset contains 17 queries whose expected IDs were authored by reading the same synthetic cases; its own metadata says it is not expert-validated ground truth. No Recall@3/MRR result is claimed here.
- **Similarity is not diagnosis:** Retrieval may surface related cases, but technicians/supervisors must verify the evidence and apply the safe diagnostic workflow.

## Recommended M09 completion order

1. Resolve the 50 subsystem labels to approved taxonomy IDs; retain an explicit unresolved state where no valid mapping exists.
2. Fill the 11 missing component names only where supported by the source, and review the 15 depth-expansion flags.
3. Review generic step wording, measurement points, units/baselines, alternative-cause discrimination and safety escalation.
4. Keep all cases DRAFT/demo-only until a qualified domain expert reviews them; record reviewer, date and decision rather than fabricating approval.
5. Run a live database audit after import; compare expected counts and actual `subsystem_id` population.
6. Run demo retrieval, save actual top-3 results, and evaluate against the pre-authored query set. Label Recall@3/MRR as measured only after the run; get expert review of expected IDs before treating them as ground truth.

## Deliverables in this folder

- `audit/M09_case_by_case_audit.csv` — one row per case with visible gaps and recommended action.
- `audit/M09_step_structure_audit.csv` — one row per case summarizing step counts/tier structure.
- `templates/M09_case_quality_checklist.md` — reusable quality checklist.
- `templates/M09_synthetic_case_template.md` — reusable authoring template.
- `evidence/M09_senior_review_evidence.md` — concise senior-review evidence and honest limitations.

## Verification limitations

This was generated from source SQL and evaluation files only. No live database connection, actual embedding model run, vector query, or expert review was performed. This report does not claim the rows have been loaded successfully into PostgreSQL.
