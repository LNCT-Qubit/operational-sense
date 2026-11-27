
import {
  withTenant,
  type PoolLike,
  type Queryable,
} from '../../database/tenant';

import type {
  CaseRecord,
  CaseListFilters,
  CreateCaseInput,
  UpdateCaseInput,
  CaseReviewInput,
  CaseReviewRecord,
} from './case.types';

const CASE_COLUMNS = [
  'case_reference', 'client_capture_id', 'equipment_class_id',
  'subsystem_id', 'subsystem_source_label', 'component_name',
  'equipment_model_id', 'asset_id', 'plant_facility',
  'production_line', 'symptom_category', 'symptom_text',
  'symptom_structured', 'operating_status', 'symptom_frequency',
  'severity_proposed', 'primary_suspected_cause', 'alternative_causes',
  'confirmed_cause', 'root_cause_confirmation', 'failure_mechanism',
  'failure_effect', 'differential_diagnosis', 'corrective_action_text',
  'required_spares_text', 'post_repair_verification',
  'acceptance_criteria', 'recurrence_prevention', 'early_warning',
  'case_origin', 'evidence_type', 'source_reliability',
  'is_synthetic', 'model_is_illustrative', 'needs_depth_expansion',
] as const;

async function addAudit(
  db: Queryable,
  organizationId: string,
  actorId: string,
  action: string,
  caseId: string,
) {
  await db.query(
    `INSERT INTO audit_log
     (organization_id, actor, action, entity_type, entity_id)
     VALUES ($1, $2, $3, 'operational_case', $4)`,
    [organizationId, actorId, action, caseId],
  );
}

export class CaseRepository {
  constructor(private readonly pool: PoolLike) {}

  async create(orgId: string, actorId: string, input: CreateCaseInput): Promise<CaseRecord> {
    return withTenant(this.pool, orgId, async (db) => {
      const columns = ['organization_id', ...CASE_COLUMNS];
      const values = [
        orgId,
        ...CASE_COLUMNS.map((column) => {
          if (column === 'confirmed_cause' || column === 'root_cause_confirmation') return null;
          if (column === 'is_synthetic') return input.is_synthetic ?? true;
          if (column === 'model_is_illustrative') return input.model_is_illustrative ?? true;
          if (column === 'needs_depth_expansion') return input.needs_depth_expansion ?? false;
          return input[column] ?? null;
        }),
      ];

      const placeholders = values.map((_, i) => `$${i + 1}`);
      const result = await db.query(
        `INSERT INTO operational_case (${columns.join(', ')})
         VALUES (${placeholders.join(', ')}) RETURNING *`,
        values,
      );

      const record = result.rows[0] as CaseRecord;
      await addAudit(db, orgId, actorId, 'CASE_CREATED', record.case_id);
      return record;
    });
  }

  async findById(orgId: string, caseId: string): Promise<CaseRecord | null> {
    return withTenant(this.pool, orgId, async (db) => {
      const result = await db.query(
        `SELECT * FROM operational_case
         WHERE organization_id = $1 AND case_id = $2`,
        [orgId, caseId],
      );
      return result.rows[0] ?? null;
    });
  }

  async list(orgId: string, filters: CaseListFilters = {}): Promise<CaseRecord[]> {
    return withTenant(this.pool, orgId, async (db) => {
      const conditions = ['organization_id = $1'];
      const values: unknown[] = [orgId];

      if (filters.status) {
        values.push(filters.status);
        conditions.push(`case_status = $${values.length}`);
      }
      if (filters.equipment_class_id) {
        values.push(filters.equipment_class_id);
        conditions.push(`equipment_class_id = $${values.length}`);
      }
      if (filters.asset_id !== undefined) {
        values.push(filters.asset_id);
        conditions.push(`asset_id = $${values.length}`);
      }

      values.push(Math.min(Math.max(filters.limit ?? 20, 1), 100));
      const limit = `$${values.length}`;
      values.push(Math.max(filters.offset ?? 0, 0));
      const offset = `$${values.length}`;

      const result = await db.query(
        `SELECT * FROM operational_case
         WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        values,
      );
      return result.rows as CaseRecord[];
    });
  }

  async update(
    orgId: string,
    actorId: string,
    caseId: string,
    input: UpdateCaseInput,
  ): Promise<CaseRecord | null> {
    return withTenant(this.pool, orgId, async (db) => {
      const entries = Object.entries(input).filter(
        ([key, value]) =>
          CASE_COLUMNS.includes(key as (typeof CASE_COLUMNS)[number]) &&
          value !== undefined &&
          key !== 'confirmed_cause' &&
          key !== 'root_cause_confirmation',
      );

      if (!entries.length) throw new Error('No valid fields provided for update');

      const assignments = entries.map(([column], i) => `${column} = $${i + 1}`);
      const values = entries.map(([, value]) => value);
      values.push(orgId, caseId);

      const result = await db.query(
        `UPDATE operational_case
         SET ${assignments.join(', ')}, updated_at = now()
         WHERE organization_id = $${values.length - 1}
         AND case_id = $${values.length}
         AND case_status IN ('DRAFT', 'REJECTED')
         RETURNING *`,
        values,
      );

      const record = result.rows[0] as CaseRecord | undefined;
      if (record) await addAudit(db, orgId, actorId, 'CASE_UPDATED', caseId);
      return record ?? null;
    });
  }

  async submit(orgId: string, actorId: string, caseId: string): Promise<CaseRecord | null> {
    return withTenant(this.pool, orgId, async (db) => {
      const result = await db.query(
        `UPDATE operational_case
         SET case_status = 'SUBMITTED', updated_at = now()
         WHERE organization_id = $1 AND case_id = $2
         AND case_status IN ('DRAFT', 'REJECTED')
         RETURNING *`,
        [orgId, caseId],
      );

      if (!result.rows[0]) return null;
      await addAudit(db, orgId, actorId, 'CASE_SUBMITTED', caseId);
      return result.rows[0] as CaseRecord;
    });
  }

  async review(
    orgId: string,
    actorId: string,
    caseId: string,
    input: CaseReviewInput,
  ): Promise<CaseReviewRecord | null> {
    return withTenant(this.pool, orgId, async (db) => {
      const current = await db.query(
        `SELECT case_id FROM operational_case
         WHERE organization_id = $1 AND case_id = $2
         AND case_status = 'SUBMITTED'
         FOR UPDATE`,
        [orgId, caseId],
      );

      if (!current.rows[0]) return null;

      const result = await db.query(
        `INSERT INTO case_verification (
          case_id, reviewer, review_date,
          technical_accuracy_status, taxonomy_mapping_status,
          source_verification_status, safety_review_status,
          measurement_validation_status, overall_decision, comments
        )
        VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          caseId, actorId,
          input.technical_accuracy_status ?? 'PENDING',
          input.taxonomy_mapping_status ?? null,
          input.source_verification_status ?? 'PENDING',
          input.safety_review_status ?? 'PENDING',
          input.measurement_validation_status ?? 'PENDING',
          input.decision, input.comments ?? null,
        ],
      );

      const status = input.decision === 'REJECTED' ? 'REJECTED' : 'VERIFIED';

      await db.query(
        `UPDATE operational_case
         SET case_status = $1, updated_at = now()
         WHERE organization_id = $2 AND case_id = $3`,
        [status, orgId, caseId],
      );

      await addAudit(
        db, orgId, actorId,
        input.decision === 'REJECTED' ? 'CASE_REJECTED' : 'CASE_APPROVED',
        caseId,
      );

      return result.rows[0] as CaseReviewRecord;
    });
  }
}
