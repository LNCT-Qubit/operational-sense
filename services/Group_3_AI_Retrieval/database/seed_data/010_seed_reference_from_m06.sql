-- 010_seed_reference_from_m06.sql
-- Generated from M06 v2.0 seed CSVs (source: Group 1 Equipment_Reference).
-- All rows stay PENDING_REVIEW: nothing here is domain-approved.
-- Subsystem IDs do not exist in the source; they are generated here and are provisional.
-- Safe to re-run (conflicts are skipped).

BEGIN;

INSERT INTO equipment_class (equipment_class_id, class_name, description, review_status, source_sheet, source_row_number) VALUES
  ('EQ-PUMP', 'Centrifugal Pump', 'Rotodynamic machine that adds energy to a liquid via an impeller.', 'PENDING_REVIEW', 'Equipment_Reference', 2),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'AC machine converting electrical to mechanical energy via rotating magnetic field.', 'PENDING_REVIEW', 'Equipment_Reference', 12),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Positive-displacement compressor using meshing screw rotors, usually oil-flooded.', 'PENDING_REVIEW', 'Equipment_Reference', 22)
ON CONFLICT (equipment_class_id) DO NOTHING;

INSERT INTO m06_equipment_component_reference (equipment_class_id, equipment_class, subsystem_assembly, subsystem_id_source_value, component_maintainable_item, taxonomy_code, source_sheet, source_row_number, model_information_note, review_status) VALUES
  ('EQ-PUMP', 'Centrifugal Pump', 'Bearing Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Rolling Element Bearing', 'PUMP.BRNG.ROLL', 'Equipment_Reference', 2, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Mechanical Seal', 'Not defined in taxonomy (no subsystem ID)', 'Seal Faces (Rotating / Stationary)', 'PUMP.SEAL.FACE', 'Equipment_Reference', 3, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Hydraulic End', 'Not defined in taxonomy (no subsystem ID)', 'Impeller', 'PUMP.HYDR.IMPL', 'Equipment_Reference', 4, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Hydraulic End', 'Not defined in taxonomy (no subsystem ID)', 'Impeller and Wear Rings', 'PUMP.HYDR.WEAR', 'Equipment_Reference', 5, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Drive Train', 'Not defined in taxonomy (no subsystem ID)', 'Flexible Coupling', 'PUMP.DRVT.CPLG', 'Equipment_Reference', 6, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Suction Line', 'Not defined in taxonomy (no subsystem ID)', 'Suction Strainer', 'PUMP.SUCT.STRN', 'Equipment_Reference', 7, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Shaft Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Pump Shaft', 'PUMP.SHFT.SHAF', 'Equipment_Reference', 8, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Suction and Priming', 'Not defined in taxonomy (no subsystem ID)', 'Suction Line Joints and Gland Seal Interface', 'PUMP.SUCT.PRIM', 'Equipment_Reference', 9, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Hydraulic End', 'Not defined in taxonomy (no subsystem ID)', 'Impeller and Casing Volute', 'PUMP.HYDR.RECR', 'Equipment_Reference', 10, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-PUMP', 'Centrifugal Pump', 'Bearing Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Bearing Housing Isolators / Lip Seals', 'PUMP.BRNG.SEAL', 'Equipment_Reference', 11, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Stator & Windings', 'Not defined in taxonomy (no subsystem ID)', 'Winding Insulation (Copper Magnet Wire and Varnish)', 'ELEC.MOT.STAT', 'Equipment_Reference', 12, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Bearing Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Drive-End Bearing and Grease', 'ELEC.MOT.BRNG', 'Equipment_Reference', 13, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Rotor Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Squirrel-Cage Rotor Bars and End Rings', 'ELEC.MOT.ROTR', 'Equipment_Reference', 14, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Cooling System', 'Not defined in taxonomy (no subsystem ID)', 'Cooling Fan and Cowl', 'ELEC.MOT.COOL', 'Equipment_Reference', 15, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Terminal Box', 'Not defined in taxonomy (no subsystem ID)', 'Terminal Lugs and Connections', 'ELEC.MOT.TERM', 'Equipment_Reference', 16, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Mounting and Foundation', 'Not defined in taxonomy (no subsystem ID)', 'Motor Feet and Foundation Bolts', 'ELEC.MOT.FEET', 'Equipment_Reference', 17, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Power Supply', 'Not defined in taxonomy (no subsystem ID)', 'Supply Phase Conductors, Fuses and Contactor', 'ELEC.MOT.SUPP', 'Equipment_Reference', 18, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Bearing Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Bearing (Inverter-Fed Shaft Currents)', 'ELEC.MOT.BRDC', 'Equipment_Reference', 19, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Rotor-Stator Interface', 'Not defined in taxonomy (no subsystem ID)', 'Air Gap (Rotor and Stator Core)', 'ELEC.MOT.AGAP', 'Equipment_Reference', 20, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-MOTOR', 'Three-Phase Induction Motor', 'Rotor Assembly', 'Not defined in taxonomy (no subsystem ID)', 'Rotor Core and Shaft', 'ELEC.MOT.IMBL', 'Equipment_Reference', 21, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Air End', 'Not defined in taxonomy (no subsystem ID)', 'Rotor Screws (Male / Female)', 'COMP.AEND.ROTR', 'Equipment_Reference', 22, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Oil Separation System', 'Not defined in taxonomy (no subsystem ID)', 'Oil Separator Element', 'COMP.OSEP.ELEM', 'Equipment_Reference', 23, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Air Intake', 'Not defined in taxonomy (no subsystem ID)', 'Intake Air Filter', 'COMP.INTK.FILT', 'Equipment_Reference', 24, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Cooling System', 'Not defined in taxonomy (no subsystem ID)', 'Oil Cooler / Aftercooler', 'COMP.COOL.COLR', 'Equipment_Reference', 25, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Capacity Control', 'Not defined in taxonomy (no subsystem ID)', 'Inlet / Unloader Valve', 'COMP.VALV.UNL', 'Equipment_Reference', 26, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Air-Oil Circuit', 'Not defined in taxonomy (no subsystem ID)', 'Minimum Pressure Valve', 'COMP.VALV.MPV', 'Equipment_Reference', 27, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Air End', 'Not defined in taxonomy (no subsystem ID)', 'Air End Bearings', 'COMP.AEND.BRNG', 'Equipment_Reference', 28, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Oil System', 'Not defined in taxonomy (no subsystem ID)', 'Thermostatic (Temperature Control) Valve', 'COMP.OILS.THRM', 'Equipment_Reference', 29, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Capacity Control', 'Not defined in taxonomy (no subsystem ID)', 'Solenoid Valve (Load / Unload)', 'COMP.VALV.SOL', 'Equipment_Reference', 30, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW'),
  ('EQ-COMP', 'Rotary Screw Air Compressor', 'Condensate Management', 'Not defined in taxonomy (no subsystem ID)', 'Automatic Condensate Drain', 'COMP.COND.DRN', 'Equipment_Reference', 31, 'No real model documented; seed models are illustrative only', 'PENDING_REVIEW')
ON CONFLICT DO NOTHING;

-- Subsystems = distinct subsystem names in the M06 reference (provisional list)
INSERT INTO subsystem (subsystem_name, review_status)
SELECT DISTINCT btrim(subsystem_assembly), 'PENDING_REVIEW'
FROM m06_equipment_component_reference
ON CONFLICT (subsystem_name) DO NOTHING;

-- Which subsystem belongs to which class
INSERT INTO class_subsystem (equipment_class_id, subsystem_id)
SELECT DISTINCT r.equipment_class_id, s.subsystem_id
FROM m06_equipment_component_reference r
JOIN subsystem s ON s.subsystem_name = btrim(r.subsystem_assembly)
ON CONFLICT DO NOTHING;

COMMIT;
