-- $1 is the root asset_id. Path tracking bounds traversal if data was corrupted
-- outside the trigger (e.g., by privileged maintenance).
WITH RECURSIVE descendants AS (
    SELECT a.asset_id, a.parent_asset_id, a.asset_level, a.asset_name,
           0 AS depth, ARRAY[a.asset_id]::BIGINT[] AS path
    FROM public.asset_node AS a
    WHERE a.asset_id = $1

    UNION ALL

    SELECT child.asset_id, child.parent_asset_id, child.asset_level, child.asset_name,
           parent.depth + 1, parent.path || child.asset_id
    FROM public.asset_node AS child
    JOIN descendants AS parent ON child.parent_asset_id = parent.asset_id
    WHERE NOT child.asset_id = ANY(parent.path)
)
SELECT asset_id, parent_asset_id, asset_level, asset_name, depth
FROM descendants
ORDER BY depth, asset_id;
