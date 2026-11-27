import { badRequest } from '../../http/errors';
import { compileValidator } from '../../http/validation';
import { isUuid } from '../../middleware/auth';
import type { CreateAssetInput, PatchAssetInput } from './asset.types';

const ASSET_PROPS = {
  parentAssetId: { type: ['integer', 'null'], minimum: 1 },
  assetLevel: { type: 'string', minLength: 1, maxLength: 100 },
  assetName: { type: 'string', minLength: 1, maxLength: 250 },
  equipmentClassId: { type: ['string', 'null'], maxLength: 100 },
  equipmentModelId: { type: ['string', 'null'] },
  modelLabel: { type: ['string', 'null'], maxLength: 250 },
  modelIsIllustrative: { type: 'boolean' },
  siteIdentifier: { type: ['string', 'null'], maxLength: 120 },
  status: { type: 'string', minLength: 1, maxLength: 60 },
  hierarchyPath: { type: ['string', 'null'], maxLength: 1000 },
};

const CREATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assetLevel', 'assetName'],
  properties: ASSET_PROPS,
};

const PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: ASSET_PROPS,
};

const checkCreateShape = compileValidator<CreateAssetInput>(CREATE_SCHEMA);
const checkPatchShape = compileValidator<PatchAssetInput>(PATCH_SCHEMA);

function checkNonBlank(value: string | undefined, field: string) {
  if (value !== undefined && !value.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [{ field, issue: 'must not be blank' }]);
  }
}

function checkModelUuid(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!isUuid(value)) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'equipmentModelId', issue: 'must be a valid UUID' },
    ]);
  }
  return value.toLowerCase();
}

export function validateCreateAsset(body: unknown): CreateAssetInput {
  const input = checkCreateShape(body);
  checkNonBlank(input.assetLevel, 'assetLevel');
  checkNonBlank(input.assetName, 'assetName');
  checkNonBlank(input.status, 'status');
  return {
    ...input,
    assetLevel: input.assetLevel.trim(),
    assetName: input.assetName.trim(),
    equipmentModelId: checkModelUuid(input.equipmentModelId),
    ...(input.status !== undefined ? { status: input.status.trim() } : {}),
  };
}

export function validatePatchAsset(body: unknown): PatchAssetInput {
  const input = checkPatchShape(body);
  checkNonBlank(input.assetLevel, 'assetLevel');
  checkNonBlank(input.assetName, 'assetName');
  checkNonBlank(input.status, 'status');
  const equipmentModelId = checkModelUuid(input.equipmentModelId);
  return {
    ...input,
    ...(input.assetLevel !== undefined ? { assetLevel: input.assetLevel.trim() } : {}),
    ...(input.assetName !== undefined ? { assetName: input.assetName.trim() } : {}),
    ...(input.status !== undefined ? { status: input.status.trim() } : {}),
    ...(equipmentModelId !== undefined ? { equipmentModelId } : {}),
  };
}

export function parseAssetListQuery(query: Record<string, unknown>) {
  let parentAssetId: number | undefined;
  if (query.parent_asset_id !== undefined && query.parent_asset_id !== '') {
    if (typeof query.parent_asset_id !== 'string' || !/^[1-9]\d*$/.test(query.parent_asset_id)) {
      throw badRequest('INVALID_QUERY', 'parent_asset_id must be a positive integer.');
    }
    parentAssetId = Number(query.parent_asset_id);
  }

  const strOpt = (val: unknown, name: string) => {
    if (val === undefined || val === '') return undefined;
    if (typeof val !== 'string' || val.length > 100) {
      throw badRequest('INVALID_QUERY', `${name} must be a string up to 100 characters.`);
    }
    return val.trim();
  };

  let includeRetired = false;
  if (query.include_retired !== undefined && query.include_retired !== '') {
    if (query.include_retired !== 'true' && query.include_retired !== 'false') {
      throw badRequest('INVALID_QUERY', 'include_retired must be "true" or "false".');
    }
    includeRetired = query.include_retired === 'true';
  }

  let q: string | undefined;
  if (query.q !== undefined && query.q !== '') {
    if (typeof query.q !== 'string' || query.q.length > 200) {
      throw badRequest('INVALID_QUERY', 'q must be a search string up to 200 characters.');
    }
    const trimmed = query.q.trim();
    if (trimmed) q = trimmed;
  }

  return {
    parentAssetId,
    assetLevel: strOpt(query.asset_level, 'asset_level'),
    equipmentClassId: strOpt(query.equipment_class_id, 'equipment_class_id'),
    status: strOpt(query.status, 'status'),
    includeRetired,
    q,
  };
}
