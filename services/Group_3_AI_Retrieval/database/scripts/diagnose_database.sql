-- Read-only diagnostic for the exact database/session being queried.
SELECT current_database() AS database_name, current_user AS database_user,
       current_schema() AS current_schema, current_setting('search_path') AS search_path;
SELECT extname FROM pg_extension WHERE extname = 'vector';
SELECT table_name, to_regclass('public.' || table_name) AS relation
FROM (VALUES ('organization'), ('equipment_class'), ('subsystem'), ('equipment_model'),
             ('asset_node'), ('operational_case'), ('troubleshooting_step'), ('historical_case'), ('audit_log'))
     AS expected(table_name)
ORDER BY table_name;
SELECT 'organization' AS table_name, count(*) AS row_count FROM public.organization
UNION ALL SELECT 'equipment_model', count(*) FROM public.equipment_model
UNION ALL SELECT 'asset_node', count(*) FROM public.asset_node
UNION ALL SELECT 'operational_case', count(*) FROM public.operational_case
UNION ALL SELECT 'troubleshooting_step', count(*) FROM public.troubleshooting_step
UNION ALL SELECT 'historical_case', count(*) FROM public.historical_case
ORDER BY table_name;
-- Symptom fields belong to operational_case, not historical_case. The latter is a thin vector index.
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('operational_case', 'historical_case')
ORDER BY table_name, ordinal_position;
