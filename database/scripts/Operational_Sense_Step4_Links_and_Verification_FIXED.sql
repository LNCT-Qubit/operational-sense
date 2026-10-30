-- Operational Sense Step 4: link sources, taxonomy, safety, spare parts, and verification records
-- Generated from Operational_Sense_Industrial_Knowledge_Base_g1.xlsx
-- Synthetic/demo data only. This script does NOT verify external sources or approve mappings.
-- Safe to rerun: existing links and per-case verification records are skipped.
-- Run with psql against the opsense database. Review output before using outside a demo environment.

\set ON_ERROR_STOP on
BEGIN;

-- Required for the tenant RLS policies on operational_case and troubleshooting_step.
SELECT set_config('app.current_org_id', 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e', true);

CREATE TEMP TABLE _step4_case_seed (
  case_reference text PRIMARY KEY,
  taxonomy_code text,
  failure_mode_id text,
  source_mapping_note text,
  source_ref_ids text
) ON COMMIT DROP;

INSERT INTO _step4_case_seed (case_reference, taxonomy_code, failure_mode_id, source_mapping_note, source_ref_ids)
VALUES
('CASE-PUMP-001', 'PUMP.BRNG.ROLL', 'FM-051', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S05; S10'),
('CASE-PUMP-002', 'PUMP.SEAL.FACE', 'FM-032', 'MAPPED - cross-link provisional', 'S14; S01; S02; S06; S10'),
('CASE-PUMP-003', 'PUMP.DRVT.CPLG', 'FM-018', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S05; S10'),
('CASE-PUMP-004', 'PUMP.SUCT.STRN', 'FM-030', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S10'),
('CASE-PUMP-005', 'PUMP.HYDR.IMPL', 'FM-003', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S08; S10'),
('CASE-PUMP-006', 'PUMP.SEAL.FACE', 'FM-032', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S06; S10'),
('CASE-PUMP-007', 'PUMP.BRNG.ROLL', 'FM-043', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S05; S10'),
('CASE-PUMP-008', 'PUMP.SUCT.PRIM', 'FM-042', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S10'),
('CASE-PUMP-009', 'PUMP.BRNG.SEAL', 'FM-019', 'MAPPED - cross-link provisional', 'S14; S01; S02; S05; S06; S10'),
('CASE-PUMP-010', NULL, 'FM-050', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S03; S04; S10'),
('CASE-PUMP-011', NULL, 'FM-017', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S10'),
('CASE-PUMP-012', NULL, 'FM-048', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S05; S10'),
('CASE-PUMP-013', 'PUMP.HYDR.WEAR', 'FM-030', 'AMBIGUOUS - expert review', 'S14; S01; S02; S10'),
('CASE-PUMP-014', 'PUMP.DRVT.CPLG', 'FM-018', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S10'),
('CASE-PUMP-015', 'PUMP.HYDR.RECR', 'FM-018', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S05; S06; S10'),
('CASE-PUMP-016', 'PUMP.SUCT.PRIM', 'FM-030', 'AMBIGUOUS - expert review', 'S14; S01; S02; S06; S10'),
('CASE-PUMP-017', 'PUMP.SHFT.SHAF', 'FM-042', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S10'),
('CASE-MOT-001', 'ELEC.MOT.STAT', 'FM-028', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10; S11'),
('CASE-MOT-002', 'ELEC.MOT.BRNG', 'FM-035', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S05; S10; S11'),
('CASE-MOT-003', 'ELEC.MOT.COOL', 'FM-039', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10; S11'),
('CASE-MOT-004', NULL, 'FM-037', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S10; S11'),
('CASE-MOT-005', 'ELEC.MOT.IMBL', 'FM-036', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S10; S11'),
('CASE-MOT-006', 'ELEC.MOT.BRNG', 'FM-035', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S05; S10; S11'),
('CASE-MOT-007', NULL, 'FM-047', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S10; S11'),
('CASE-MOT-008', 'ELEC.MOT.SUPP', 'FM-038', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10; S11'),
('CASE-MOT-009', 'ELEC.MOT.STAT', 'FM-028', 'MAPPED - cross-link provisional', 'S14; S01; S02; S07; S10; S11'),
('CASE-MOT-010', NULL, 'FM-041', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S10; S11'),
('CASE-MOT-011', 'ELEC.MOT.TERM', 'FM-040', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10; S11'),
('CASE-MOT-012', 'ELEC.MOT.COOL', 'FM-034', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S10; S11'),
('CASE-MOT-013', 'ELEC.MOT.FEET', 'FM-036', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S10; S11'),
('CASE-MOT-014', 'ELEC.MOT.AGAP', 'FM-034', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S05; S10; S11'),
('CASE-MOT-015', 'ELEC.MOT.ROTR', 'FM-036', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S10; S11'),
('CASE-MOT-016', 'ELEC.MOT.BRDC', 'FM-034', 'AMBIGUOUS - expert review', 'S14; S01; S02; S03; S04; S05; S10; S11'),
('CASE-MOT-017', NULL, 'FM-036', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S03; S04; S05; S10; S11'),
('CASE-COMP-001', 'COMP.OSEP.ELEM', 'FM-029', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10'),
('CASE-COMP-002', 'COMP.COOL.COLR', 'FM-005', 'MAPPED - cross-link provisional', 'S14; S01; S02; S09; S10'),
('CASE-COMP-003', 'COMP.COOL.COLR', 'FM-005', 'MAPPED - cross-link provisional', 'S14; S01; S02; S09; S10'),
('CASE-COMP-004', 'COMP.INTK.FILT', 'FM-029', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10'),
('CASE-COMP-005', 'COMP.OSEP.ELEM', 'FM-016', 'AMBIGUOUS - expert review', 'S14; S01; S02; S09; S10'),
('CASE-COMP-006', NULL, 'FM-020', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S10'),
('CASE-COMP-007', NULL, 'FM-012', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S03; S04; S10'),
('CASE-COMP-008', 'COMP.VALV.UNL', 'FM-004', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10'),
('CASE-COMP-009', 'COMP.COND.DRN', 'FM-013', 'MAPPED - cross-link provisional', 'S14; S01; S02; S09; S10'),
('CASE-COMP-010', NULL, 'FM-002', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S03; S04; S10'),
('CASE-COMP-011', 'COMP.VALV.MPV', 'FM-029', 'MAPPED - cross-link provisional', 'S14; S01; S02; S10'),
('CASE-COMP-012', 'COMP.AEND.BRNG', 'FM-012', 'MAPPED - cross-link provisional', 'S14; S01; S02; S03; S04; S10'),
('CASE-COMP-013', 'COMP.AEND.ROTR', 'FM-029', 'AMBIGUOUS - expert review', 'S14; S01; S02; S10'),
('CASE-COMP-014', 'COMP.OILS.THRM', 'FM-005', 'MAPPED - cross-link provisional', 'S14; S01; S02; S09; S10'),
('CASE-COMP-015', 'COMP.VALV.SOL', 'FM-004', 'AMBIGUOUS - expert review', 'S14; S01; S02; S10'),
('CASE-COMP-016', NULL, 'FM-020', 'FM-ID ONLY - FMEA_Taxonomy gap', 'S14; S01; S02; S10');

-- 1) Link each case to the sources explicitly listed in Import_View.
WITH source_tokens AS (
  SELECT c.case_reference, trim(x.source_id) AS source_id
  FROM _step4_case_seed c
  CROSS JOIN LATERAL unnest(string_to_array(coalesce(c.source_ref_ids, ''), ';')) AS x(source_id)
  WHERE trim(x.source_id) <> ''
), matched AS (
  SELECT oc.case_id, st.source_id
  FROM source_tokens st
  JOIN operational_case oc ON oc.case_reference = st.case_reference
  JOIN source_reference sr ON sr.source_id = st.source_id
)
INSERT INTO case_source (case_id, source_id, relation_note, evidence_role)
SELECT m.case_id, m.source_id,
       'Workbook Import_View source reference; not independently verified',
       NULL
FROM matched m
ON CONFLICT DO NOTHING;

-- 2) Add taxonomy/vocabulary links without approving them.
-- Only existing FK targets are used. The original workbook mapping note is retained.
WITH candidate AS (
  SELECT oc.case_id,
         CASE WHEN EXISTS (
           SELECT 1 FROM failure_mode_taxonomy ft WHERE ft.taxonomy_code = NULLIF(trim(s.taxonomy_code), '')
         ) THEN NULLIF(trim(s.taxonomy_code), '') ELSE NULL END AS taxonomy_code,
         CASE WHEN EXISTS (
           SELECT 1 FROM failure_mode_vocabulary fv WHERE fv.failure_mode_id = NULLIF(trim(s.failure_mode_id), '')
         ) THEN NULLIF(trim(s.failure_mode_id), '') ELSE NULL END AS failure_mode_id,
         s.source_mapping_note
  FROM _step4_case_seed s
  JOIN operational_case oc ON oc.case_reference = s.case_reference
), to_insert AS (
  SELECT c.*
  FROM candidate c
  WHERE (c.taxonomy_code IS NOT NULL OR c.failure_mode_id IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM case_failure_mapping old
      WHERE old.case_id = c.case_id
        AND old.taxonomy_code IS NOT DISTINCT FROM c.taxonomy_code
        AND old.failure_mode_id IS NOT DISTINCT FROM c.failure_mode_id
    )
), numbered AS (
  SELECT t.*, row_number() OVER (ORDER BY t.case_id) AS rn
  FROM to_insert t
)
INSERT INTO case_failure_mapping
  (case_id, taxonomy_code, failure_mode_id, mapping_status, review_note)
SELECT n.case_id, n.taxonomy_code, n.failure_mode_id,
       'PENDING_REVIEW',
       coalesce(n.source_mapping_note, 'Imported from workbook; expert review required')
FROM numbered n
WHERE NOT EXISTS (
  SELECT 1 FROM case_failure_mapping old
  WHERE old.case_id = n.case_id
    AND old.taxonomy_code IS NOT DISTINCT FROM n.taxonomy_code
    AND old.failure_mode_id IS NOT DISTINCT FROM n.failure_mode_id
);

-- 3) Link safety procedures that are global (equipment_class_id IS NULL)
-- or explicitly scoped to the case's equipment class.
INSERT INTO case_safety_procedure (case_id, safety_procedure_id)
SELECT DISTINCT oc.case_id, sp.safety_procedure_id
FROM operational_case oc
JOIN safety_procedure sp
  ON sp.equipment_class_id IS NULL
  OR sp.equipment_class_id = oc.equipment_class_id
WHERE oc.case_reference IN (SELECT case_reference FROM _step4_case_seed)
ON CONFLICT DO NOTHING;

-- 4) Link spare parts only to the cases listed in Spare_Parts_Reference.Associated Cases.
CREATE TEMP TABLE _step4_spare_link_seed (
  case_reference text,
  part_name text
) ON COMMIT DROP;
INSERT INTO _step4_spare_link_seed (case_reference, part_name)
VALUES
('CASE-PUMP-001', 'bearing housing lip seals/isolators'),
('CASE-PUMP-007', 'Bearing set'),
('CASE-PUMP-009', 'Bearing set'),
('CASE-PUMP-012', 'Bearing/seal as required'),
('CASE-PUMP-015', 'bearings'),
('CASE-PUMP-017', 'bearings'),
('CASE-PUMP-014', 'Coupling element'),
('CASE-PUMP-003', 'coupling element if worn'),
('CASE-PUMP-002', 'elastomers/O-rings'),
('CASE-PUMP-008', 'Foot valve'),
('CASE-PUMP-003', 'foundation bolt set'),
('CASE-PUMP-004', 'gasket'),
('CASE-PUMP-002', 'gaskets'),
('CASE-PUMP-005', 'gaskets'),
('CASE-PUMP-007', 'gaskets'),
('CASE-PUMP-008', 'gaskets'),
('CASE-PUMP-010', 'gaskets'),
('CASE-PUMP-013', 'gaskets'),
('CASE-PUMP-016', 'gaskets'),
('CASE-PUMP-001', 'gaskets as required'),
('CASE-PUMP-016', 'gland packing/seal'),
('CASE-PUMP-014', 'hub bolts'),
('CASE-PUMP-005', 'Impeller'),
('CASE-PUMP-013', 'Impeller'),
('CASE-PUMP-011', 'Impeller (if wrong trim)'),
('CASE-PUMP-010', 'Impeller if damaged'),
('CASE-PUMP-017', 'impeller key'),
('CASE-PUMP-014', 'keys'),
('CASE-PUMP-009', 'lip seals/isolators'),
('CASE-PUMP-001', 'lubricant per OEM'),
('CASE-PUMP-002', 'Mechanical seal cartridge or face set'),
('CASE-PUMP-006', 'O-rings/elastomers in compatible material'),
('CASE-PUMP-007', 'oil'),
('CASE-PUMP-007', 'oiler/level glass'),
('CASE-PUMP-008', 'priming accessories'),
('CASE-PUMP-001', 'Rolling element bearing set'),
('CASE-PUMP-015', 'Seal'),
('CASE-PUMP-017', 'Seal'),
('CASE-PUMP-006', 'seal cartridge if damaged'),
('CASE-PUMP-017', 'Shaft'),
('CASE-PUMP-015', 'shaft if damaged'),
('CASE-PUMP-002', 'shaft sleeve'),
('CASE-PUMP-009', 'shaft sleeve if scored'),
('CASE-PUMP-003', 'Shims'),
('CASE-PUMP-004', 'Strainer basket/element'),
('CASE-PUMP-005', 'wear rings'),
('CASE-PUMP-010', 'wear rings'),
('CASE-PUMP-011', 'wear rings'),
('CASE-PUMP-013', 'wear rings'),
('CASE-COMP-013', 'Airend'),
('CASE-COMP-012', 'Bearings'),
('CASE-COMP-007', 'Bolts'),
('CASE-COMP-003', 'Cooler'),
('CASE-COMP-010', 'Coupling element'),
('CASE-COMP-009', 'Drain valve'),
('CASE-COMP-003', 'filter'),
('CASE-COMP-001', 'gaskets'),
('CASE-COMP-004', 'Intake filter'),
('CASE-COMP-011', 'MPV kit'),
('CASE-COMP-006', 'None'),
('CASE-COMP-002', 'None typically'),
('CASE-COMP-001', 'oil'),
('CASE-COMP-003', 'oil'),
('CASE-COMP-005', 'oil'),
('CASE-COMP-007', 'pads'),
('CASE-COMP-016', 'Pressure transmitter'),
('CASE-COMP-012', 'seals'),
('CASE-COMP-001', 'Separator element'),
('CASE-COMP-005', 'Separator element'),
('CASE-COMP-015', 'Solenoid coil/valve'),
('CASE-COMP-014', 'Thermostatic element'),
('CASE-COMP-008', 'Valve kit'),
('CASE-MOT-007', 'As required'),
('CASE-MOT-005', 'Balance weights'),
('CASE-MOT-006', 'Bearing'),
('CASE-MOT-002', 'Bearings'),
('CASE-MOT-005', 'Bearings'),
('CASE-MOT-014', 'Bearings'),
('CASE-MOT-013', 'bolts'),
('CASE-MOT-010', 'cable'),
('CASE-MOT-008', 'contactor'),
('CASE-MOT-012', 'cowl'),
('CASE-MOT-010', 'Encoder'),
('CASE-MOT-012', 'Fan'),
('CASE-MOT-003', 'Fan/cowl if damaged'),
('CASE-MOT-008', 'Fuse'),
('CASE-MOT-006', 'grease'),
('CASE-MOT-002', 'grease per OEM'),
('CASE-MOT-016', 'grounding ring'),
('CASE-MOT-011', 'hardware'),
('CASE-MOT-009', 'heater'),
('CASE-MOT-016', 'Insulated bearing'),
('CASE-MOT-011', 'Lugs'),
('CASE-MOT-004', 'Overload relay if faulty'),
('CASE-MOT-001', 'Rewind kit/motor'),
('CASE-MOT-015', 'Rotor'),
('CASE-MOT-009', 'Seals'),
('CASE-MOT-013', 'Shims'),
('CASE-MOT-017', 'Shims'),
('CASE-MOT-001', 'terminal gaskets');

INSERT INTO case_spare_part (case_id, spare_part_id)
SELECT DISTINCT oc.case_id, spr.spare_part_id
FROM _step4_spare_link_seed sl
JOIN operational_case oc ON oc.case_reference = sl.case_reference
JOIN spare_part_reference spr ON spr.part_name = sl.part_name
ON CONFLICT DO NOTHING;

-- 5) Create one pending verification record for each of the 50 seeded cases.
-- Reviewer and review_date remain NULL; nothing is approved by this import.
WITH verification_seed AS (
  SELECT *
  FROM (VALUES
('CASE-PUMP-001', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-002', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-003', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-004', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-005', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-006', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-007', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-008', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-009', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-010', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-011', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-012', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-013', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-014', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-015', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-016', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-PUMP-017', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-001', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-002', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-003', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-004', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-005', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-006', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-007', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-008', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-009', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-010', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-011', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-012', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-013', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-014', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-015', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-016', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-MOT-017', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-001', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-002', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-003', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-004', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-005', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-006', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-007', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-008', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-009', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-010', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-011', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-012', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-013', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-014', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-015', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.'),
('CASE-COMP-016', NULL::text, NULL::date, 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING', 'Synthetic scenario; reviewer, date and sign-off intentionally blank.')
  ) AS v(case_reference, reviewer, review_date, technical_status, taxonomy_status,
          source_status, safety_status, measurement_status, overall_decision, comments)
), missing AS (
  SELECT oc.case_id, v.*
  FROM verification_seed v
  JOIN operational_case oc ON oc.case_reference = v.case_reference
  WHERE NOT EXISTS (
    SELECT 1 FROM case_verification cv WHERE cv.case_id = oc.case_id
  )
), numbered AS (
  SELECT m.*, row_number() OVER (ORDER BY m.case_reference) AS rn
  FROM missing m
)
INSERT INTO case_verification
  (case_id, reviewer, review_date,
   technical_accuracy_status, taxonomy_mapping_status, source_verification_status,
   safety_review_status, measurement_validation_status, overall_decision, comments)
SELECT n.case_id, n.reviewer, n.review_date,
       n.technical_status, n.taxonomy_status, n.source_status,
       n.safety_status, n.measurement_status, n.overall_decision, n.comments
FROM numbered n;

-- 6) Verification report. Counts are scoped to this workbook's case references.
SELECT 'case_source links' AS check_name, count(*) AS row_count
FROM case_source cs
JOIN operational_case oc ON oc.case_id = cs.case_id
WHERE oc.case_reference IN (SELECT case_reference FROM _step4_case_seed)
UNION ALL
SELECT 'case_failure_mapping links', count(*)
FROM case_failure_mapping fm
JOIN operational_case oc ON oc.case_id = fm.case_id
WHERE oc.case_reference IN (SELECT case_reference FROM _step4_case_seed)
UNION ALL
SELECT 'case_safety_procedure links', count(*)
FROM case_safety_procedure csp
JOIN operational_case oc ON oc.case_id = csp.case_id
WHERE oc.case_reference IN (SELECT case_reference FROM _step4_case_seed)
UNION ALL
SELECT 'case_spare_part links', count(*)
FROM case_spare_part csp
JOIN operational_case oc ON oc.case_id = csp.case_id
WHERE oc.case_reference IN (SELECT case_reference FROM _step4_case_seed)
UNION ALL
SELECT 'pending verification records', count(*)
FROM case_verification cv
JOIN operational_case oc ON oc.case_id = cv.case_id
WHERE oc.case_reference IN (SELECT case_reference FROM _step4_case_seed)
  AND cv.overall_decision = 'PENDING';

-- Report source IDs that did not match source_reference.
SELECT 'unmatched source references' AS check_name, st.case_reference, st.source_id
FROM (
  SELECT c.case_reference, trim(x.source_id) AS source_id
  FROM _step4_case_seed c
  CROSS JOIN LATERAL unnest(string_to_array(coalesce(c.source_ref_ids, ''), ';')) AS x(source_id)
  WHERE trim(x.source_id) <> ''
) st
LEFT JOIN source_reference sr ON sr.source_id = st.source_id
WHERE sr.source_id IS NULL
ORDER BY st.case_reference, st.source_id;

-- Report spare links that did not match a loaded case or spare part.
SELECT 'unmatched spare links' AS check_name, sl.case_reference, sl.part_name
FROM _step4_spare_link_seed sl
LEFT JOIN operational_case oc ON oc.case_reference = sl.case_reference
LEFT JOIN spare_part_reference spr ON spr.part_name = sl.part_name
WHERE oc.case_id IS NULL OR spr.spare_part_id IS NULL
ORDER BY sl.case_reference, sl.part_name;

COMMIT;
