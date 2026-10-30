
BEGIN;

SET LOCAL app.current_org_id =
'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';

SELECT 'Source links with missing references' AS check_name,
COUNT(*) AS issue_count
FROM case_source cs
LEFT JOIN source_reference sr
ON sr.source_id = cs.source_id
WHERE sr.source_id IS NULL;

SELECT 'Safety links with missing procedures' AS check_name,
COUNT(*) AS issue_count
FROM case_safety_procedure csp
LEFT JOIN safety_procedure sp
ON sp.safety_procedure_id = csp.safety_procedure_id
WHERE sp.safety_procedure_id IS NULL;

SELECT 'Spare links with missing parts' AS check_name,
COUNT(*) AS issue_count
FROM case_spare_part csp
LEFT JOIN spare_part_reference spr
ON spr.spare_part_id = csp.spare_part_id
WHERE spr.spare_part_id IS NULL;

COMMIT;
