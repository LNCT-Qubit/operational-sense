# Validation rules (v1.0.0)

Three layers, implemented in `case_schema/validator.py` + `case_schema/case_validation.py`. `ERROR` = reject; `WARNING` = loadable, gap reported.

## Layer 1: JSON Schema (`canonical_schema.json`)
| Rule | Enforced by |
|---|---|
| Required: `schema_version, case_reference, equipment_class_id, model_is_illustrative, symptom_text, is_synthetic, case_status, retrieval_eligibility, troubleshooting_steps (>=1), verification` | `required` |
| No unknown properties | `additionalProperties: false` |
| `equipment_class_id` in `EQ-PUMP, EQ-MOTOR, EQ-COMP` | `enum` |
| `case_status` in DRAFT, SUBMITTED, VERIFIED, REJECTED, REVOKED; `retrieval_eligibility` in demo_only_until_expert_review, eligible, excluded | `enum` (mirrors CHECKs in 005) |
| `symptom_text` not blank | `pattern \S` (mirrors `chk_symptom_not_blank`) |
| `case_reference` shape `CASE-<CLASS>-NNN`; step reference `DS-<CLASS>-NNN-NN`; taxonomy `AAAA.BBBB[.CCCC]`; `FM-NNN`; source `SNN` | `pattern` |
| Types (integer vs string vs boolean vs null) | `type` |
| Tier 3 step => `supervisor_approval_required = true` | `if/then` (mirrors `chk_tier3_needs_approval`) |
| `VERIFIED` => verification `APPROVED`/`APPROVED WITH CHANGES` with reviewer and date | `if/then` (mirrors `chk_approval_has_reviewer`) |
| `eligible` => `VERIFIED` | `if/then` |
| `confirmed_cause` set => `root_cause_confirmation` non-blank | `if/then` |
| `is_synthetic` => `asset_id` null | `if/then` |

## Layer 2: semantic rules (need reference data parsed from `database/*.sql`)
| Code | Sev. | Rule |
|---|---|---|
| CLASS / REF-CLASS | ERR | class exists; `case_reference` prefix matches class |
| SUBSYS-INVALID | ERR | `subsystem_name` must be an approved subsystem of the class |
| SUBSYS-GUESSED | ERR | `subsystem_name` may only equal `subsystem_source_label` (exact, case-insensitive); no inferred mapping |
| SUBSYS-UNRESOLVED / COMPONENT-MISSING / TAXONOMY-MISSING | WARN | unknown stays null and is reported |
| MODEL-UNKNOWN | ERR if the model belongs to another class, else WARN | |
| SYNTH-MODEL / SYNTH-CONFIRMED / SYNTH-LIFECYCLE | ERR | synthetic cases stay illustrative, have no confirmed cause, and cannot be retrieval-eligible while DRAFT/SUBMITTED |
| CAUSE-CONFUSED | ERR | `confirmed_cause` equal to the suspected cause with no confirming evidence |
| STEP-ORDER | ERR | `step_number` is 1..n in order |
| STEP-TIER-ORDER | WARN | tiers must not decrease (observe, measure, intervene) |
| STEP-REF | ERR | `step_reference` matches case and step number |
| TIER3-ISOLATION | ERR | intervention step states isolation / LOTO somewhere in the step |
| TIER3-THIN | WARN | intervention text under 60 chars (review aid, not a standard) |
| TAXONOMY-INVALID / -CLASS, FM-INVALID / -CLASS, SOURCE-INVALID | ERR | referenced IDs exist and belong to the class |
| OUTCOME-UNMAPPED | WARN | `observed_outcome` has no DB column |

## Layer 3: dataset rules
DUP-ID (ERR), DUP-STEP-REF (ERR), COVERAGE: pumps, motors and compressors all present (ERR), NEAR-DUPLICATE (WARN; Jaccard of symptom word sets >= 0.80 within a class).

## Not validated (needs an expert, not code)
Whether a symptom is technically plausible for the named cause, whether a measuring point is right, whether a safety instruction is sufficient, whether a taxonomy cross-link is correct. See `synthetic_dataset/dataset_quality_report.md`.
