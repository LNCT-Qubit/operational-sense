import { badRequest } from '../../http/errors';
import { compileValidator } from '../../http/validation';
import { isUuid } from '../../middleware/auth';
import type { CaseStatus, CreateCaseInput, PatchCaseInput, RetrievalEligibility, SourceReliability } from './case.types';

const CASE_STATUSES: CaseStatus[] = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'REVOKED'];
const ELIGIBILITIES: RetrievalEligibility[] = ['demo_only_until_expert_review', 'eligible', 'excluded'];
const RELIABILITIES: SourceReliability[] = ['A', 'B', 'C', 'D'];

const OPTIONAL_TEXT = { type: ['string', 'null'], maxLength: 4000 };

const CASE_PROPS = {
  caseReference: { type: 'string', minLength: 1, maxLength: 120 },
  clientCaptureId: { type: ['string', 'null'] },
  equipmentClassId: { type: 'string', minLength: 1, maxLength: 100 },
  subsystemId: { type: ['integer', 'null'], minimum: 1 },
  subsystemSourceLabel: OPTIONAL_TEXT,
  componentName: OPTIONAL_TEXT,
  equipmentModelId: { type: ['string', 'null'] },
  assetId: { type: ['integer', 'null'], minimum: 1 },
  plantFacility: OPTIONAL_TEXT,
  productionLine: OPTIONAL_TEXT,
  caseTitle: { type: ['string', 'null'], maxLength: 300 },
  symptomCategory: OPTIONAL_TEXT,
  symptomText: { type: 'string', minLength: 1, maxLength: 4000 },
  symptomStructured: OPTIONAL_TEXT,
  operatingStatus: OPTIONAL_TEXT,
  symptomFrequency: OPTIONAL_TEXT,
  severityProposed: OPTIONAL_TEXT,
  primarySuspectedCause: OPTIONAL_TEXT,
  alternativeCauses: OPTIONAL_TEXT,
  confirmedCause: OPTIONAL_TEXT,
  rootCauseConfirmation: OPTIONAL_TEXT,
  failureMechanism: OPTIONAL_TEXT,
  failureEffect: OPTIONAL_TEXT,
  differentialDiagnosis: OPTIONAL_TEXT,
  correctiveActionText: OPTIONAL_TEXT,
  requiredSparesText: OPTIONAL_TEXT,
  postRepairVerification: OPTIONAL_TEXT,
  acceptanceCriteria: OPTIONAL_TEXT,
  recurrencePrevention: OPTIONAL_TEXT,
  earlyWarning: OPTIONAL_TEXT,
  caseOrigin: OPTIONAL_TEXT,
  evidenceType: OPTIONAL_TEXT,
  sourceReliability: { type: ['string', 'null'], enum: [...RELIABILITIES, null] },
  isSynthetic: { type: 'boolean' },
  modelIsIllustrative: { type: 'boolean' },
  needsDepthExpansion: { type: 'boolean' },
  caseStatus: { type: 'string', enum: CASE_STATUSES },
  retrievalEligibility: { type: 'string', enum: ELIGIBILITIES },
};

const CREATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['equipmentClassId', 'symptomText'],
  properties: CASE_PROPS,
};

const PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: CASE_PROPS,
};

const validateCreateShape = compileValidator<CreateCaseInput>(CREATE_SCHEMA);
const validatePatchShape = compileValidator<PatchCaseInput>(PATCH_SCHEMA);

function checkUuidField(value: string | null | undefined, field: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!isUuid(value)) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [{ field, issue: 'must be a valid UUID' }]);
  }
  return value.toLowerCase();
}

export function validateCreateCase(body: unknown, idempotencyHeader?: string): CreateCaseInput {
  const input = validateCreateShape(body);
  if (!input.symptomText.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [{ field: 'symptomText', issue: 'must not be blank' }]);
  }
  if (!input.equipmentClassId.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [{ field: 'equipmentClassId', issue: 'must not be blank' }]);
  }
  const headerUuid = idempotencyHeader?.trim() ? checkUuidField(idempotencyHeader.trim(), 'Idempotency-Key') : undefined;
  const bodyUuid = checkUuidField(input.clientCaptureId, 'clientCaptureId');
  if (headerUuid && bodyUuid && headerUuid !== bodyUuid) {
    throw badRequest('VALIDATION_ERROR', 'Idempotency-Key header does not match body clientCaptureId.', [
      { field: 'clientCaptureId', issue: 'must match Idempotency-Key header' },
    ]);
  }
  const equipmentModelId = checkUuidField(input.equipmentModelId, 'equipmentModelId');
  return {
    ...input,
    equipmentClassId: input.equipmentClassId.trim(),
    symptomText: input.symptomText.trim(),
    caseReference: input.caseReference?.trim(),
    clientCaptureId: headerUuid ?? bodyUuid ?? null,
    equipmentModelId,
  };
}

export function validatePatchCase(body: unknown): PatchCaseInput {
  const input = validatePatchShape(body);
  if (input.symptomText !== undefined && !input.symptomText.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [{ field: 'symptomText', issue: 'must not be blank' }]);
  }
  if (input.equipmentClassId !== undefined && !input.equipmentClassId.trim()) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [{ field: 'equipmentClassId', issue: 'must not be blank' }]);
  }
  const clientCaptureId = checkUuidField(input.clientCaptureId, 'clientCaptureId');
  const equipmentModelId = checkUuidField(input.equipmentModelId, 'equipmentModelId');
  return {
    ...input,
    ...(input.equipmentClassId !== undefined ? { equipmentClassId: input.equipmentClassId.trim() } : {}),
    ...(input.symptomText !== undefined ? { symptomText: input.symptomText.trim() } : {}),
    ...(input.caseReference !== undefined ? { caseReference: input.caseReference.trim() } : {}),
    ...(clientCaptureId !== undefined ? { clientCaptureId } : {}),
    ...(equipmentModelId !== undefined ? { equipmentModelId } : {}),
  };
}

export function parseCaseListQuery(query: Record<string, unknown>) {
  let status: CaseStatus | undefined;
  if (query.status !== undefined && query.status !== '') {
    if (typeof query.status !== 'string' || !CASE_STATUSES.includes(query.status.trim().toUpperCase() as CaseStatus)) {
      throw badRequest('INVALID_QUERY', `status must be one of ${CASE_STATUSES.join(', ')}.`);
    }
    status = query.status.trim().toUpperCase() as CaseStatus;
  }

  let equipmentClassId: string | undefined;
  if (query.equipment_class_id !== undefined && query.equipment_class_id !== '') {
    if (typeof query.equipment_class_id !== 'string' || query.equipment_class_id.length > 100) {
      throw badRequest('INVALID_QUERY', 'equipment_class_id must be a valid identifier.');
    }
    equipmentClassId = query.equipment_class_id.trim();
  }

  let subsystemId: number | undefined;
  if (query.subsystem_id !== undefined && query.subsystem_id !== '') {
    if (typeof query.subsystem_id !== 'string' || !/^[1-9]\d*$/.test(query.subsystem_id)) {
      throw badRequest('INVALID_QUERY', 'subsystem_id must be a positive integer.');
    }
    subsystemId = Number(query.subsystem_id);
  }

  let q: string | undefined;
  if (query.q !== undefined && query.q !== '') {
    if (typeof query.q !== 'string' || query.q.length > 200) {
      throw badRequest('INVALID_QUERY', 'q must be a search string up to 200 characters.');
    }
    const trimmed = query.q.trim();
    if (trimmed) q = trimmed;
  }

  return { status, equipmentClassId, subsystemId, q };
}
