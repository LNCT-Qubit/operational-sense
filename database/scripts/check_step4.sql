-- check_step4.sql : counts after load_steps_links_verification.sql
-- docker exec -i opsense-db psql -U postgres -d opsense < scripts/check_step4.sql
\echo '--- Expected: steps 350, mappings 50, case_source 286, verification 50'
SELECT 'troubleshooting_step' AS item, count(*) FROM troubleshooting_step
UNION ALL SELECT 'case_failure_mapping', count(*) FROM case_failure_mapping
UNION ALL SELECT 'case_source', count(*) FROM case_source
UNION ALL SELECT 'case_verification', count(*) FROM case_verification;

\echo '--- Expected: tier 1 = 150, tier 2 = 150, tier 3 = 50 (approval required on all Tier 3)'
SELECT tier, count(*) AS steps, bool_and(supervisor_approval_required) AS all_need_approval
FROM troubleshooting_step GROUP BY tier ORDER BY tier;

\echo '--- Expected: 50 cases, each with exactly 7 steps'
SELECT count(*) AS cases, min(n) AS min_steps, max(n) AS max_steps
FROM (SELECT case_id, count(*) AS n FROM troubleshooting_step GROUP BY case_id) t;

\echo '--- Expected: 50 rows, all PENDING, reviewer empty (nothing is approved)'
SELECT overall_decision, count(*) AS records, count(reviewer) AS with_reviewer FROM case_verification GROUP BY 1;

\echo '--- Expected: 11 mappings without a taxonomy code (known gaps, kept visible)'
SELECT count(*) AS mappings_without_taxonomy_code FROM case_failure_mapping WHERE taxonomy_code IS NULL;
