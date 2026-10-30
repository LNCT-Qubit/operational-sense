-- Expected: zero rows. The FK should reject new orphan references; this query audits existing data.
SELECT child.asset_id, child.parent_asset_id
FROM public.asset_node AS child
LEFT JOIN public.asset_node AS parent ON parent.asset_id = child.parent_asset_id
WHERE child.parent_asset_id IS NOT NULL
  AND parent.asset_id IS NULL;
