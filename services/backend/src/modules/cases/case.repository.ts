import { randomUUID } from 'node:crypto';
import { conflict } from '../../http/errors';
import { withTenant, type PoolLike, type Queryable } from '../../database/tenant';
import type { CaseListFilter, CaseStore, CreateCaseInput, OperationalCaseRow, PatchCaseInput } from './case.types';

const iso = (v: unknown): string => new Date(v as string).toISOString();
const optIso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

const CASE_COLUMNS = `
  case_id, case_reference, organization_id, client_capture_id,
  equipment_class_id, subsystem_id, subsystem_source_label, component_name,
  equipment_model_id, asset_id, plant_facility, production_line, case_title,
  symptom_category, symptom_text, symptom_structured, operating_status,
  symptom_frequency, severity_proposed, primary_suspected_cause,
  alternative_causes, confirmed_cause, root_cause_confirmation,
  failure_mechanism, failure_effect, differential_diagnosis,
  corrective_action_text, required_spares_text, post_repair_verification,
  acceptance_criteria, recurrence_prevention, early_warning,
  case_origin, evidence_type, source_reliability,
  is_synthetic, model_is_illustrative, needs_depth_expansion,
  case_status, retrieval_eligibility, verification_duration_seconds,
  deleted_at, created_at, updated_at
`;

const FTS_VECTOR = `
  to_tsvector(
    'simple',
    coalesce(symptom_text, '') || ' ' ||
    coalesce(symptom_structured, '') || ' ' ||
    coalesce(failure_effect, '') || ' ' ||
    coalesce(primary_suspected_cause, '')
  )
`;

function mapCaseRow(r: any): OperationalCaseRow {
  return {
    case_id: r.case_id,
    case_reference: r.case_reference,
    organization_id: r.organization_id,
    client_capture_id: r.client_capture_id ?? null,
    equipment_class_id: r.equipment_class_id,
    subsystem_id: r.subsystem_id == null ? null : Number(r.subsystem_id),
    subsystem_source_label: r.subsystem_source_label ?? null,
    component_name: r.component_name ?? null,
    equipment_model_id: r.equipment_model_id ?? null,
    asset_id: r.asset_id == null ? null : Number(r.asset_id),
    plant_facility: r.plant_facility ?? null,
    production_line: r.production_line ?? null,
    case_title: r.case_title ?? null,
    symptom_category: r.symptom_category ?? null,
    symptom_text: r.symptom_text,
    symptom_structured: r.symptom_structured ?? null,
    operating_status: r.operating_status ?? null,
    symptom_frequency: r.symptom_frequency ?? null,
    severity_proposed: r.severity_proposed ?? null,
    primary_suspected_cause: r.primary_suspected_cause ?? null,
    alternative_causes: r.alternative_causes ?? null,
    confirmed_cause: r.confirmed_cause ?? null,
    root_cause_confirmation: r.root_cause_confirmation ?? null,
    failure_mechanism: r.failure_mechanism ?? null,
    failure_effect: r.failure_effect ?? null,
    differential_diagnosis: r.differential_diagnosis ?? null,
    corrective_action_text: r.corrective_action_text ?? null,
    required_spares_text: r.required_spares_text ?? null,
    post_repair_verification: r.post_repair_verification ?? null,
    acceptance_criteria: r.acceptance_criteria ?? null,
    recurrence_prevention: r.recurrence_prevention ?? null,
    early_warning: r.early_warning ?? null,
    case_origin: r.case_origin ?? null,
    evidence_type: r.evidence_type ?? null,
    source_reliability: r.source_reliability ?? null,
    is_synthetic: r.is_synthetic === true,
    model_is_illustrative: r.model_is_illustrative === true,
    needs_depth_expansion: r.needs_depth_expansion === true,
    case_status: r.case_status,
    retrieval_eligibility: r.retrieval_eligibility,
    verification_duration_seconds: r.verification_duration_seconds ?? null,
    deleted_at: optIso(r.deleted_at),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
    ...(r.rank !== undefined ? { rank: Number(r.rank) } : {}),
  };
}

async function auditCase(
  db: Queryable,
  org: string,
  actor: string,
  action: string,
  caseId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await db.query(
    'INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [org, actor, action, 'operational_case', caseId, JSON.stringify(details)],
  );
}

export class PostgresCaseStore implements CaseStore {
  constructor(private readonly pool: PoolLike) {}

