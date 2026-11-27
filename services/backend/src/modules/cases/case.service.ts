
import type { AuthContext } from '../../middleware/auth';
import { ApiError, badRequest, forbidden, notFound } from '../../http/errors';
import type { CaseRepository } from './case.repository';
import type {
  CaseListFilters,
  CreateCaseInput,
  UpdateCaseInput,
  CaseReviewInput,
} from './case.types';

const EDITABLE_FIELDS: (keyof UpdateCaseInput)[] = [
  'case_reference',
  'client_capture_id',
  'equipment_class_id',
  'subsystem_id',
  'subsystem_source_label',
  'component_name',
  'equipment_model_id',
  'asset_id',
  'plant_facility',
  'production_line',
  'symptom_category',
  'symptom_text',
  'symptom_structured',
  'operating_status',
  'symptom_frequency',
  'severity_proposed',
  'primary_suspected_cause',
  'alternative_causes',
  'failure_mechanism',
  'failure_effect',
  'differential_diagnosis',
  'corrective_action_text',
  'required_spares_text',
  'post_repair_verification',
  'acceptance_criteria',
  'recurrence_prevention',
  'early_warning',
  'case_origin',
  'evidence_type',
  'source_reliability',
  'is_synthetic',
  'model_is_illustrative',
  'needs_depth_expansion',
];

export class CaseService {
  constructor(private readonly repository: CaseRepository) {}

  async create(ctx: AuthContext, input: CreateCaseInput) {
    if (!input.case_reference?.trim()) {
      throw badRequest('INVALID_CASE_REFERENCE', 'Case reference is required.');
    }

    if (!input.equipment_class_id?.trim()) {
      throw badRequest('INVALID_EQUIPMENT_CLASS', 'Equipment class is required.');
    }

    if (!input.symptom_text?.trim()) {
      throw badRequest('INVALID_SYMPTOM', 'Symptom description is required.');
    }

    if (input.confirmed_cause || input.root_cause_confirmation) {
      throw badRequest(
        'UNVERIFIED_DIAGNOSIS',
        'A confirmed diagnosis cannot be supplied during case creation.',
      );
    }

    return this.repository.create(ctx.organizationId, ctx.userId, input);
  }

  async get(ctx: AuthContext, caseId: string) {
    const record = await this.repository.findById(
      ctx.organizationId,
      caseId,
    );

    if (!record) {
      throw notFound('Case not found.', 'CASE_NOT_FOUND');
    }

    return record;
  }

  async list(ctx: AuthContext, filters: CaseListFilters = {}) {
    return this.repository.list(ctx.organizationId, filters);
  }

  async update(
    ctx: AuthContext,
    caseId: string,
    input: UpdateCaseInput,
  ) {
    if (
      input.confirmed_cause !== undefined ||
      input.root_cause_confirmation !== undefined
    ) {
      throw badRequest(
        'UNVERIFIED_DIAGNOSIS',
        'Confirmed diagnosis fields cannot be changed through a normal case update.',
      );
    }

    const hasEditableField = Object.keys(input).some(
      (key) =>
        EDITABLE_FIELDS.includes(key as keyof UpdateCaseInput) &&
        input[key as keyof UpdateCaseInput] !== undefined,
    );

    if (!hasEditableField) {
      throw badRequest(
        'EMPTY_CASE_UPDATE',
        'At least one valid editable field must be provided.',
      );
    }

    const record = await this.repository.update(
      ctx.organizationId,
      ctx.userId,
      caseId,
      input,
    );

    if (!record) {
      throw new ApiError(
        409,
        'CASE_NOT_EDITABLE',
        'Case not found or its current status does not allow editing.',
      );
    }

    return record;
  }

  async submit(ctx: AuthContext, caseId: string) {
    const record = await this.repository.submit(
      ctx.organizationId,
      ctx.userId,
      caseId,
    );

    if (!record) {
      throw new ApiError(
        409,
        'CASE_NOT_SUBMITTABLE',
        'Case not found or cannot be submitted in its current status.',
      );
    }

    return record;
  }

  async review(
    ctx: AuthContext,
    caseId: string,
    input: CaseReviewInput,
  ) {
    if (!['SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN'].includes(ctx.role)) {
      throw forbidden('Only authorized reviewers can review cases.');
    }

    if (
      !input.decision ||
      !['APPROVED', 'APPROVED WITH CHANGES', 'REJECTED'].includes(input.decision)
    ) {
      throw badRequest(
        'INVALID_REVIEW_DECISION',
        'A valid review decision is required.',
      );
    }

    const record = await this.repository.review(
      ctx.organizationId,
      ctx.userId,
      caseId,
      input,
    );

    if (!record) {
      throw new ApiError(
        409,
        'CASE_NOT_REVIEWABLE',
        'Case not found or is not awaiting review.',
      );
    }

    return record;
  }
}
