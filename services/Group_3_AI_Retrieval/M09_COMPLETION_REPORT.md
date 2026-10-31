# M09 — Synthetic Case Design & Retrieval Readiness Completion Report

**Sprint:** 1 · **Owner:** Ujjwal · **Status:** DATASET DELIVERED / QUALITY REVIEW PARTIAL

## Dataset verified from `synthetic_dataset/synthetic_cases.json`

- 50 unique synthetic cases.
- Pumps: 17; motors: 17; compressors: 16.
- 350 diagnostic steps (7 per case).
- 19 illustrative model designations.
- All 50 cases: `is_synthetic=true`, `case_status=DRAFT`, `retrieval_eligibility=demo_only_until_expert_review`, verification `PENDING`.

## Remaining data-quality items

| Issue | Current count | Handling |
|---|---:|---|
| Missing component name | 11 | Left null; requires source/domain decision |
| Unresolved subsystem mapping | 10 | Left unresolved; Group 1 decision required |
| Missing taxonomy code | 11 | Not fabricated; taxonomy/domain decision required |
| `needs_depth_expansion` | 15 | Flag retained; needs domain input |

Mapping validation reports 0 INVALID records; this does not mean every mapping is approved. Provisional/ambiguous mappings remain listed in the unresolved register.

## Verification performed

- Dataset/schema/semantic validation and mapping checks passed with documented warnings.
- Dataset round-trip and SQL export contracts are covered by tests.
- Offline mock pipeline processed 50/50 records; no duplicate vectors on repeat mock ingestion.
- Full test suite and static checks passed (see `GROUP_3_FINAL_AUDIT_REPORT.md`).

## Important limitations

These are hypothetical synthetic scenarios, not plant incident records. Model designations are illustrative. No missing component, subsystem or taxonomy value has been guessed to make the dataset look complete. No case was marked VERIFIED; no reviewer/date was invented. Domain, safety and OEM validation remain pending.

## Pending review

Group 1 must review unresolved mappings, components, taxonomy cross-links and case depth before cases can be approved for trusted retrieval. Retrieval readiness is demonstrated structurally and in mock mode only; real-vector retrieval remains dependent on M08's real inference/database run.