  createCase(organizationId: string, actorId: string, input: CreateCaseInput) {
    return withTenant(this.pool, organizationId, async (db) => {
      if (input.clientCaptureId) {
        const existing = await db.query(
          `SELECT ${CASE_COLUMNS}
             FROM operational_case
            WHERE organization_id = $1 AND client_capture_id = $2`,
          [organizationId, input.clientCaptureId],
        );
        if (existing.rows[0]) {
          if (existing.rows[0].deleted_at !== null) {
            throw conflict('CASE_DELETED', 'This clientCaptureId belongs to a retired case.');
          }
          return { item: mapCaseRow(existing.rows[0]), created: false };
        }
      }

      const caseReference = input.caseReference || `CASE-${randomUUID().slice(0, 8).toUpperCase()}`;
      const ins = await db.query(
        `INSERT INTO operational_case (
           organization_id, case_reference, client_capture_id,
           equipment_class_id, subsystem_id, subsystem_source_label, component_name,
           equipment_model_id, asset_id, plant_facility, production_line, case_title,
           symptom_category, symptom_text, symptom_structured, operating_status,
           symptom_frequency, severity_proposed, primary_suspected_cause,
           alternative_causes, confirmed_cause, root_cause_confirmation,
           failure_mechanism, failure_effect, differential_diagnosis,
           corrective_action_text, required_spares_text, post_repair_verification,
           acceptance_criteria, recurrence_prevention, early_warning,
           case_origin, evidence_type, source_reliability,
           is_synthetic, model_is_illustrative, needs_depth_expansion,
           case_status, retrieval_eligibility
         )
         VALUES (
           $1, $2, $3,
           $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14, $15, $16,
           $17, $18, $19,
           $20, $21, $22,
           $23, $24, $25,
           $26, $27, $28,
           $29, $30, $31,
           $32, $33, $34,
           $35, $36, $37,
           $38, $39
         )
         RETURNING ${CASE_COLUMNS}`,
        [
          organizationId,
          caseReference,
          input.clientCaptureId ?? null,
          input.equipmentClassId,
          input.subsystemId ?? null,
          input.subsystemSourceLabel ?? null,
          input.componentName ?? null,
          input.equipmentModelId ?? null,
          input.assetId ?? null,
          input.plantFacility ?? null,
          input.productionLine ?? null,
          input.caseTitle ?? null,
          input.symptomCategory ?? null,
          input.symptomText,
          input.symptomStructured ?? null,
          input.operatingStatus ?? null,
          input.symptomFrequency ?? null,
          input.severityProposed ?? null,
          input.primarySuspectedCause ?? null,
          input.alternativeCauses ?? null,
          input.confirmedCause ?? null,
          input.rootCauseConfirmation ?? null,
          input.failureMechanism ?? null,
          input.failureEffect ?? null,
          input.differentialDiagnosis ?? null,
          input.correctiveActionText ?? null,
          input.requiredSparesText ?? null,
          input.postRepairVerification ?? null,
          input.acceptanceCriteria ?? null,
          input.recurrencePrevention ?? null,
          input.earlyWarning ?? null,
          input.caseOrigin ?? 'field_capture',
          input.evidenceType ?? null,
          input.sourceReliability ?? null,
          input.isSynthetic ?? false,
          input.modelIsIllustrative ?? false,
          input.needsDepthExpansion ?? false,
          input.caseStatus ?? 'DRAFT',
          input.retrievalEligibility ?? 'demo_only_until_expert_review',
        ],
      );

      const createdRow = mapCaseRow(ins.rows[0]);
      await auditCase(db, organizationId, actorId, 'CASE_CREATED', createdRow.case_id, {
        case_reference: createdRow.case_reference,
        case_status: createdRow.case_status,
      });
      return { item: createdRow, created: true };
    });
  }

  listCases(organizationId: string, filter: CaseListFilter) {
    return withTenant(this.pool, organizationId, async (db) => {
      const hasQuery = Boolean(filter.q);
      const whereSql = `
        WHERE organization_id = $1
          AND deleted_at IS NULL
          AND ($2::text IS NULL OR case_status = $2)
          AND ($3::text IS NULL OR equipment_class_id = $3)
          AND ($4::bigint IS NULL OR subsystem_id = $4)
          AND ($5::text IS NULL OR ${FTS_VECTOR} @@ plainto_tsquery('simple', $5))
      `;
      const baseParams = [
        organizationId,
        filter.status ?? null,
        filter.equipmentClassId ?? null,
        filter.subsystemId ?? null,
        filter.q ?? null,
      ];

      const countRes = await db.query(
        `SELECT COUNT(*)::int AS total FROM operational_case ${whereSql}`,
        baseParams,
      );
      const total = Number(countRes.rows[0]?.total ?? 0);

      const rankSelect = hasQuery
        ? `, ts_rank(${FTS_VECTOR}, plainto_tsquery('simple', $5)) AS rank`
        : '';
      const orderBy = hasQuery ? 'ORDER BY rank DESC, created_at DESC, case_id' : 'ORDER BY created_at DESC, case_id';

      const rowsRes = await db.query(
        `SELECT ${CASE_COLUMNS} ${rankSelect}
           FROM operational_case
           ${whereSql}
          ${orderBy}
          LIMIT $6 OFFSET $7`,
        [...baseParams, filter.limit, filter.offset],
      );

      return { items: rowsRes.rows.map(mapCaseRow), total };
    });
  }

