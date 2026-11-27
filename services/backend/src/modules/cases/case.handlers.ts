import { asyncHandler, type Handler } from '../../http/types';
import { headerValue, parsePagination, requireUuidParam } from '../../http/validation';
import { parseCaseListQuery, validateCreateCase, validatePatchCase } from './case.validation';
import type { CaseService } from './case.service';

export function createCaseHandlers(service: CaseService) {
  const create: Handler = asyncHandler(async (req, res) => {
    const input = validateCreateCase(req.body, headerValue(req, 'idempotency-key'));
    const { item, created } = await service.create(req.auth!, input);
    res.setHeader('Location', `/api/v1/cases/${item.case_id}`);
    res.status(created ? 201 : 200).json({ duplicate: !created, case: item });
  });

  const list: Handler = asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const filters = parseCaseListQuery(req.query);
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
    const caseId = requireUuidParam(req.params.id, 'case id');
    const item = await service.get(req.auth!, caseId);
    res.status(200).json({ case: item });
  });

  const patch: Handler = asyncHandler(async (req, res) => {
    const caseId = requireUuidParam(req.params.id, 'case id');
    const body = validatePatchCase(req.body);
    const item = await service.patch(req.auth!, caseId, body);
    res.status(200).json({ case: item });
  });

  const remove: Handler = asyncHandler(async (req, res) => {
    const caseId = requireUuidParam(req.params.id, 'case id');
    await service.remove(req.auth!, caseId);
    res.status(200).json({ deleted: true, id: caseId });
  });

  return { create, list, get, patch, remove };
}
