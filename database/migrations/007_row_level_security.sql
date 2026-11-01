-- 007_row_level_security.sql

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opsense_app') THEN
    CREATE ROLE opsense_app LOGIN PASSWORD 'opsense_app_dev' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO opsense_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO opsense_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO opsense_app;

-- Write access (no DELETE anywhere)
GRANT INSERT, UPDATE ON
    operational_case, historical_case, asset_node, media_evidence,
    troubleshooting_step, case_failure_mapping, case_source, case_spare_part,
    case_safety_procedure, case_verification
TO opsense_app;
GRANT INSERT ON audit_log TO opsense_app;   -- append-only

DO $$
DECLARE
  t        TEXT;
  org_expr TEXT := $e$organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid$e$;
BEGIN
  -- Tables with a direct organization_id: SELECT + INSERT + UPDATE
  FOREACH t IN ARRAY ARRAY['operational_case','historical_case','asset_node','media_evidence'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', t);
    EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (%s)', t, org_expr);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (%s)', t, org_expr);
    EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (%s) WITH CHECK (%s)', t, org_expr, org_expr);
  END LOOP;

  -- audit_log: SELECT + INSERT only
  EXECUTE 'ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE audit_log FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON audit_log';
  EXECUTE 'DROP POLICY IF EXISTS tenant_insert ON audit_log';
  EXECUTE format('CREATE POLICY tenant_select ON audit_log FOR SELECT USING (%s)', org_expr);
  EXECUTE format('CREATE POLICY tenant_insert ON audit_log FOR INSERT WITH CHECK (%s)', org_expr);

  -- organization: a tenant can only see its own row (no insert/update for the app role)
  EXECUTE 'ALTER TABLE organization ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE organization FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_select ON organization';
  EXECUTE format('CREATE POLICY tenant_select ON organization FOR SELECT USING (%s)', org_expr);

  -- Child tables without organization_id: access follows the parent case.
  -- The subquery on operational_case is itself filtered by that table's RLS.
  FOREACH t IN ARRAY ARRAY['troubleshooting_step','case_failure_mapping','case_source',
                           'case_spare_part','case_safety_procedure','case_verification'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', t);
    EXECUTE format('CREATE POLICY tenant_select ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM operational_case c WHERE c.case_id = %I.case_id))', t, t);
    EXECUTE format('CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM operational_case c WHERE c.case_id = %I.case_id))', t, t);
    EXECUTE format('CREATE POLICY tenant_update ON %I FOR UPDATE USING (EXISTS (SELECT 1 FROM operational_case c WHERE c.case_id = %I.case_id)) WITH CHECK (EXISTS (SELECT 1 FROM operational_case c WHERE c.case_id = %I.case_id))', t, t, t);
  END LOOP;
END $$;

COMMIT;