  getCase(organizationId: string, caseId: string) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT ${CASE_COLUMNS}
           FROM operational_case
          WHERE organization_id = $1 AND case_id = $2 AND deleted_at IS NULL`,
        [organizationId, caseId],
      );
      return res.rows[0] ? mapCaseRow(res.rows[0]) : null;
    });
  }

  patchCase(organizationId: string, actorId: string, caseId: string, patch: PatchCaseInput) {
    return withTenant(this.pool, organizationId, async (db) => {
      const sets: string[] = [];
      const values: unknown[] = [organizationId, caseId];
      const push = (col: string, val: unknown) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };

      const fieldMap: Array<[keyof PatchCaseInput, string]> = [
        ['caseReference', 'case_reference'],
        ['clientCaptureId', 'client_capture_id'],
        ['equipmentClassId', 'equipment_class_id'],
        ['subsystemId', 'subsystem_id'],
        ['subsystemSourceLabel', 'subsystem_source_label'],
        ['componentName', 'component_name'],
        ['equipmentModelId', 'equipment_model_id'],
        ['assetId', 'asset_id'],
        ['plantFacility', 'plant_facility'],
        ['productionLine', 'production_line'],
        ['caseTitle', 'case_title'],
        ['symptomCategory', 'symptom_category'],
        ['symptomText', 'symptom_text'],
        ['symptomStructured', 'symptom_structured'],
        ['operatingStatus', 'operating_status'],
        ['symptomFrequency', 'symptom_frequency'],
        ['severityProposed', 'severity_proposed'],
        ['primarySuspectedCause', 'primary_suspected_cause'],
        ['alternativeCauses', 'alternative_causes'],
        ['confirmedCause', 'confirmed_cause'],
        ['rootCauseConfirmation', 'root_cause_confirmation'],
        ['failureMechanism', 'failure_mechanism'],
        ['failureEffect', 'failure_effect'],
        ['differentialDiagnosis', 'differential_diagnosis'],
        ['correctiveActionText', 'corrective_action_text'],
        ['requiredSparesText', 'required_spares_text'],
        ['postRepairVerification', 'post_repair_verification'],
        ['acceptanceCriteria', 'acceptance_criteria'],
        ['recurrencePrevention', 'recurrence_prevention'],
        ['earlyWarning', 'early_warning'],
        ['caseOrigin', 'case_origin'],
        ['evidenceType', 'evidence_type'],
        ['sourceReliability', 'source_reliability'],
        ['isSynthetic', 'is_synthetic'],
        ['modelIsIllustrative', 'model_is_illustrative'],
        ['needsDepthExpansion', 'needs_depth_expansion'],
        ['caseStatus', 'case_status'],
        ['retrievalEligibility', 'retrieval_eligibility'],
      ];

      for (const [prop, col] of fieldMap) {
        if (patch[prop] !== undefined) push(col, patch[prop]);
      }
      sets.push('updated_at = NOW()');

      const up = await db.query(
        `UPDATE operational_case
            SET ${sets.join(', ')}
          WHERE organization_id = $1 AND case_id = $2 AND deleted_at IS NULL
          RETURNING ${CASE_COLUMNS}`,
        values,
      );
      if (!up.rows[0]) return null;

      await auditCase(db, organizationId, actorId, 'CASE_UPDATED', caseId, {
        updated_fields: Object.keys(patch),
      });
      return mapCaseRow(up.rows[0]);
    });
  }

  softDeleteCase(organizationId: string, actorId: string, caseId: string) {
    return withTenant(this.pool, organizationId, async (db) => {
      const up = await db.query(
        `UPDATE operational_case
            SET deleted_at = NOW(),
                case_status = 'REVOKED',
                updated_at = NOW()
          WHERE organization_id = $1 AND case_id = $2 AND deleted_at IS NULL
          RETURNING case_id`,
        [organizationId, caseId],
      );
      if (!up.rows[0]) return false;

      await auditCase(db, organizationId, actorId, 'CASE_RETIRED', caseId, {});
      return true;
    });
  }
}
