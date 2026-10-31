
BEGIN;

SET LOCAL app.current_org_id =
'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';

SELECT 'Cases without troubleshooting steps' AS check_name,
COUNT(*) AS issue_count
FROM operational_case c
WHERE NOT EXISTS (
    SELECT 1 FROM troubleshooting_step ts
    WHERE ts.case_id = c.case_id
);

SELECT 'Cases without taxonomy mappings' AS check_name,
COUNT(*) AS issue_count
FROM operational_case c
WHERE NOT EXISTS (
    SELECT 1 FROM case_failure_mapping fm
    WHERE fm.case_id = c.case_id
);

SELECT 'Cases without verification records' AS check_name,
COUNT(*) AS issue_count
FROM operational_case c
WHERE NOT EXISTS (
    SELECT 1 FROM case_verification cv
    WHERE cv.case_id = c.case_id
);

SELECT 'Mappings missing taxonomy and vocabulary' AS check_name,
COUNT(*) AS issue_count
FROM case_failure_mapping
WHERE taxonomy_code IS NULL
AND failure_mode_id IS NULL;

COMMIT;
