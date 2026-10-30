# SQL execution order and safety

## Candidate-only migration

`migrations/0001_m06_asset_hierarchy.sql` creates `public.equipment_class`, `public.asset_node`, and `public.m06_equipment_component_reference`. It is a provisional candidate, not confirmed against M05. It fails if the core M04-named tables already exist.

Use only a clean disposable development/test database after reviewing the source audit and open decisions. Example:

```bash
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f sql/migrations/0001_m06_asset_hierarchy.sql
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f sql/seed_data/seed_m06_reference_data.sql
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction \
  -f sql/seed_data/seed_m06_reference_data.sql
psql "$M06_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f sql/validation/03_seed_data_integrity.sql
```

The seed script is intentionally insert-only. Conflicts are not overwritten. Review any mismatch instead of silently replacing existing values.

## Files

- `seed_data/equipment_class_reference.csv`: three source-backed class rows.
- `seed_data/equipment_component_reference.csv`: 30 exact source mappings.
- `seed_data/seed_m06_reference_data.sql`: executable seed.
- `validation/01_duplicate_source_identifiers.sql`: duplicate source keys and diagnostic duplicate labels.
- `validation/02_orphan_parent_references.sql`: orphan audit.
- `validation/03_seed_data_integrity.sql`: assertions for three classes, 30 source mappings and label consistency.
- `validation/04_asset_class_assignment_review.sql`: review-only class/level consistency query.
- `queries/01_list_equipment_classes.sql`: class lookup.
- `queries/02_recursive_asset_descendants.sql`: parameterized descendant query.
- `../tests/postgres/verify_m06.sql`: database negative and hierarchy tests.

Do not run this candidate against production. Do not bypass the preflight guard if M05 already created target tables. The migration is plain PostgreSQL SQL; adapt its path, naming and transaction handling to the confirmed project migration framework.
