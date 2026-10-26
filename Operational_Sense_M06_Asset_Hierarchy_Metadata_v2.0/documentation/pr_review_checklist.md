# Pull request review checklist

## Schema and integration
- [ ] Compare all DDL with actual M05 schema and migration conventions.
- [ ] Resolve Spring Boot vs Node.js + Express discrepancy.
- [ ] Confirm target schema/search path and migration runner transaction behavior.
- [ ] Confirm identifier strategy, hierarchy vocabulary and uniqueness rules.
- [ ] Verify no duplicate M04/M05 entity definition is introduced.
- [ ] Confirm whether `m06_equipment_component_reference` is staging-only or maps to approved taxonomy.
- [ ] Review FK actions and cycle-trigger concurrency behavior.

## Source and data
- [ ] Confirm Group 1 source workbook version/hash.
- [ ] Review all 3 class rows and 30 mapping rows against the source.
- [ ] Confirm subsystem labels are metadata until Q01 is resolved.
- [ ] Confirm pending review status is retained.
- [ ] Confirm no synthetic cases are loaded as physical assets.

## Testing
- [ ] Apply migration to a clean disposable PostgreSQL database.
- [ ] Run seed script twice and verify stable row counts.
- [ ] Run FK, duplicate ID, self-parent and cycle negative tests.
- [ ] Run recursive descendant query.
- [ ] Run SQL validation queries and project CI.
- [ ] Verify pgvector independently if required by the environment.

## Approval
- [ ] Group 1 approves equipment hierarchy and reference mappings.
- [ ] M05 approves physical schema integration.
- [ ] Group 4 reviews the Common Data Model contract.
- [ ] M04/Common Data Model formal approval is recorded.
- [ ] All tests have real captured output; no blocked check is reported as PASS.
