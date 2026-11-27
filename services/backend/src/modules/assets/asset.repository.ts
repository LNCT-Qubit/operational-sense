import { withTenant, type PoolLike, type Queryable } from '../../database/tenant';
import type { AssetListFilter, AssetNodeRow, AssetStore, CreateAssetInput, PatchAssetInput } from './asset.types';

const ASSET_COLUMNS = `
  asset_id, organization_id, parent_asset_id, asset_level, asset_name,
  equipment_class_id, equipment_model_id, model_label, model_is_illustrative,
  site_identifier, status, hierarchy_path
`;

function mapAssetRow(r: any): AssetNodeRow {
  return {
    asset_id: Number(r.asset_id),
    organization_id: r.organization_id,
    parent_asset_id: r.parent_asset_id == null ? null : Number(r.parent_asset_id),
    asset_level: r.asset_level,
    asset_name: r.asset_name,
    equipment_class_id: r.equipment_class_id ?? null,
    equipment_model_id: r.equipment_model_id ?? null,
    model_label: r.model_label ?? null,
    model_is_illustrative: r.model_is_illustrative === true,
    site_identifier: r.site_identifier ?? null,
    status: r.status,
    hierarchy_path: r.hierarchy_path ?? null,
  };
}

async function auditAsset(
  db: Queryable,
  org: string,
  actor: string,
  action: string,
  assetId: number,
  details: Record<string, unknown>,
): Promise<void> {
  await db.query(
    'INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [org, actor, action, 'asset_node', String(assetId), JSON.stringify(details)],
  );
}

export class PostgresAssetStore implements AssetStore {
  constructor(private readonly pool: PoolLike) {}

  createAsset(organizationId: string, actorId: string, input: CreateAssetInput) {
    return withTenant(this.pool, organizationId, async (db) => {
      const ins = await db.query(
        `INSERT INTO asset_node (
           organization_id, parent_asset_id, asset_level, asset_name,
           equipment_class_id, equipment_model_id, model_label, model_is_illustrative,
           site_identifier, status, hierarchy_path
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${ASSET_COLUMNS}`,
        [
          organizationId,
          input.parentAssetId ?? null,
          input.assetLevel,
          input.assetName,
          input.equipmentClassId ?? null,
          input.equipmentModelId ?? null,
          input.modelLabel ?? null,
          input.modelIsIllustrative ?? false,
          input.siteIdentifier ?? null,
          input.status ?? 'PENDING_REVIEW',
          input.hierarchyPath ?? null,
        ],
      );

      const row = mapAssetRow(ins.rows[0]);
      await auditAsset(db, organizationId, actorId, 'ASSET_CREATED', row.asset_id, {
        asset_level: row.asset_level,
        asset_name: row.asset_name,
      });
      return row;
    });
  }

  listAssets(organizationId: string, filter: AssetListFilter) {
    return withTenant(this.pool, organizationId, async (db) => {
      const searchPattern = filter.q ? `%${filter.q}%` : null;
      const whereSql = `
        WHERE organization_id = $1
          AND ($2::boolean = TRUE OR status <> 'RETIRED')
          AND ($3::bigint IS NULL OR parent_asset_id = $3)
          AND ($4::text IS NULL OR asset_level = $4)
          AND ($5::text IS NULL OR equipment_class_id = $5)
          AND ($6::text IS NULL OR status = $6)
          AND ($7::text IS NULL OR asset_name ILIKE $7 OR site_identifier ILIKE $7 OR hierarchy_path ILIKE $7)
      `;
      const baseParams = [
        organizationId,
        filter.includeRetired ?? false,
        filter.parentAssetId ?? null,
        filter.assetLevel ?? null,
        filter.equipmentClassId ?? null,
        filter.status ?? null,
        searchPattern,
      ];

      const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM asset_node ${whereSql}`, baseParams);
      const total = Number(countRes.rows[0]?.total ?? 0);

      const rowsRes = await db.query(
        `SELECT ${ASSET_COLUMNS}
           FROM asset_node
           ${whereSql}
          ORDER BY asset_id ASC
          LIMIT $8 OFFSET $9`,
        [...baseParams, filter.limit, filter.offset],
      );
      return { items: rowsRes.rows.map(mapAssetRow), total };
    });
  }

  getAsset(organizationId: string, assetId: number) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT ${ASSET_COLUMNS}
           FROM asset_node
          WHERE organization_id = $1 AND asset_id = $2 AND status <> 'RETIRED'`,
        [organizationId, assetId],
      );
      return res.rows[0] ? mapAssetRow(res.rows[0]) : null;
    });
  }

  patchAsset(organizationId: string, actorId: string, assetId: number, patch: PatchAssetInput) {
    return withTenant(this.pool, organizationId, async (db) => {
      const sets: string[] = [];
      const values: unknown[] = [organizationId, assetId];
      const push = (col: string, val: unknown) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };

      const fieldMap: Array<[keyof PatchAssetInput, string]> = [
        ['parentAssetId', 'parent_asset_id'],
        ['assetLevel', 'asset_level'],
        ['assetName', 'asset_name'],
        ['equipmentClassId', 'equipment_class_id'],
        ['equipmentModelId', 'equipment_model_id'],
        ['modelLabel', 'model_label'],
        ['modelIsIllustrative', 'model_is_illustrative'],
        ['siteIdentifier', 'site_identifier'],
        ['status', 'status'],
        ['hierarchyPath', 'hierarchy_path'],
      ];

      for (const [prop, col] of fieldMap) {
        if (patch[prop] !== undefined) push(col, patch[prop]);
      }

      const up = await db.query(
        `UPDATE asset_node
            SET ${sets.join(', ')}
          WHERE organization_id = $1 AND asset_id = $2 AND status <> 'RETIRED'
          RETURNING ${ASSET_COLUMNS}`,
        values,
      );
      if (!up.rows[0]) return null;

      await auditAsset(db, organizationId, actorId, 'ASSET_UPDATED', assetId, {
        updated_fields: Object.keys(patch),
      });
      return mapAssetRow(up.rows[0]);
    });
  }

  retireAsset(organizationId: string, actorId: string, assetId: number) {
    return withTenant(this.pool, organizationId, async (db) => {
      const up = await db.query(
        `UPDATE asset_node
            SET status = 'RETIRED'
          WHERE organization_id = $1 AND asset_id = $2 AND status <> 'RETIRED'
          RETURNING asset_id`,
        [organizationId, assetId],
      );
      if (!up.rows[0]) return false;

      await auditAsset(db, organizationId, actorId, 'ASSET_RETIRED', assetId, {});
      return true;
    });
  }
}
