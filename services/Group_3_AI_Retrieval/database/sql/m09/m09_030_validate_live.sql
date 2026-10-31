-- m09_030_validate_live.sql   (M09) READ-ONLY live check: expected value vs actual row count, PASS/FAIL per line.
-- Run:  docker exec -i opsense-db psql -U postgres -d opsense < sql/m09/m09_030_validate_live.sql
-- Expected values come from the SQL files in this package (static parse), so a FAIL means the live
-- database differs from the files - exactly what a live check is for. Nothing is modified (ROLLBACK).
-- Run as postgres (superuser) the row-level security is bypassed; as opsense_app the tenant is set below.
-- STATUS: level 3 - executed on a scratch PostgreSQL 16.15 + pgvector 0.8.0 via scripts/local_pg.sh (every row PASS; see
--         poc/execution_evidence/). local_pg.sh exits non-zero if any row reports FAIL. Not run on the Docker image.

BEGIN;
SELECT set_config('app.current_org_id', 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e', true);

SELECT check_name, expected, actual, CASE WHEN expected = actual THEN 'PASS' ELSE 'FAIL' END AS result
FROM (
  SELECT 'organization'                  AS check_name, 1   AS expected, (SELECT count(*) FROM organization WHERE organization_id = 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e') AS actual
  UNION ALL SELECT 'equipment_class', 3, (SELECT count(*) FROM equipment_class)
  UNION ALL SELECT 'subsystem', 21, (SELECT count(*) FROM subsystem)
  UNION ALL SELECT 'class_subsystem', 23, (SELECT count(*) FROM class_subsystem)
  UNION ALL SELECT 'm06_equipment_component_reference', 30, (SELECT count(*) FROM m06_equipment_component_reference)
  UNION ALL SELECT 'source_reference', 14, (SELECT count(*) FROM source_reference)
  UNION ALL SELECT 'failure_mode_taxonomy', 30, (SELECT count(*) FROM failure_mode_taxonomy)
  UNION ALL SELECT 'failure_mode_vocabulary', 29, (SELECT count(*) FROM failure_mode_vocabulary)
  UNION ALL SELECT 'measurement_reference', 147, (SELECT count(*) FROM measurement_reference)
  UNION ALL SELECT 'safety_procedure', 14, (SELECT count(*) FROM safety_procedure)
  UNION ALL SELECT 'spare_part_reference', 80, (SELECT count(*) FROM spare_part_reference)
  UNION ALL SELECT 'equipment_model', 19, (SELECT count(*) FROM equipment_model)
  UNION ALL SELECT 'asset_node (demo site + 3 assets)', 4, (SELECT count(*) FROM asset_node)
  UNION ALL SELECT 'operational_case', 50, (SELECT count(*) FROM operational_case)
  UNION ALL SELECT 'troubleshooting_step', 350, (SELECT count(*) FROM troubleshooting_step)
  UNION ALL SELECT 'case_failure_mapping', 50, (SELECT count(*) FROM case_failure_mapping)
  UNION ALL SELECT 'case_source', 286, (SELECT count(*) FROM case_source)
  UNION ALL SELECT 'case_safety_procedure (50 cases x 14 general rules)', 700, (SELECT count(*) FROM case_safety_procedure)
  UNION ALL SELECT 'case_spare_part (98 case-specific links)', 98, (SELECT count(*) FROM case_spare_part)
  UNION ALL SELECT 'case_verification', 50, (SELECT count(*) FROM case_verification)
  UNION ALL SELECT 'cases with subsystem_id (after m09_010 + m09_040)', 40, (SELECT count(subsystem_id) FROM operational_case)
  UNION ALL SELECT 'cases with case_status DRAFT', 50, (SELECT count(*) FROM operational_case WHERE case_status = 'DRAFT')
  UNION ALL SELECT 'cases demo_only_until_expert_review', 50, (SELECT count(*) FROM operational_case WHERE retrieval_eligibility = 'demo_only_until_expert_review')
  UNION ALL SELECT 'cases flagged synthetic', 50, (SELECT count(*) FROM operational_case WHERE is_synthetic)
  UNION ALL SELECT 'cases that would be TRUSTED-retrievable (must be 0)', 0, (SELECT count(*) FROM operational_case WHERE case_status = 'VERIFIED' AND retrieval_eligibility = 'eligible')
  UNION ALL SELECT 'verification rows not PENDING (must be 0)', 0, (SELECT count(*) FROM case_verification WHERE overall_decision <> 'PENDING')
  UNION ALL SELECT 'tier-3 steps without supervisor approval (must be 0)', 0, (SELECT count(*) FROM troubleshooting_step WHERE tier = 3 AND NOT supervisor_approval_required)
  UNION ALL SELECT 'cases without exactly 7 steps (must be 0)', 0, (SELECT count(*) FROM operational_case c WHERE (SELECT count(*) FROM troubleshooting_step s WHERE s.case_id = c.case_id) <> 7)
  UNION ALL SELECT 'cases with NULL equipment_model_id (must be 0)', 0, (SELECT count(*) FROM operational_case WHERE equipment_model_id IS NULL)
  UNION ALL SELECT 'placeholder spare parts named None* (must be 0)', 0, (SELECT count(*) FROM spare_part_reference WHERE part_name ~* '^none')
  UNION ALL SELECT 'historical_case rows with embeddings (not part of M09; 0 expected)', 0, (SELECT count(*) FROM historical_case WHERE embedding IS NOT NULL)
) t
ORDER BY check_name;

ROLLBACK;
