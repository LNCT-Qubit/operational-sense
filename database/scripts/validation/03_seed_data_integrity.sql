-- Run after seed_m06_reference_data.sql. Expected: DO block succeeds.
DO $m06_validation$
DECLARE
    class_count INTEGER;
    reference_count INTEGER;
    missing_class_count INTEGER;
    inconsistent_class_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO class_count
    FROM public.equipment_class
    WHERE equipment_class_id IN ('EQ-PUMP', 'EQ-MOTOR', 'EQ-COMP');

    IF class_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 source-backed equipment classes; found %', class_count;
    END IF;

    SELECT COUNT(*) INTO reference_count
    FROM public.m06_equipment_component_reference
    WHERE source_sheet = 'Equipment_Reference';

    IF reference_count <> 30 THEN
        RAISE EXCEPTION 'Expected 30 Equipment_Reference mappings; found %', reference_count;
    END IF;

    SELECT COUNT(*) INTO missing_class_count
    FROM public.m06_equipment_component_reference r
    LEFT JOIN public.equipment_class c ON c.equipment_class_id = r.equipment_class_id
    WHERE c.equipment_class_id IS NULL;

    IF missing_class_count <> 0 THEN
        RAISE EXCEPTION 'Found % component-reference rows without a class', missing_class_count;
    END IF;

    SELECT COUNT(*) INTO inconsistent_class_count
    FROM public.m06_equipment_component_reference r
    JOIN public.equipment_class c ON c.equipment_class_id = r.equipment_class_id
    WHERE r.equipment_class IS DISTINCT FROM c.class_name;

    IF inconsistent_class_count <> 0 THEN
        RAISE EXCEPTION 'Found % component-reference rows whose class label differs from the class lookup', inconsistent_class_count;
    END IF;
END
$m06_validation$;

SELECT equipment_class_id, class_name, review_status, source_sheet, source_row_number
FROM public.equipment_class
WHERE equipment_class_id IN ('EQ-PUMP', 'EQ-MOTOR', 'EQ-COMP')
ORDER BY equipment_class_id;

SELECT equipment_class_id, COUNT(*) AS mapping_rows,
       COUNT(DISTINCT subsystem_assembly) AS distinct_subsystem_labels,
       COUNT(DISTINCT component_maintainable_item) AS distinct_component_labels
FROM public.m06_equipment_component_reference
GROUP BY equipment_class_id
ORDER BY equipment_class_id;
