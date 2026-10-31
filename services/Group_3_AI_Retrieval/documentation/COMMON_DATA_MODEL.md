# Common data model (Sprint 1, canonical v1.0.0)

## 1. One structure, three views
```
Technician observation -> structured case (JSON v1.0.0) -> validation -> DB rows (operational_case + children)
                       -> embedding text + metadata -> historical_case.embedding vector(384) -> similarity -> original case_reference
```
| View | Where | Role |
|---|---|---|
| JSON case | `case_schema/canonical_schema.json` | exchange / validation format (M07) |
| SQL tables | `database/migrations/002-006` | storage (Group 2) |
| Embedding input | `retrieval/text_builder.py` | semantic text + structured metadata (M08) |

The JSON schema reuses the SQL column names; nothing was renamed. `integration/mapping.py` + `tests/test_case_schema.py::test_every_schema_property_is_mapped_or_explicitly_unstored` prove that every JSON property is stored, resolved at load time, or explicitly listed as not stored.

## 2. Requirement-to-field map
| Required concept | Field(s) | Note |
|---|---|---|
| Equipment class / identifier / model | `equipment_class_id`, `case_reference`, `model_designation`, `model_is_illustrative`, `asset_id` | `asset_id` only for real assets (null for synthetic) |
| Subsystem / hierarchy | `subsystem_name` (-> `subsystem_id`), `subsystem_source_label`, `component_name`; real assets: `asset_node` tree | asset hierarchy and knowledge taxonomy are separate (M04) |
| Case id / summary / observation | `case_reference` (+ DB `case_id` UUID), `symptom_structured`, `symptom_text` | |
| Normalised symptoms / conditions | `symptom_structured`, `symptom_category`, `operating_status`, `symptom_frequency` | |
| Failure mode | `failure_mechanism`, `failure_mappings[]` (`taxonomy_code`, `failure_mode_id`) | FM ids are project-local, **not ISO 14224** |
| Suspected vs confirmed cause | `primary_suspected_cause`, `alternative_causes` vs `confirmed_cause` + `root_cause_confirmation` | separate columns; enforced |
| Inspection / diagnostic steps | `troubleshooting_steps[]` (ordered, tier 1-3) | order enforced |
| Corrective action / verification | `corrective_action_text`, `post_repair_verification`, `acceptance_criteria` | |
| Observed outcome | `observed_outcome` | **no DB column**; proposal, refused by the loader until approved |
| Synthetic flag / lifecycle / review | `is_synthetic`, `case_status`, `retrieval_eligibility`, `verification{}` | |
| Source / provenance / assumptions | `sources[]`, `case_origin`, `evidence_type`, `source_reliability`, `provenance{}` | provenance is JSON-side |
| Timestamps | `created_at`, `updated_at` | DB-generated; null in exports |

## 3. Lifecycle (single definition)
`DRAFT -> SUBMITTED -> VERIFIED` (or `REJECTED` / `REVOKED`). A case is **trusted for retrieval** only when `case_status = VERIFIED` **and** `retrieval_eligibility = eligible` **and** (schema rule) its verification is `APPROVED` with reviewer and date. Demo mode adds `DRAFT/SUBMITTED` + `demo_only_until_expert_review` on explicit opt-in. Whether `case_verification` checks beyond `overall_decision` are also required is an **open decision for Group 2**. All 50 synthetic cases are `DRAFT`, `demo_only_until_expert_review`, verification `PENDING`.

## 4. Conflicts found between M07 (missing), M08 and M09, and the resolution
| Conflict | Resolution |
|---|---|
| Brief requires JSON schema; none supplied | derived from DB (v1.0.0) |
| Brief requires "observed outcome"; DB has none | JSON-only optional field, refused at load |
| Brief wants causes/actions/outcome in embedding text; M08 deliberately excludes them (information leakage) | kept M08's exclusion, documented with reasoning in `EMBEDDING_STRATEGY.md`; **to be validated by evaluation, not assumed** |
| Brief wants equipment/subsystem in embedding text; M08 used them only as filters | added both as text lines and kept them as filters |
| `subsystem_id` identity numbers exist only in a live DB | JSON uses names; no IDs invented |
| Status SUBMITTED (docs) vs DRAFT (import) | DRAFT |
| Two asset-seed designs | M09 variant + seed 005 |
| "Trusted" undefined in schema | strict reading (VERIFIED + eligible [+ approved verification]); flagged for Group 2 |

## 5. Breaking changes
None to the database. New JSON format only (`schema_version.md`).

## Group 3 Final additions
- `historical_case` gains `embedding_model`, `embedding_dimension`, `embedding_text_sha256`, `embedding_text_version`, `embedded_at` (migration 008, **provisional**, schema owner to confirm). CHECKs: a stored vector needs model + hash and `embedding_dimension = vector_dims(embedding)`; model names matching mock/fake/hashing/test-only are rejected.
- Search compares only vectors whose `embedding_model` equals the query model.
- `m09_040_apply_curation.sql` (generated) updates `troubleshooting_step.check_measurement` / `safety_warning`, `operational_case.acceptance_criteria`, one `subsystem_id`, and labels `safety_procedure.scope_type`; it adds no columns and deletes nothing.
- `opsense_app` has no committed password (see `database/README.md`). Mappings are project-local; **no ISO 14224 compliance is claimed**.
