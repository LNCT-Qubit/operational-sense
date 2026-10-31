-- Operational Sense Step 4.4: Safety procedures and spare-part references
-- Generated from Operational_Sense_Industrial_Knowledge_Base_g1.xlsx
-- Safety guidance and spare-part compatibility are unverified; preserve review status/caveats.
BEGIN;

INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Unexpected start-up', 'Isolate, lock out and tag out all energy sources before any Tier 3 work; verify zero energy; supervisor approval first', 'General guidance; site LOTO procedure governs', 'S10'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Unexpected start-up'
    AND x.requirement = 'Isolate, lock out and tag out all energy sources before any Tier 3 work; verify zero energy; supervisor approval first'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Rotating machinery', 'Keep guards fitted; no contact with rotating shafts/couplings; no loose clothing; do not run with guard removed', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Rotating machinery'
    AND x.requirement = 'Keep guards fitted; no contact with rotating shafts/couplings; no loose clothing; do not run with guard removed'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Stored mechanical energy', 'Release spring/pressure energy and block rotors per OEM before work', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Stored mechanical energy'
    AND x.requirement = 'Release spring/pressure energy and block rotors per OEM before work'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Hot surfaces', 'Use non-contact thermometer from safe position; allow cooling before work', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Hot surfaces'
    AND x.requirement = 'Use non-contact thermometer from safe position; allow cooling before work'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Chemical / lubricant exposure', 'Use PPE per safety data sheet; manage spills; no skin contact with oils/chemicals', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Chemical / lubricant exposure'
    AND x.requirement = 'Use PPE per safety data sheet; manage spills; no skin contact with oils/chemicals'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Pressurised/hazardous liquid', 'Depressurise and drain, check fluid SDS before opening seals/casing', 'Site-specific procedure required; Workbook source IDs: S06; S14', 'S06'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Pressurised/hazardous liquid'
    AND x.requirement = 'Depressurise and drain, check fluid SDS before opening seals/casing'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Dry running', 'Do not start without priming/venting; avoid dry operation', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Dry running'
    AND x.requirement = 'Do not start without priming/venting; avoid dry operation'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Electrical energy', 'Electrical measurements only by qualified person under approved procedure; no opening of terminal box while energised; confirm isolation with tested instrument', 'Site electrical safety rules; NFPA 70E / local rules inform', 'S11'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Electrical energy'
    AND x.requirement = 'Electrical measurements only by qualified person under approved procedure; no opening of terminal box while energised; confirm isolation with tested instrument'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Capacitive / residual charge', 'Discharge and ground windings after insulation test per instrument and OEM instructions', 'General guidance', 'S07'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Capacitive / residual charge'
    AND x.requirement = 'Discharge and ground windings after insulation test per instrument and OEM instructions'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Insulation testing', 'Test only de-energised and isolated; disconnect drive/electronics per OEM', 'General guidance', 'S07'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Insulation testing'
    AND x.requirement = 'Test only de-energised and isolated; disconnect drive/electronics per OEM'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Pressurised air', 'Confirm full depressurisation before opening; never open pressurised vessel/separator', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Pressurised air'
    AND x.requirement = 'Confirm full depressurisation before opening; never open pressurised vessel/separator'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Hot oil', 'Allow cool-down; hot oil/air can scald; relieve pressure before oil work', 'General guidance', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Hot oil'
    AND x.requirement = 'Allow cool-down; hot oil/air can scald; relieve pressure before oil work'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'Tier policy', 'Tier 1 observation only; Tier 2 trained personnel with suitable instruments; Tier 3 only with supervisor approval + LOTO; ambiguous steps go to higher-risk tier', 'Project rule', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'Tier policy'
    AND x.requirement = 'Tier 1 observation only; Tier 2 trained personnel with suitable instruments; Tier 3 only with supervisor approval + LOTO; ambiguous steps go to higher-risk tier'
);
INSERT INTO public.safety_procedure (equipment_class_id, hazard, requirement, scope_type, source_id)
SELECT NULL::text, 'AI/retrieval caution', 'Similarity scores or retrieved cases never authorise repairs', 'Project rule', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.safety_procedure x
  WHERE x.equipment_class_id IS NOT DISTINCT FROM NULL::text
    AND x.hazard = 'AI/retrieval caution'
    AND x.requirement = 'Similarity scores or retrieved cases never authorise repairs'
);

INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'bearing housing lip seals/isolators', 'Supports shaft and carries radial/axial load', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'bearing housing lip seals/isolators' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Bearing set', 'Supports shaft and carries radial/axial load', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Housing Seal Failure; Bearing Wear | Associated cases: CASE-PUMP-007; CASE-PUMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Bearing set' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Housing Seal Failure; Bearing Wear | Associated cases: CASE-PUMP-007; CASE-PUMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Bearing/seal as required', 'Supports shaft and carries radial/axial load', 'Associated equipment: Centrifugal Pump | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-PUMP-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Bearing/seal as required' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-PUMP-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'bearings', 'Supports shaft and carries radial/axial load', 'Associated equipment: Centrifugal Pump | Associated failure modes: Low-Flow Recirculation; Shaft Fatigue Fracture | Associated cases: CASE-PUMP-015; CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'bearings' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Low-Flow Recirculation; Shaft Fatigue Fracture | Associated cases: CASE-PUMP-015; CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Coupling element', 'Transmits torque between machines', 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Coupling element' AND x.function IS NOT DISTINCT FROM 'Transmits torque between machines'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'coupling element if worn', 'Transmits torque between machines', 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'coupling element if worn' AND x.function IS NOT DISTINCT FROM 'Transmits torque between machines'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'elastomers/O-rings', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'elastomers/O-rings' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Foot valve', 'Controls flow/pressure', 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime | Associated cases: CASE-PUMP-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Foot valve' AND x.function IS NOT DISTINCT FROM 'Controls flow/pressure'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime | Associated cases: CASE-PUMP-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'foundation bolt set', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'foundation bolt set' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'gasket', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Strainer Blockage | Associated cases: CASE-PUMP-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'gasket' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Strainer Blockage | Associated cases: CASE-PUMP-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'gaskets', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime; Bearing Wear; Cavitation; GAP - no FMEA_Taxonomy entry; Impeller / Wear Ring Wear; Seal Face Leakage | Associated cases: CASE-PUMP-002; CASE-PUMP-005; CASE-PUMP-007; CASE-PUMP-008; CASE-PUMP-010; CASE-PUMP-013; CASE-PUMP-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'gaskets' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime; Bearing Wear; Cavitation; GAP - no FMEA_Taxonomy entry; Impeller / Wear Ring Wear; Seal Face Leakage | Associated cases: CASE-PUMP-002; CASE-PUMP-005; CASE-PUMP-007; CASE-PUMP-008; CASE-PUMP-010; CASE-PUMP-013; CASE-PUMP-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'gaskets as required', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'gaskets as required' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'gland packing/seal', 'Prevents leakage / excludes contaminants', 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime | Associated cases: CASE-PUMP-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'gland packing/seal' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime | Associated cases: CASE-PUMP-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'hub bolts', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'hub bolts' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Impeller', 'Transfers energy to the liquid', 'Associated equipment: Centrifugal Pump | Associated failure modes: Cavitation; Impeller / Wear Ring Wear | Associated cases: CASE-PUMP-005; CASE-PUMP-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Impeller' AND x.function IS NOT DISTINCT FROM 'Transfers energy to the liquid'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Cavitation; Impeller / Wear Ring Wear | Associated cases: CASE-PUMP-005; CASE-PUMP-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Impeller (if wrong trim)', 'Transfers energy to the liquid', 'Associated equipment: Centrifugal Pump | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-PUMP-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Impeller (if wrong trim)' AND x.function IS NOT DISTINCT FROM 'Transfers energy to the liquid'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-PUMP-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Impeller if damaged', 'Transfers energy to the liquid', 'Associated equipment: Centrifugal Pump | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-PUMP-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Impeller if damaged' AND x.function IS NOT DISTINCT FROM 'Transfers energy to the liquid'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-PUMP-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'impeller key', 'Transfers energy to the liquid', 'Associated equipment: Centrifugal Pump | Associated failure modes: Shaft Fatigue Fracture | Associated cases: CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'impeller key' AND x.function IS NOT DISTINCT FROM 'Transfers energy to the liquid'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Shaft Fatigue Fracture | Associated cases: CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'keys', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'keys' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'lip seals/isolators', 'Prevents leakage / excludes contaminants', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Housing Seal Failure | Associated cases: CASE-PUMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'lip seals/isolators' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Housing Seal Failure | Associated cases: CASE-PUMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'lubricant per OEM', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'lubricant per OEM' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Mechanical seal cartridge or face set', 'Prevents leakage / excludes contaminants', 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Mechanical seal cartridge or face set' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'O-rings/elastomers in compatible material', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'O-rings/elastomers in compatible material' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'oil', 'Lubrication/cooling', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'oil' AND x.function IS NOT DISTINCT FROM 'Lubrication/cooling'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'oiler/level glass', 'Lubrication/cooling', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'oiler/level glass' AND x.function IS NOT DISTINCT FROM 'Lubrication/cooling'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'priming accessories', 'Function per OEM documentation', 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime | Associated cases: CASE-PUMP-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'priming accessories' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Air Ingress / Loss of Prime | Associated cases: CASE-PUMP-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Rolling element bearing set', 'Supports shaft and carries radial/axial load', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Rolling element bearing set' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Wear | Associated cases: CASE-PUMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Seal', 'Prevents leakage / excludes contaminants', 'Associated equipment: Centrifugal Pump | Associated failure modes: Low-Flow Recirculation; Shaft Fatigue Fracture | Associated cases: CASE-PUMP-015; CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Seal' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Low-Flow Recirculation; Shaft Fatigue Fracture | Associated cases: CASE-PUMP-015; CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'seal cartridge if damaged', 'Prevents leakage / excludes contaminants', 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'seal cartridge if damaged' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Shaft', 'Transmits torque', 'Associated equipment: Centrifugal Pump | Associated failure modes: Shaft Fatigue Fracture | Associated cases: CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Shaft' AND x.function IS NOT DISTINCT FROM 'Transmits torque'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Shaft Fatigue Fracture | Associated cases: CASE-PUMP-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'shaft if damaged', 'Transmits torque', 'Associated equipment: Centrifugal Pump | Associated failure modes: Low-Flow Recirculation | Associated cases: CASE-PUMP-015 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'shaft if damaged' AND x.function IS NOT DISTINCT FROM 'Transmits torque'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Low-Flow Recirculation | Associated cases: CASE-PUMP-015 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'shaft sleeve', 'Transmits torque', 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'shaft sleeve' AND x.function IS NOT DISTINCT FROM 'Transmits torque'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Seal Face Leakage | Associated cases: CASE-PUMP-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'shaft sleeve if scored', 'Transmits torque', 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Housing Seal Failure | Associated cases: CASE-PUMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'shaft sleeve if scored' AND x.function IS NOT DISTINCT FROM 'Transmits torque'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Bearing Housing Seal Failure | Associated cases: CASE-PUMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Shims', 'Alignment adjustment', 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Shims' AND x.function IS NOT DISTINCT FROM 'Alignment adjustment'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Coupling Misalignment | Associated cases: CASE-PUMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Strainer basket/element', 'Removes debris from suction flow', 'Associated equipment: Centrifugal Pump | Associated failure modes: Strainer Blockage | Associated cases: CASE-PUMP-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Strainer basket/element' AND x.function IS NOT DISTINCT FROM 'Removes debris from suction flow'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Strainer Blockage | Associated cases: CASE-PUMP-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'wear rings', 'Limits internal leakage across impeller', 'Associated equipment: Centrifugal Pump | Associated failure modes: Cavitation; GAP - no FMEA_Taxonomy entry; Impeller / Wear Ring Wear | Associated cases: CASE-PUMP-005; CASE-PUMP-010; CASE-PUMP-011; CASE-PUMP-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'wear rings' AND x.function IS NOT DISTINCT FROM 'Limits internal leakage across impeller'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Centrifugal Pump | Associated failure modes: Cavitation; GAP - no FMEA_Taxonomy entry; Impeller / Wear Ring Wear | Associated cases: CASE-PUMP-005; CASE-PUMP-010; CASE-PUMP-011; CASE-PUMP-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Airend', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Rotor Wear / Clearance Increase | Associated cases: CASE-COMP-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Airend' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Rotor Wear / Clearance Increase | Associated cases: CASE-COMP-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Bearings', 'Supports shaft and carries radial/axial load', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Air End Bearing Failure | Associated cases: CASE-COMP-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Bearings' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Air End Bearing Failure | Associated cases: CASE-COMP-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Bolts', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Bolts' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Cooler', 'Rejects heat from oil/air', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Cooler Fouling | Associated cases: CASE-COMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Cooler' AND x.function IS NOT DISTINCT FROM 'Rejects heat from oil/air'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Cooler Fouling | Associated cases: CASE-COMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Coupling element', 'Transmits torque between machines', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Coupling element' AND x.function IS NOT DISTINCT FROM 'Transmits torque between machines'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Drain valve', 'Controls flow/pressure', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Condensate Drain Blockage | Associated cases: CASE-COMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Drain valve' AND x.function IS NOT DISTINCT FROM 'Controls flow/pressure'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Condensate Drain Blockage | Associated cases: CASE-COMP-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'filter', 'Removes contaminants from air/oil', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Cooler Fouling | Associated cases: CASE-COMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'filter' AND x.function IS NOT DISTINCT FROM 'Removes contaminants from air/oil'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Cooler Fouling | Associated cases: CASE-COMP-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'gaskets', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Separator Element Clogging | Associated cases: CASE-COMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'gaskets' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Separator Element Clogging | Associated cases: CASE-COMP-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Intake filter', 'Removes contaminants from air/oil', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Clogged Air Filter | Associated cases: CASE-COMP-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Intake filter' AND x.function IS NOT DISTINCT FROM 'Removes contaminants from air/oil'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Clogged Air Filter | Associated cases: CASE-COMP-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'MPV kit', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Minimum Pressure Valve Leakage / Sticking | Associated cases: CASE-COMP-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'MPV kit' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Minimum Pressure Valve Leakage / Sticking | Associated cases: CASE-COMP-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT '', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = '' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
-- M09: 'None typically' removed. It is workbook text meaning 'no spare normally needed', not a spare part.
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'oil', 'Lubrication/cooling', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Cooler Fouling; Separator Element Clogging | Associated cases: CASE-COMP-001; CASE-COMP-003; CASE-COMP-005 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'oil' AND x.function IS NOT DISTINCT FROM 'Lubrication/cooling'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Cooler Fouling; Separator Element Clogging | Associated cases: CASE-COMP-001; CASE-COMP-003; CASE-COMP-005 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'pads', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'pads' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Pressure transmitter', 'Measures pressure for control', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Pressure transmitter' AND x.function IS NOT DISTINCT FROM 'Measures pressure for control'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-COMP-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'seals', 'Prevents leakage / excludes contaminants', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Air End Bearing Failure | Associated cases: CASE-COMP-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'seals' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Air End Bearing Failure | Associated cases: CASE-COMP-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Separator element', 'Separates oil from compressed air', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Separator Element Clogging | Associated cases: CASE-COMP-001; CASE-COMP-005 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Separator element' AND x.function IS NOT DISTINCT FROM 'Separates oil from compressed air'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Separator Element Clogging | Associated cases: CASE-COMP-001; CASE-COMP-005 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Solenoid coil/valve', 'Controls flow/pressure', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Solenoid Valve Failure | Associated cases: CASE-COMP-015 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Solenoid coil/valve' AND x.function IS NOT DISTINCT FROM 'Controls flow/pressure'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Solenoid Valve Failure | Associated cases: CASE-COMP-015 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Thermostatic element', 'Function per OEM documentation', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Thermostatic Valve Sticking | Associated cases: CASE-COMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Thermostatic element' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Thermostatic Valve Sticking | Associated cases: CASE-COMP-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Valve kit', 'Controls flow/pressure', 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Unloader Valve Sticking | Associated cases: CASE-COMP-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Valve kit' AND x.function IS NOT DISTINCT FROM 'Controls flow/pressure'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Rotary Screw Air Compressor | Associated failure modes: Unloader Valve Sticking | Associated cases: CASE-COMP-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'As required', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'As required' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-007 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Balance weights', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Rotor Imbalance | Associated cases: CASE-MOT-005 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Balance weights' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Rotor Imbalance | Associated cases: CASE-MOT-005 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Bearing', 'Supports shaft and carries radial/axial load', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Overheating (Lubrication Failure) | Associated cases: CASE-MOT-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Bearing' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Overheating (Lubrication Failure) | Associated cases: CASE-MOT-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Bearings', 'Supports shaft and carries radial/axial load', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Air-Gap Eccentricity / Rotor-Stator Rub; Bearing Overheating (Lubrication Failure); Rotor Imbalance | Associated cases: CASE-MOT-002; CASE-MOT-005; CASE-MOT-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Bearings' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Air-Gap Eccentricity / Rotor-Stator Rub; Bearing Overheating (Lubrication Failure); Rotor Imbalance | Associated cases: CASE-MOT-002; CASE-MOT-005; CASE-MOT-014 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'bolts', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Soft Foot / Mechanical Looseness | Associated cases: CASE-MOT-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'bolts' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Soft Foot / Mechanical Looseness | Associated cases: CASE-MOT-013 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'cable', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'cable' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'contactor', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Single-Phasing (Phase Loss) | Associated cases: CASE-MOT-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'contactor' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Single-Phasing (Phase Loss) | Associated cases: CASE-MOT-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'cowl', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Cooling Airflow Blockage | Associated cases: CASE-MOT-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'cowl' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Cooling Airflow Blockage | Associated cases: CASE-MOT-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Encoder', 'Speed/position feedback', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Encoder' AND x.function IS NOT DISTINCT FROM 'Speed/position feedback'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-010 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Fan', 'Provides cooling airflow', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Cooling Airflow Blockage | Associated cases: CASE-MOT-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Fan' AND x.function IS NOT DISTINCT FROM 'Provides cooling airflow'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Cooling Airflow Blockage | Associated cases: CASE-MOT-012 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Fan/cowl if damaged', 'Provides cooling airflow', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Cooling Airflow Blockage | Associated cases: CASE-MOT-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Fan/cowl if damaged' AND x.function IS NOT DISTINCT FROM 'Provides cooling airflow'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Cooling Airflow Blockage | Associated cases: CASE-MOT-003 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Fuse', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Single-Phasing (Phase Loss) | Associated cases: CASE-MOT-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Fuse' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Single-Phasing (Phase Loss) | Associated cases: CASE-MOT-008 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'grease', 'Bearing lubrication', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Overheating (Lubrication Failure) | Associated cases: CASE-MOT-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'grease' AND x.function IS NOT DISTINCT FROM 'Bearing lubrication'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Overheating (Lubrication Failure) | Associated cases: CASE-MOT-006 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'grease per OEM', 'Bearing lubrication', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Overheating (Lubrication Failure) | Associated cases: CASE-MOT-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'grease per OEM' AND x.function IS NOT DISTINCT FROM 'Bearing lubrication'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Overheating (Lubrication Failure) | Associated cases: CASE-MOT-002 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'grounding ring', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Electrical Discharge Damage (Fluting) | Associated cases: CASE-MOT-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'grounding ring' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Electrical Discharge Damage (Fluting) | Associated cases: CASE-MOT-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'hardware', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Loose Electrical Connection | Associated cases: CASE-MOT-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'hardware' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Loose Electrical Connection | Associated cases: CASE-MOT-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'heater', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'heater' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Insulated bearing', 'Supports shaft and carries radial/axial load', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Electrical Discharge Damage (Fluting) | Associated cases: CASE-MOT-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Insulated bearing' AND x.function IS NOT DISTINCT FROM 'Supports shaft and carries radial/axial load'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Bearing Electrical Discharge Damage (Fluting) | Associated cases: CASE-MOT-016 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Lugs', 'Electrical termination', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Loose Electrical Connection | Associated cases: CASE-MOT-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Lugs' AND x.function IS NOT DISTINCT FROM 'Electrical termination'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Loose Electrical Connection | Associated cases: CASE-MOT-011 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Overload relay if faulty', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Overload relay if faulty' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry | Associated cases: CASE-MOT-004 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Rewind kit/motor', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Rewind kit/motor' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Rotor', 'Rotating member of machine', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Broken Rotor Bar | Associated cases: CASE-MOT-015 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Rotor' AND x.function IS NOT DISTINCT FROM 'Rotating member of machine'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Broken Rotor Bar | Associated cases: CASE-MOT-015 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Seals', 'Prevents leakage / excludes contaminants', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Seals' AND x.function IS NOT DISTINCT FROM 'Prevents leakage / excludes contaminants'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-009 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'Shims', 'Alignment adjustment', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry; Soft Foot / Mechanical Looseness | Associated cases: CASE-MOT-013; CASE-MOT-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'Shims' AND x.function IS NOT DISTINCT FROM 'Alignment adjustment'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: GAP - no FMEA_Taxonomy entry; Soft Foot / Mechanical Looseness | Associated cases: CASE-MOT-013; CASE-MOT-017 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);
INSERT INTO public.spare_part_reference (part_name, function, compatibility_note, source_id)
SELECT 'terminal gaskets', 'Function per OEM documentation', 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)', 'S14'
WHERE NOT EXISTS (
  SELECT 1 FROM public.spare_part_reference x
  WHERE x.part_name = 'terminal gaskets' AND x.function IS NOT DISTINCT FROM 'Function per OEM documentation'
    AND x.compatibility_note IS NOT DISTINCT FROM 'Associated equipment: Three-Phase Induction Motor | Associated failure modes: Insulation Breakdown | Associated cases: CASE-MOT-001 | Compatibility: Not assigned - part number and compatibility must come from OEM parts list | Workbook source note: S14 (no OEM parts catalogue consulted)'
);

SELECT 'safety_procedure' AS table_name, COUNT(*) AS total_rows FROM public.safety_procedure
UNION ALL
SELECT 'spare_part_reference', COUNT(*) FROM public.spare_part_reference
ORDER BY table_name;
COMMIT;
