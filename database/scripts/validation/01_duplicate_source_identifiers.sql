-- Expected: no rows for either query. PK/UNIQUE constraints should also enforce these rules.
SELECT equipment_class_id, COUNT(*) AS occurrences
FROM public.equipment_class
GROUP BY equipment_class_id
HAVING COUNT(*) > 1;

SELECT source_sheet, source_row_number, COUNT(*) AS occurrences
FROM public.m06_equipment_component_reference
GROUP BY source_sheet, source_row_number
HAVING COUNT(*) > 1;

-- Diagnostic only: duplicate labels are not constrained because uniqueness semantics are open.
SELECT parent_asset_id, asset_level, asset_name, COUNT(*) AS occurrences
FROM public.asset_node
GROUP BY parent_asset_id, asset_level, asset_name
HAVING COUNT(*) > 1;
