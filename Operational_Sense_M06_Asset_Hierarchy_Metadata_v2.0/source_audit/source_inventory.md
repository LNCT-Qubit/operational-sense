# Source inventory

## Supplied files inspected

- Existing M06 package: `Operational_Sense_M06_Asset_Hierarchy_Metadata_v1.0 (1).zip`
  - SHA-256: `9cdd48bacafd3906558ba0669aec075141ffd66c63a73f262d506110538ea265`
  - ZIP integrity: PASS; 43 archive entries.
- Group 1 workbook: `Operational_Sense_Industrial_Knowledge_Base_g1(4).xlsx`
  - SHA-256: `0c36188fc9186d90b823162855a27d350bf758a40111515aaa10e59404e1bddd`
  - All 18 worksheets enumerated; M06-relevant data inspected.
- M04 package: `M04_Database_Architecture_v1.1_Package(2).zip`
  - SHA-256: `d3cb444fa574202016cd894131b0fe4a3eea17e83bff7dd0a628e14a786dbbe7`
  - ZIP integrity: PASS; 13 entries including report DOCX/PDF, reference workbook, ERD exports and editable sources.

## Group 1 workbook worksheet inventory

| Worksheet | Rows incl. header | Columns |
|---|---:|---:|
| `README` | 53 | 3 |
| `Troubleshooting_Cases` | 51 | 65 |
| `Import_View` | 51 | 51 |
| `Diagnostic_Steps` | 351 | 14 |
| `Review_Actions` | 16 | 5 |
| `Failure_Mode_Taxonomy` | 31 | 11 |
| `Taxonomy_Proposed` | 12 | 13 |
| `Taxonomy_FM_Vocabulary` | 30 | 5 |
| `Measurement_Reference` | 148 | 12 |
| `Equipment_Reference` | 31 | 8 |
| `Spare_Parts_Reference` | 82 | 7 |
| `Safety_Procedures` | 15 | 5 |
| `Verification_Records` | 51 | 10 |
| `Sources` | 15 | 8 |
| `Mapping_Validation` | 51 | 7 |
| `Change_Summary` | 13 | 2 |
| `Data_Quality_Report` | 21 | 5 |
| `Lists` | 6 | 9 |

## M06-relevant observations

- `Equipment_Reference`: 30 data rows; 3 distinct class IDs and 30 source mappings.
- `Import_View`: 50 synthetic troubleshooting cases: 17 Centrifugal Pump, 17 Three-Phase Induction Motor, 16 Rotary Screw Air Compressor.
- `Failure_Mode_Taxonomy`: 30 rows including header.
- `Taxonomy_Proposed`: includes rows marked `PROPOSED - not approved`.
- `Taxonomy_FM_Vocabulary`: includes `pending_domain_review`.
- `Mapping_Validation`: 50 rows including header; source report flags 11 taxonomy gaps and 13 ambiguous mappings.
- `Review_Actions`: source review notes include model information, synthetic scenario status and unresolved technical review.
- `Data_Quality_Report`: does not represent formal approval; its pending and warning states remain visible.
- `Equipment_Reference` source rows 2–31 all say `Not defined in taxonomy (no subsystem ID)` for subsystem ID and that no real model is documented; seed models are illustrative only.

The exact M06 source rows are preserved in `equipment_reference_source_snapshot.csv`. Machine-readable counts and hashes are in `../tests/fixtures/expected_source_inventory.json`.

## M04 architecture

M04 v1.1 explicitly states: “Prepared for cross-group review and implementation planning”; formal approval is not supplied. The report says physical PostgreSQL DDL, migrations, indexes, triggers and production loading scripts are M05 implementation work. The M04 workbook includes `Entity_Inventory`, `Relationships`, `Field_Mapping`, `Open_Decisions`, and `Source_Audit`.

Relevant proposed logical entities: `EQUIPMENT_CLASS` and `ASSET_NODE`. M04 Q01 leaves hierarchy levels and Subsystem treatment open; Q04 leaves physical schema conventions to M05; Q09 leaves identifier strategy and uniqueness rules open; Q10 requires formal cross-group approval.

## Repository status

The public repository URL was inspected using the web interface. The visible root file listing currently shows `README.md`; no M05 migration/schema files were visible. The README describes a React PWA, Java/Spring Boot, PostgreSQL and pgvector, which conflicts with the Node.js + Express stack stated in the task prompt. Direct `git ls-remote` failed with `Could not resolve host: github.com`, and no local checkout was supplied. No branch, commit, push, PR or repository file modification was performed.
