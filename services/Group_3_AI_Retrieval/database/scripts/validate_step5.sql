-- validate_step5.sql  (Step 5: validate the database yourself)
-- Run from the project folder:
--   docker exec -i opsense-db psql -U postgres -d opsense < scripts/validate_step5.sql 2>&1 | tee documentation/step5_validation_output.txt
-- Everything that changes data is rolled back at the end, so the database is left exactly as it was.

\echo
\echo '=========== A. COUNTS ==========='
\echo 'Expected: EQ-PUMP 17, EQ-MOTOR 17, EQ-COMP 16, total 50'
SELECT ec.equipment_class_id, ec.class_name, count(oc.case_id) AS cases
FROM equipment_class ec LEFT JOIN operational_case oc ON oc.equipment_class_id = ec.equipment_class_id
GROUP BY ec.equipment_class_id, ec.class_name ORDER BY ec.equipment_class_id;
SELECT count(*) AS total_cases FROM operational_case;

\echo 'Expected: 350 steps in total, every case has exactly 7 steps'
SELECT count(*) AS total_steps FROM troubleshooting_step;
SELECT count(*) AS cases_with_steps, min(n) AS min_steps_per_case, max(n) AS max_steps_per_case
FROM (SELECT case_id, count(*) AS n FROM troubleshooting_step GROUP BY case_id) t;

\echo 'Expected: 39 cases with a subsystem (after sql/m09/m09_010_resolve_subsystem_fk.sql), 11 without (wording not in the approved list), all 50 DRAFT (M09: synthetic cases stay DRAFT)'
SELECT count(subsystem_id) AS cases_with_subsystem, count(*) - count(subsystem_id) AS cases_without_subsystem FROM operational_case;
SELECT case_status, count(*) FROM operational_case GROUP BY 1;

\echo
\echo '=========== B. ORPHAN CHECKS (every number must be 0) ==========='
SELECT 'steps without a case' AS check_name, count(*) AS problems
FROM troubleshooting_step s LEFT JOIN operational_case c ON c.case_id = s.case_id WHERE c.case_id IS NULL
UNION ALL SELECT 'mappings without a case', count(*)
FROM case_failure_mapping m LEFT JOIN operational_case c ON c.case_id = m.case_id WHERE c.case_id IS NULL
UNION ALL SELECT 'source links without a case', count(*)
FROM case_source cs LEFT JOIN operational_case c ON c.case_id = cs.case_id WHERE c.case_id IS NULL
UNION ALL SELECT 'source links without a source', count(*)
FROM case_source cs LEFT JOIN source_reference sr ON sr.source_id = cs.source_id WHERE sr.source_id IS NULL
UNION ALL SELECT 'verification records without a case', count(*)
FROM case_verification v LEFT JOIN operational_case c ON c.case_id = v.case_id WHERE c.case_id IS NULL
UNION ALL SELECT 'cases without any steps', count(*)
FROM operational_case c WHERE NOT EXISTS (SELECT 1 FROM troubleshooting_step s WHERE s.case_id = c.case_id)
UNION ALL SELECT 'cases without a mapping row', count(*)
FROM operational_case c WHERE NOT EXISTS (SELECT 1 FROM case_failure_mapping m WHERE m.case_id = c.case_id)
UNION ALL SELECT 'cases without a verification record', count(*)
FROM operational_case c WHERE NOT EXISTS (SELECT 1 FROM case_verification v WHERE v.case_id = c.case_id)
UNION ALL SELECT 'Tier 3 steps without supervisor approval', count(*)
FROM troubleshooting_step WHERE tier = 3 AND NOT supervisor_approval_required;

\echo
\echo '=========== C. BAD DATA MUST BE REJECTED (every line must say PASS) ==========='
BEGIN;
DO $$
DECLARE
  org uuid := (SELECT organization_id FROM operational_case LIMIT 1);
  cid uuid := (SELECT case_id FROM operational_case ORDER BY case_reference LIMIT 1);
  other_sub bigint := (SELECT subsystem_id FROM subsystem
                       WHERE subsystem_id NOT IN (SELECT subsystem_id FROM class_subsystem WHERE equipment_class_id = 'EQ-PUMP')
                       ORDER BY subsystem_id LIMIT 1);
