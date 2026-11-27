import { asyncHandler, type Handler } from '../../http/types';
import { parsePagination, requirePositiveIntParam } from '../../http/validation';
import { parseAssetListQuery, validateCreateAsset, validatePatchAsset } from './asset.validation';
import type { AssetService } from './asset.service';

export function createAssetHandlers(service: AssetService) {
  const create: Handler = asyncHandler(async (req, res) => {
    const input = validateCreateAsset(req.body);
    const asset = await service.create(req.auth!, input);
    res.setHeader('Location', `/api/v1/assets/${asset.asset_id}`);
    res.status(201).json({ asset });
  });

  const list: Handler = asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const filters = parseAssetListQuery(req.query);
    const result = await service.list(req.auth!, { limit, offset, ...filters });
    res.status(200).json({
      items: result.items,
      count: result.items.length,
      total: result.total,
      limit,
      offset,
    });
  });

  const get: Handler = asyncHandler(async (req, res) => {
    const assetId = requirePositiveIntParam(req.params.id, 'asset id');
    const asset = await service.get(req.auth!, assetId);
    res.status(200).json({ asset });
  });

  const patch: Handler = asyncHandler(async (req, res) => {
    const assetId = requirePositiveIntParam(req.params.id, 'asset id');
    const body = validatePatchAsset(req.body);
    const asset = await service.patch(req.auth!, assetId, body);
    res.status(200).json({ asset });
  });

  const remove: Handler = asyncHandler(async (req, res) => {
    const assetId = requirePositiveIntParam(req.params.id, 'asset id');
    await service.remove(req.auth!, assetId);
    res.status(200).json({ deleted: true, id: assetId });
  });

  return { create, list, get, patch, remove };
}
