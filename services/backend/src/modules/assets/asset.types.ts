export interface AssetNodeRow {
  asset_id: number;
  organization_id: string;
  parent_asset_id: number | null;
  asset_level: string;
  asset_name: string;
  equipment_class_id: string | null;
  equipment_model_id: string | null;
  model_label: string | null;
  model_is_illustrative: boolean;
  site_identifier: string | null;
  status: string;
  hierarchy_path: string | null;
}

export interface CreateAssetInput {
  parentAssetId?: number | null;
  assetLevel: string;
  assetName: string;
  equipmentClassId?: string | null;
  equipmentModelId?: string | null;
  modelLabel?: string | null;
  modelIsIllustrative?: boolean;
  siteIdentifier?: string | null;
  status?: string;
  hierarchyPath?: string | null;
}

export type PatchAssetInput = Partial<CreateAssetInput>;

export interface AssetListFilter {
  limit: number;
  offset: number;
  parentAssetId?: number;
  assetLevel?: string;
  equipmentClassId?: string;
  status?: string;
  includeRetired?: boolean;
  q?: string;
}

export interface AssetStore {
  createAsset(organizationId: string, actorId: string, input: CreateAssetInput): Promise<AssetNodeRow>;
  listAssets(organizationId: string, filter: AssetListFilter): Promise<{ items: AssetNodeRow[]; total: number }>;
  getAsset(organizationId: string, assetId: number): Promise<AssetNodeRow | null>;
  patchAsset(organizationId: string, actorId: string, assetId: number, patch: PatchAssetInput): Promise<AssetNodeRow | null>;
  retireAsset(organizationId: string, actorId: string, assetId: number): Promise<boolean>;
}
