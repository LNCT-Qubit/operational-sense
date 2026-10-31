
BEGIN;

SET LOCAL app.current_org_id =
'b2a7dce7-b449-4381-ba3b-b520f2c88c2e';

-- 1. Total assets and root assets
SELECT
    COUNT(*) AS total_assets,
    COUNT(*) FILTER (
        WHERE parent_asset_id IS NULL
    ) AS root_assets,
    COUNT(*) FILTER (
        WHERE parent_asset_id IS NOT NULL
    ) AS child_assets
FROM asset_node;

-- 2. Assets grouped by hierarchy level
SELECT
    asset_level,
    COUNT(*) AS asset_count
FROM asset_node
GROUP BY asset_level
ORDER BY asset_level;

-- 3. Assets whose parent belongs to another organization
SELECT COUNT(*) AS cross_organization_parent_links
FROM asset_node child
JOIN asset_node parent
    ON parent.asset_id = child.parent_asset_id
WHERE child.organization_id <> parent.organization_id;

-- 4. Assets with a blank hierarchy path
SELECT COUNT(*) AS missing_hierarchy_paths
FROM asset_node
WHERE hierarchy_path IS NULL
   OR BTRIM(hierarchy_path) = '';

-- 5. Assets with a blank status or name
SELECT COUNT(*) AS invalid_asset_records
FROM asset_node
WHERE BTRIM(asset_name) = ''
   OR BTRIM(status) = ''
   OR BTRIM(asset_level) = '';

COMMIT;

