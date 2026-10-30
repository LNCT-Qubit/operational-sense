-- test_schema.sql
-- Basic self-check for constraints and Row-Level Security.
-- Run:  docker exec -i opsense-db psql -U postgres -d opsense < scripts/test_schema.sql
-- Every test prints PASS or FAIL as a NOTICE. Everything is rolled back at the end,
-- so no test data stays in the database.

BEGIN;

-- ---------- setup (as superuser, bypasses RLS) ----------
INSERT INTO organization (organization_id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Org A'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Test Org B');
INSERT INTO equipment_class (equipment_class_id, class_name) VALUES ('EQ-TEST', 'Test Class');
INSERT INTO subsystem (subsystem_name) VALUES ('Test Subsystem');
INSERT INTO class_subsystem (equipment_class_id, subsystem_id)
  SELECT 'EQ-TEST', subsystem_id FROM subsystem WHERE subsystem_name = 'Test Subsystem';
INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, symptom_text)
  VALUES ('TEST-B-1', 'bbbbbbbb-0000-0000-0000-000000000002', 'EQ-TEST', 'Org B symptom');

-- ---------- run as the application role, tenant = Org A ----------
SET LOCAL ROLE opsense_app;
SELECT set_config('app.current_org_id', 'aaaaaaaa-0000-0000-0000-000000000001', true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM operational_case WHERE organization_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  RAISE NOTICE '% T1 read Org B cases as Org A (expect 0 rows): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END $$;

DO $$
BEGIN
  INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, symptom_text)
    VALUES ('TEST-A-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'EQ-TEST', 'Org A symptom');
  RAISE NOTICE 'PASS T2 insert case with own organization';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'FAIL T2 insert case with own organization: %', SQLERRM;
END $$;

DO $$
BEGIN
  INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, symptom_text)
    VALUES ('TEST-X', 'bbbbbbbb-0000-0000-0000-000000000002', 'EQ-TEST', 'wrong org');
  RAISE NOTICE 'FAIL T3 insert with other organization was accepted';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS T3 insert with other organization rejected';
END $$;

DO $$
DECLARE n int;
BEGIN
  UPDATE operational_case SET symptom_text = 'changed' WHERE organization_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% T4 update Org B row as Org A (expect 0 rows): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END $$;

DO $$
BEGIN
  UPDATE operational_case SET organization_id = 'bbbbbbbb-0000-0000-0000-000000000002' WHERE case_reference = 'TEST-A-1';
  RAISE NOTICE 'FAIL T5 moving a row to another organization was accepted';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS T5 moving a row to another organization rejected';
END $$;

DO $$
BEGIN
  DELETE FROM operational_case WHERE case_reference = 'TEST-A-1';
  RAISE NOTICE 'FAIL T6 delete was allowed';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS T6 delete denied';
END $$;

-- constraint tests (still as Org A)
DO $$
DECLARE cid uuid;
BEGIN
  SELECT case_id INTO cid FROM operational_case WHERE case_reference = 'TEST-A-1';
  BEGIN
    INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement, supervisor_approval_required)
      VALUES (cid, 1, 3, 'open casing', false);
    RAISE NOTICE 'FAIL T7 Tier 3 step without supervisor approval was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS T7 Tier 3 step without supervisor approval rejected';
  END;
  INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement) VALUES (cid, 1, 1, 'look for leak');
  BEGIN
    INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement) VALUES (cid, 1, 2, 'duplicate number');
    RAISE NOTICE 'FAIL T8 duplicate step number was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS T8 duplicate step number rejected';
  END;
  BEGIN
    UPDATE operational_case SET case_status = 'MAYBE' WHERE case_id = cid;
    RAISE NOTICE 'FAIL T9 invalid case_status was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS T9 invalid case_status rejected';
  END;
END $$;

-- asset hierarchy: a cycle must be rejected (still as Org A)
DO $$
DECLARE r bigint; c bigint;
BEGIN
  INSERT INTO asset_node (organization_id, asset_level, asset_name)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Plant', 'Test Plant') RETURNING asset_id INTO r;
  INSERT INTO asset_node (organization_id, parent_asset_id, asset_level, asset_name)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', r, 'Equipment', 'Test Pump') RETURNING asset_id INTO c;
  BEGIN
    UPDATE asset_node SET parent_asset_id = c WHERE asset_id = r;
    RAISE NOTICE 'FAIL T11 hierarchy cycle was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS T11 hierarchy cycle rejected';
  END;
END $$;

-- missing tenant context must fail closed
SELECT set_config('app.current_org_id', '', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM operational_case;
  RAISE NOTICE '% T10 no tenant context (expect 0 rows): %', CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END, n;
END $$;

-- ---------- configuration checks (back to superuser) ----------
RESET ROLE;
-- Expect rolsuper = false and rolbypassrls = false
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'opsense_app';
-- Expect both true for every tenant table
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('operational_case','historical_case','asset_node','media_evidence','audit_log',
                  'troubleshooting_step','case_failure_mapping','case_source','case_spare_part',
                  'case_safety_procedure','case_verification','organization')
ORDER BY relname;

ROLLBACK;
