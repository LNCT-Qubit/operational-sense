-- verify_rls.sql  -- STATUS: level 3 - executed on a scratch PostgreSQL 16.15 via scripts/local_pg.sh verify (R1-R10 PASS; local_pg.sh exits non-zero on any FAIL/ERROR).
-- Complements scripts/test_schema.sql (which covers operational_case T1-T5) with:
--   * role flags (not SUPERUSER, not BYPASSRLS)
--   * policy catalogue check: every tenant INSERT policy has WITH CHECK; every UPDATE policy has USING and WITH CHECK
--   * cross-tenant SELECT / INSERT / UPDATE on historical_case (the retrieval table) and on a child table
--   * fail-closed behaviour with no tenant context
-- Run as superuser:  docker compose exec -T db psql -X -v ON_ERROR_STOP=1 -U postgres -d opsense < scripts/verify_rls.sql
-- Each check prints "PASS Rn ..." or "FAIL Rn ..." as a NOTICE. Everything is rolled back; nothing persists.
-- Any line containing FAIL means RLS is NOT verified.
BEGIN;

-- R1 role flags
DO $$
DECLARE su bool; byp bool;
BEGIN
  SELECT rolsuper, rolbypassrls INTO su, byp FROM pg_roles WHERE rolname = 'opsense_app';
  RAISE NOTICE '% R1 opsense_app rolsuper=% rolbypassrls=% (expect f,f)', CASE WHEN su = false AND byp = false THEN 'PASS' ELSE 'FAIL' END, su, byp;
END $$;

-- R2 policy catalogue: WITH CHECK / USING present where required
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM pg_policies WHERE schemaname = 'public' AND cmd = 'INSERT' AND with_check IS NULL;
  RAISE NOTICE '% R2a INSERT policies without WITH CHECK (expect 0): %', CASE WHEN bad = 0 THEN 'PASS' ELSE 'FAIL' END, bad;
  SELECT count(*) INTO bad FROM pg_policies WHERE schemaname = 'public' AND cmd = 'UPDATE' AND (qual IS NULL OR with_check IS NULL);
  RAISE NOTICE '% R2b UPDATE policies missing USING or WITH CHECK (expect 0): %', CASE WHEN bad = 0 THEN 'PASS' ELSE 'FAIL' END, bad;
  SELECT count(*) INTO bad FROM pg_policies WHERE schemaname = 'public' AND cmd IN ('DELETE', 'ALL');
  RAISE NOTICE '% R2c DELETE/ALL policies (expect 0): %', CASE WHEN bad = 0 THEN 'PASS' ELSE 'FAIL' END, bad;
  SELECT count(*) INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('operational_case','historical_case','asset_node','media_evidence','audit_log','organization',
         'troubleshooting_step','case_failure_mapping','case_source','case_spare_part','case_safety_procedure','case_verification')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  RAISE NOTICE '% R2d tenant tables without ENABLE+FORCE RLS (expect 0): %', CASE WHEN bad = 0 THEN 'PASS' ELSE 'FAIL' END, bad;
END $$;

-- setup as superuser (bypasses RLS)
INSERT INTO organization (organization_id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'RLS Verify Org A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'RLS Verify Org B');
INSERT INTO equipment_class (equipment_class_id, class_name) VALUES ('EQ-RLSV', 'RLS verify class');
INSERT INTO operational_case (case_id, case_reference, organization_id, equipment_class_id, symptom_text) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000c001', 'RLSV-B-1', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'EQ-RLSV', 'org B symptom'),
  ('aaaaaaaa-0000-0000-0000-00000000c001', 'RLSV-A-1', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'EQ-RLSV', 'org A symptom');
INSERT INTO historical_case (case_id, organization_id, equipment_class_id, status) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000c001', 'bbbbbbbb-0000-0000-0000-0000000000b2', 'EQ-RLSV', 'DRAFT'),
  ('aaaaaaaa-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'EQ-RLSV', 'DRAFT');
INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement) VALUES
  ('bbbbbbbb-0000-0000-0000-00000000c001', 1, 1, 'org B step');

-- act as the application role, tenant = Org A
SET LOCAL ROLE opsense_app;
SELECT set_config('app.current_org_id', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);

DO $$
DECLARE n int;
BEGIN
  -- SELECT
  SELECT count(*) INTO n FROM historical_case WHERE organization_id = 'bbbbbbbb-0000-0000-0000-0000000000b2';
  RAISE NOTICE '% R3 SELECT Org B historical_case as Org A (expect 0): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
  SELECT count(*) INTO n FROM historical_case WHERE organization_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  RAISE NOTICE '% R3b SELECT own historical_case (expect 1): %', CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END, n;
  SELECT count(*) INTO n FROM troubleshooting_step;
  RAISE NOTICE '% R4 SELECT Org B troubleshooting_step via parent as Org A (expect 0): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END $$;

DO $$
BEGIN  -- INSERT into another tenant
  INSERT INTO historical_case (case_id, organization_id, equipment_class_id, status)
    VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-0000000000b2', 'EQ-RLSV', 'DRAFT');
  RAISE NOTICE 'FAIL R5 INSERT historical_case for Org B as Org A was accepted';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '% R5 INSERT historical_case for Org B as Org A rejected: %', CASE WHEN SQLSTATE IN ('42501') THEN 'PASS' ELSE 'FAIL' END, SQLERRM;
END $$;

DO $$
BEGIN  -- INSERT child row under another tenant's case
  INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement)
    VALUES ('bbbbbbbb-0000-0000-0000-00000000c001', 2, 1, 'cross-tenant step');
  RAISE NOTICE 'FAIL R6 INSERT troubleshooting_step under Org B case as Org A was accepted';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '% R6 INSERT child step under Org B case rejected: %', CASE WHEN SQLSTATE IN ('42501') THEN 'PASS' ELSE 'FAIL' END, SQLERRM;
END $$;

DO $$
DECLARE n int;
BEGIN  -- UPDATE another tenant's row (USING filters it out)
  UPDATE historical_case SET status = 'REVOKED' WHERE case_id = 'bbbbbbbb-0000-0000-0000-00000000c001';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% R7 UPDATE Org B historical_case as Org A (expect 0 rows): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END $$;

DO $$
BEGIN  -- UPDATE own row into another tenant (WITH CHECK rejects)
  UPDATE historical_case SET organization_id = 'bbbbbbbb-0000-0000-0000-0000000000b2' WHERE case_id = 'aaaaaaaa-0000-0000-0000-00000000c001';
  RAISE NOTICE 'FAIL R8 moving own historical_case row to Org B was accepted';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '% R8 moving own row to Org B rejected: %', CASE WHEN SQLSTATE = '42501' THEN 'PASS' ELSE 'FAIL' END, SQLERRM;
END $$;

DO $$
BEGIN  -- DELETE is not granted
  DELETE FROM historical_case WHERE case_id = 'aaaaaaaa-0000-0000-0000-00000000c001';
  RAISE NOTICE 'FAIL R9 DELETE was accepted';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS R9 DELETE denied (no grant)';
END $$;

-- fail closed: no tenant context -> no rows
SELECT set_config('app.current_org_id', '', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM historical_case;
  RAISE NOTICE '% R10 historical_case with empty tenant context (expect 0): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END $$;

RESET ROLE;
ROLLBACK;
