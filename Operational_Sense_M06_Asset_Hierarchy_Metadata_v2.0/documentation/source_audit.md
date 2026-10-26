# Source audit

## Inputs actually inspected

- Group 1 workbook: `Operational_Sense_Industrial_Knowledge_Base_g1(4).xlsx`
- M04 package: `M04_Database_Architecture_v1.1_Package(2).zip`
- Existing M06 package: `Operational_Sense_M06_Asset_Hierarchy_Metadata_v1.0 (1).zip`
- Public repository: `https://github.com/LNCT-Qubit/operational-sense`

Hashes and worksheet inventory are recorded in `../tests/fixtures/expected_source_inventory.json`. The workbook's 18 worksheet names and dimensions are recorded in `../source_audit/source_inventory.md`.

## Group 1 M06 evidence

`Equipment_Reference` contains 30 data rows (Excel rows 2–31) and three source-backed class identifiers:

| Class ID | Source class label | Source rows |
|---|---|---:|
| `EQ-PUMP` | `Centrifugal Pump` | 2–11 |
| `EQ-MOTOR` | `Three-Phase Induction Motor` | 12–21 |
| `EQ-COMP` | `Rotary Screw Air Compressor` | 22–31 |

Each row provides a subsystem/assembly label, component/maintainable-item label, taxonomy code, and model-information note. All 30 source rows state: `Not defined in taxonomy (no subsystem ID)`. All model-information notes state that no real model is documented and seed models are illustrative only. Exact source text and source row numbers are preserved in `../source_audit/equipment_reference_source_snapshot.csv`; the normalized seed CSVs retain the same source row numbers.

Relevant review context:
- `Taxonomy_Proposed` has records explicitly marked `PROPOSED - not approved`.
- `Taxonomy_FM_Vocabulary` includes `pending_domain_review`.
- `Mapping_Validation` includes provisional mappings, 11 taxonomy gaps and 13 ambiguous mappings reported by the source quality report.
- `Verification_Records` is pending and does not provide evidence that the synthetic scenarios are approved real cases.
- `Import_View` has 50 synthetic cases: 17 pump, 17 motor and 16 compressor. These are not loaded as physical asset records.

## M04 architecture evidence

The M04 report states it is prepared for cross-group review and that formal approval is pending. It assigns physical PostgreSQL DDL, migrations, indexes, triggers and production loading scripts to M05. Its logical inventory proposes `EQUIPMENT_CLASS` and `ASSET_NODE`. `ASSET_NODE` includes `asset_id`, `parent_asset_id`, `asset_level`, `asset_name`, optional `equipment_class_id`, `model_label`, `model_is_illustrative`, `site_identifier`, and `status`.

M04 explicitly leaves open:
- whether Subsystem is a formal hierarchy node or descriptive metadata (Q01);
- the Common Data Model approval/version (Q02);
- physical types and migration conventions (Q04);
- whether plant/facility/line labels from synthetic cases are real asset context (Q05);
- identifier and uniqueness strategy (Q09);
- formal cross-group approval (Q10).

The package does not resolve those domain decisions by inference.

## Live repository inspection

The public repository page is reachable through web inspection and currently exposes a root README, with no visible M05 migration/schema files in the displayed file listing. The README describes a React PWA and Java/Spring Boot backend, PostgreSQL, and pgvector. This conflicts with the Node.js + Express stack specified in the task prompt. Direct `git ls-remote` from the execution environment failed with `Could not resolve host: github.com`; no local checkout or working-tree inspection was possible. Therefore no repository branch, M05 schema, migration framework, or CI test results are claimed.

## Audit conclusion

The package implements a provisional, self-contained PostgreSQL candidate that fails closed if the core M04-named tables already exist. It is not yet a confirmed migration against the repository's actual M05 schema, and it is not formally approved for production deployment.
