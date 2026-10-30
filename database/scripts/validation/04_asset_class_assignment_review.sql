-- Review query only, not an assertion: M04's hierarchy levels are not approved yet.
-- Returns records that need domain review once the canonical asset_level vocabulary is approved.
SELECT asset_id, parent_asset_id, asset_level, asset_name, equipment_class_id,
       CASE
         WHEN upper(asset_level) = 'EQUIPMENT' AND equipment_class_id IS NULL
           THEN 'EQUIPMENT_NODE_WITHOUT_CLASS'
         WHEN upper(asset_level) <> 'EQUIPMENT' AND equipment_class_id IS NOT NULL
           THEN 'NON_EQUIPMENT_NODE_WITH_CLASS'
       END AS review_reason
FROM public.asset_node
WHERE (upper(asset_level) = 'EQUIPMENT' AND equipment_class_id IS NULL)
   OR (upper(asset_level) <> 'EQUIPMENT' AND equipment_class_id IS NOT NULL)
ORDER BY asset_id;
