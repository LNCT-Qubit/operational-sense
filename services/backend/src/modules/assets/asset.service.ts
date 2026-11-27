import { notFound } from '../../http/errors';
import type { AuthContext } from '../../middleware/auth';
import type { AssetListFilter, AssetStore, CreateAssetInput, PatchAssetInput } from './asset.types';

export class AssetService {
  constructor(private readonly store: AssetStore) {}

  create(ctx: AuthContext, input: CreateAssetInput) {
    return this.store.createAsset(ctx.organizationId, ctx.userId, input);
  }

  list(ctx: AuthContext, filter: AssetListFilter) {
    return this.store.listAssets(ctx.organizationId, filter);
  }

  async get(ctx: AuthContext, assetId: number) {
    const item = await this.store.getAsset(ctx.organizationId, assetId);
    if (!item) throw notFound('Asset not found.', 'ASSET_NOT_FOUND');
    return item;
  }

  async patch(ctx: AuthContext, assetId: number, patch: PatchAssetInput) {
    const updated = await this.store.patchAsset(ctx.organizationId, ctx.userId, assetId, patch);
    if (!updated) throw notFound('Asset not found.', 'ASSET_NOT_FOUND');
    return updated;
  }

  async remove(ctx: AuthContext, assetId: number) {
    const retired = await this.store.retireAsset(ctx.organizationId, ctx.userId, assetId);
    if (!retired) throw notFound('Asset not found.', 'ASSET_NOT_FOUND');
  }
}
