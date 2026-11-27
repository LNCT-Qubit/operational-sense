
import { asyncHandler, type Handler } from '../../http/types';
import { badRequest } from '../../http/errors';
import { isUuid } from '../../middleware/auth';
import { CaseService } from './case.service';
import type {
  CaseStatus,
  CreateCaseInput,
  UpdateCaseInput,
  CaseReviewInput,
} from './case.types';

const caseId = (req: Parameters<Handler>[0]): string => {
  const id = req.params.id;

  if (!isUuid(id)) {
    throw badRequest('INVALID_ID', 'Case ID must be a valid UUID.');
  }

  return id.toLowerCase();
};

const validBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('INVALID_BODY', 'A valid JSON object is required.');
  }

  return body as Record<string, unknown>;
};

const numberParam = (
  value: unknown,
  fallback: number,
  max: number,
  min: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  ) {
    throw badRequest('INVALID_QUERY', 'Invalid pagination or filter value.');
  }

  return Number(value);
};

export function createCaseHandlers(service: CaseService) {
  const create: Handler = asyncHandler(async (req, res) => {
    const record = await service.create(
      req.auth!,
      validBody(req.body) as unknown as CreateCaseInput,
    );

    res.status(201).json({ case: record });
  });

  const get: Handler = asyncHandler(async (req, res) => {
    const record = await service.get(req.auth!, caseId(req));

    res.status(200).json({ case: record });
  });

  const list: Handler = asyncHandler(async (req, res) => {
    const status = req.query.status;

    if (
      status !== undefined &&
      (
        typeof status !== 'string' ||
        !['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'REVOKED'].includes(status)
      )
    ) {
      throw badRequest('INVALID_STATUS', 'Invalid case status.');
    }

    const equipmentClassId = req.query.equipment_class_id;

    if (
      equipmentClassId !== undefined &&
      (
        typeof equipmentClassId !== 'string' ||
        equipmentClassId.trim().length === 0
      )
    ) {
      throw badRequest(
        'INVALID_QUERY',
        'Invalid equipment_class_id filter.',
      );
    }

    const assetId = req.query.asset_id;

    const records = await service.list(req.auth!, {
      status: status as CaseStatus | undefined,

      equipment_class_id:
        typeof equipmentClassId === 'string'
          ? equipmentClassId.trim()
          : undefined,

      asset_id:
        assetId === undefined
          ? undefined
          : numberParam(assetId, 0, Number.MAX_SAFE_INTEGER, 0),

      limit: numberParam(req.query.limit, 20, 100, 1),

      offset: numberParam(req.query.offset, 0, 1000000, 0),
    });

    res.status(200).json({
      items: records,
      count: records.length,
    });
  });

  const update: Handler = asyncHandler(async (req, res) => {
    const record = await service.update(
      req.auth!,
      caseId(req),
      validBody(req.body) as unknown as UpdateCaseInput,
    );

    res.status(200).json({ case: record });
  });

  const submit: Handler = asyncHandler(async (req, res) => {
    const record = await service.submit(req.auth!, caseId(req));

    res.status(200).json({ case: record });
  });

  const review: Handler = asyncHandler(async (req, res) => {
    const record = await service.review(
      req.auth!,
      caseId(req),
      validBody(req.body) as unknown as CaseReviewInput,
    );

    res.status(200).json({ review: record });
  });

  return {
    create,
    get,
    list,
    update,
    submit,
    review,
  };
}