BEGIN
  BEGIN
    UPDATE operational_case SET case_status = 'MAYBE' WHERE case_id = cid;
    RAISE NOTICE 'FAIL V1 wrong case_status was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS V1 wrong case_status rejected'; END;

  BEGIN
    INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement) VALUES (cid, 1, 1, 'duplicate step number');
    RAISE NOTICE 'FAIL V2 duplicate step number was accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS V2 duplicate step number rejected'; END;

  BEGIN
    INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement, supervisor_approval_required)
      VALUES (cid, 99, 3, 'open casing', false);
    RAISE NOTICE 'FAIL V3 Tier 3 step without supervisor approval was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS V3 Tier 3 step without supervisor approval rejected'; END;

  BEGIN
    INSERT INTO troubleshooting_step (case_id, step_number, tier, check_measurement) VALUES (cid, 98, 5, 'tier 5 does not exist');
    RAISE NOTICE 'FAIL V4 invalid tier 5 was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS V4 invalid tier rejected'; END;

  BEGIN
    INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, symptom_text)
      VALUES ('VAL-TEST-1', org, 'EQ-NOPE', 'unknown class');
    RAISE NOTICE 'FAIL V5 unknown equipment class was accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS V5 unknown equipment class rejected'; END;

  IF other_sub IS NULL THEN
    RAISE NOTICE 'SKIP V6 no subsystem outside EQ-PUMP found';
  ELSE
    BEGIN
      INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, subsystem_id, symptom_text)
        VALUES ('VAL-TEST-2', org, 'EQ-PUMP', other_sub, 'subsystem that does not belong to a pump');
      RAISE NOTICE 'FAIL V6 subsystem not valid for the class was accepted';
    EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS V6 subsystem not valid for the class rejected'; END;
  END IF;

  BEGIN
    INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, symptom_text)
      SELECT case_reference, organization_id, equipment_class_id, 'duplicate reference' FROM operational_case WHERE case_id = cid;
    RAISE NOTICE 'FAIL V7 duplicate case reference was accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS V7 duplicate case reference rejected'; END;

  BEGIN
    INSERT INTO operational_case (case_reference, organization_id, equipment_class_id, symptom_text)
      VALUES ('VAL-TEST-3', org, 'EQ-PUMP', '   ');
    RAISE NOTICE 'FAIL V8 blank symptom was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS V8 blank symptom rejected'; END;

  BEGIN
    UPDATE case_verification SET overall_decision = 'APPROVED' WHERE verification_id = (SELECT min(verification_id) FROM case_verification);
    RAISE NOTICE 'FAIL V9 approval without reviewer and date was accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS V9 approval without reviewer and date rejected'; END;
END $$;
ROLLBACK;

\echo
\echo '=========== D. STRICT RETRIEVAL (from the proposal, Section 3) ==========='
\echo 'Real data today: all 50 cases are DRAFT, none is VERIFIED. Expected: 0 retrievable cases.'
SELECT count(*) AS verified_cases_in_retrieval_index FROM historical_case WHERE status = 'VERIFIED';

\echo 'DEMO ONLY: we temporarily pretend all 50 cases are VERIFIED, run the queries, then roll back.'
BEGIN;
INSERT INTO historical_case (case_id, organization_id, equipment_class_id, subsystem_id, equipment_model_id, status, promoted_at)
SELECT case_id, organization_id, equipment_class_id, subsystem_id, equipment_model_id, 'VERIFIED', now() FROM operational_case;

-- pick the class + subsystem that has the most cases, as the "current problem"
CREATE TEMP TABLE demo_problem AS
SELECT equipment_class_id, subsystem_id FROM historical_case
WHERE subsystem_id IS NOT NULL GROUP BY 1, 2 ORDER BY count(*) DESC, 1, 2 LIMIT 1;

\echo 'The current problem (class + subsystem):'
SELECT d.equipment_class_id, s.subsystem_name FROM demo_problem d JOIN subsystem s ON s.subsystem_id = d.subsystem_id;

\echo 'STAGE 1 STRICT: same class AND same subsystem AND VERIFIED. These are the only cases that can support a recommendation.'
SELECT oc.case_reference, ec.class_name, ss.subsystem_name, hc.status, 'Strict match: class and subsystem' AS match_label
FROM historical_case hc
JOIN operational_case oc ON oc.case_id = hc.case_id
JOIN equipment_class ec ON ec.equipment_class_id = hc.equipment_class_id
JOIN subsystem ss ON ss.subsystem_id = hc.subsystem_id
WHERE hc.equipment_class_id = (SELECT equipment_class_id FROM demo_problem)
  AND hc.subsystem_id       = (SELECT subsystem_id FROM demo_problem)
  AND hc.status = 'VERIFIED'
ORDER BY oc.case_reference;

\echo 'RELAXED (informational only): same class, different or missing subsystem. A missing subsystem is NEVER a strict match.'
SELECT oc.case_reference, COALESCE(ss.subsystem_name, '(no subsystem)') AS subsystem_name,
       'Relaxed match: class only, subsystem differs' AS match_label
FROM historical_case hc
JOIN operational_case oc ON oc.case_id = hc.case_id
LEFT JOIN subsystem ss ON ss.subsystem_id = hc.subsystem_id
WHERE hc.equipment_class_id = (SELECT equipment_class_id FROM demo_problem)
  AND hc.subsystem_id IS DISTINCT FROM (SELECT subsystem_id FROM demo_problem)
  AND hc.status = 'VERIFIED'
ORDER BY oc.case_reference
LIMIT 5;

\echo 'Strict matches available for every class + subsystem pair (0 = the app must say: no verified history yet):'
SELECT cs.equipment_class_id, s.subsystem_name, count(hc.case_id) AS strict_matches
FROM class_subsystem cs
JOIN subsystem s ON s.subsystem_id = cs.subsystem_id
LEFT JOIN historical_case hc ON hc.equipment_class_id = cs.equipment_class_id
                            AND hc.subsystem_id = cs.subsystem_id AND hc.status = 'VERIFIED'
GROUP BY cs.equipment_class_id, s.subsystem_name
ORDER BY strict_matches DESC, cs.equipment_class_id, s.subsystem_name;
ROLLBACK;

\echo 'After rollback, expected 0 (the demo left no trace):'
SELECT count(*) AS verified_cases_in_retrieval_index FROM historical_case WHERE status = 'VERIFIED';

\echo
\echo 'Stage 2 (ranking by vector similarity) needs embeddings, which are built in a later sprint.'
\echo 'The pgvector similarity query itself was already proven by scripts/verify_pgvector.sql.'
