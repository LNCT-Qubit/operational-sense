# Seed data mapping and provenance

## Data included

`../sql/seed_data/equipment_class_reference.csv` contains exactly three distinct equipment-class records, derived from the first occurrence of each `Equipment Class ID` in Group 1's `Equipment_Reference` sheet.

`../sql/seed_data/equipment_component_reference.csv` contains all 30 rows from Excel rows 2–31. It preserves the source class ID and name, subsystem/assembly label, subsystem-ID source value, component/maintainable-item label, taxonomy code, model-information note, source sheet, source row number and pending-review status.

`../sql/seed_data/seed_m06_reference_data.sql` inserts those records into the candidate database tables. Inserts use `ON CONFLICT DO NOTHING`, so rerunning the seed does not overwrite records or review decisions. The SQL integrity validation checks expected class IDs, the 30 mapping count, class foreign-key consistency and label consistency.

## Mapping rules

| Source field | Destination | Rule |
|---|---|---|
| `Equipment Class ID` | `equipment_class.equipment_class_id` and component reference FK | Preserve exact source ID |
| `Equipment Class` | `equipment_class.class_name`; component reference label | Preserve exact source label |
| `Equipment Description` | `equipment_class.description` | Preserve exact source description |
| `Subsystem / Assembly` | `m06_equipment_component_reference.subsystem_assembly` | Keep as metadata; do not create a subsystem node |
| `Subsystem ID` | `subsystem_id_source_value` | Preserve exact “no subsystem ID” source text; do not fabricate an ID |
| `Component / Maintainable Item` | `component_maintainable_item` | Preserve exact source terminology |
| `Taxonomy Code` | `taxonomy_code` | Preserve source value; does not imply taxonomy approval |
| `Model Information` | `model_information_note` | Preserve source note; do not create physical equipment models |
| Excel row number | `source_row_number` | Preserve source provenance |

## Excluded source content

No synthetic troubleshooting cases, diagnostic steps, plant/facility/production-line labels, spare parts, or proposed failure modes are loaded as physical assets by M06. The workbook reports synthetic cases and pending expert review; they are not a real plant asset register.

## Repeatability

Run the seed script twice in a disposable test database. Expected: first run inserts the three classes and 30 mapping rows; second run inserts no duplicates and the integrity checks still pass. The package includes this as an executable database test, but it was **NOT RUN** in the current environment because PostgreSQL client/server tooling is unavailable.
