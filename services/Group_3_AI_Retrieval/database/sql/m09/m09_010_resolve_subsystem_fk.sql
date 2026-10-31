-- m09_010_resolve_subsystem_fk.sql   (M09)
-- PROBLEM: Step 4.5 stores the workbook wording in subsystem_source_label but never sets subsystem_id,
--          so every case had subsystem_id = NULL (saved validation output: 0 of 50) and no strict
--          class + subsystem retrieval filter could match.
-- FIX:     set subsystem_id ONLY where the label equals (case-insensitive, trimmed) an existing subsystem name
--          that class_subsystem lists for the case's equipment class. That keeps the composite FK
--          fk_case_class_subsystem valid. Anything else stays NULL (= unresolved, never a strict match).
-- EXPECTED: 39 rows updated, 11 left NULL (PUMP-010/011/012, MOT-004/007/010/017, COMP-006/007/010/016).
--           The 11 need a Group 1 decision; this script does not guess a mapping.
-- NOTE:    the subsystem names themselves are still PENDING_REVIEW (provisional), so this is a
--          structural mapping, not an expert-approved one. Case status is NOT changed.
-- Safe to re-run (only touches rows where subsystem_id IS NULL). Updates only; nothing is deleted.
-- STATUS:  level 3 - applied on a scratch PostgreSQL 16.15 + pgvector 0.8.0 via scripts/local_pg.sh (see poc/execution_evidence/);
--          the same matching logic is also exercised on SQLite in tests/test_sql_logic.py (level 1). Not run on the Docker image.

BEGIN;
SELECT set_config('app.current_org_id', 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e', true);

UPDATE operational_case c
SET subsystem_id = s.subsystem_id,
    updated_at   = now()
FROM subsystem s
JOIN class_subsystem cs ON cs.subsystem_id = s.subsystem_id
WHERE c.subsystem_id IS NULL
  AND c.organization_id = 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e'
  AND cs.equipment_class_id = c.equipment_class_id
  AND lower(btrim(s.subsystem_name)) = lower(btrim(c.subsystem_source_label));

SELECT count(subsystem_id)                  AS cases_with_subsystem_id,   -- expect 39
       count(*) - count(subsystem_id)       AS cases_still_unresolved     -- expect 11
FROM operational_case
WHERE organization_id = 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';

COMMIT;
