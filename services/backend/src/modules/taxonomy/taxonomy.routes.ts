import express from 'express';
import { withTenant, type PoolLike } from '../../database/tenant';
import { badRequest } from '../../http/errors';
import { asyncHandler, type Handler } from '../../http/types';
import { parsePagination } from '../../http/validation';
import { authenticate, requireRole, type AuthContext } from '../../middleware/auth';

export interface EquipmentClassRow {
  equipment_class_id: string;
  class_name: string;
  description: string | null;
  review_status: string;
  source_sheet: string | null;
  source_row_number: number | null;
  created_at: string;
}

export interface SubsystemRow {
  subsystem_id: number;
  subsystem_name: string;
  description: string | null;
  review_status: string;
  created_at: string;
}

export interface FailureModeTaxonomyRow {
  taxonomy_code: string;
  equipment_class_id: string;
  subsystem_id: number | null;
  component_name: string | null;
  failure_mode_name: string;
  description: string | null;
  failure_effect: string | null;
  failure_cause: string | null;
  corrective_action: string | null;
  review_status: string;
}

export interface FailureModeVocabularyRow {
  failure_mode_id: string;
  preferred_label: string;
  equipment_class_id: string | null;
  note: string | null;
  review_status: string;
}

export interface TaxonomyStore {
  listEquipmentClasses(
    organizationId: string,
    filter: { reviewStatus?: string; limit: number; offset: number },
  ): Promise<EquipmentClassRow[]>;
  listSubsystems(
    organizationId: string,
    filter: { equipmentClassId?: string; reviewStatus?: string; limit: number; offset: number },
  ): Promise<SubsystemRow[]>;
  listFailureModes(
    organizationId: string,
    filter: { equipmentClassId?: string; subsystemId?: number; reviewStatus?: string; q?: string; limit: number; offset: number },
  ): Promise<{ taxonomy: FailureModeTaxonomyRow[]; vocabulary: FailureModeVocabularyRow[] }>;
}

const iso = (v: unknown): string => new Date(v as string).toISOString();

export class PostgresTaxonomyStore implements TaxonomyStore {
  constructor(private readonly pool: PoolLike) {}

  listEquipmentClasses(organizationId: string, filter: { reviewStatus?: string; limit: number; offset: number }) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT equipment_class_id, class_name, description, review_status, source_sheet, source_row_number, created_at
           FROM equipment_class
          WHERE ($1::text IS NULL OR review_status = $1)
          ORDER BY equipment_class_id ASC
          LIMIT $2 OFFSET $3`,
        [filter.reviewStatus ?? null, filter.limit, filter.offset],
      );
      return res.rows.map((r) => ({
        equipment_class_id: r.equipment_class_id,
        class_name: r.class_name,
        description: r.description ?? null,
        review_status: r.review_status,
        source_sheet: r.source_sheet ?? null,
        source_row_number: r.source_row_number ?? null,
        created_at: iso(r.created_at),
      }));
    });
  }

  listSubsystems(
    organizationId: string,
    filter: { equipmentClassId?: string; reviewStatus?: string; limit: number; offset: number },
  ) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT s.subsystem_id, s.subsystem_name, s.description, s.review_status, s.created_at
           FROM subsystem s
          WHERE ($1::text IS NULL OR s.review_status = $1)
            AND (
              $2::text IS NULL
              OR EXISTS (
                SELECT 1
                  FROM class_subsystem cs
                 WHERE cs.subsystem_id = s.subsystem_id AND cs.equipment_class_id = $2
              )
            )
          ORDER BY s.subsystem_name ASC
          LIMIT $3 OFFSET $4`,
        [filter.reviewStatus ?? null, filter.equipmentClassId ?? null, filter.limit, filter.offset],
      );
      return res.rows.map((r) => ({
        subsystem_id: Number(r.subsystem_id),
        subsystem_name: r.subsystem_name,
        description: r.description ?? null,
        review_status: r.review_status,
        created_at: iso(r.created_at),
      }));
    });
  }

  listFailureModes(
    organizationId: string,
    filter: { equipmentClassId?: string; subsystemId?: number; reviewStatus?: string; q?: string; limit: number; offset: number },
  ) {
    return withTenant(this.pool, organizationId, async (db) => {
      const pattern = filter.q ? `%${filter.q}%` : null;
      const taxRes = await db.query(
        `SELECT taxonomy_code, equipment_class_id, subsystem_id, component_name, failure_mode_name,
                description, failure_effect, failure_cause, corrective_action, review_status
           FROM failure_mode_taxonomy
          WHERE ($1::text IS NULL OR equipment_class_id = $1)
            AND ($2::bigint IS NULL OR subsystem_id = $2)
            AND ($3::text IS NULL OR review_status = $3)
            AND ($4::text IS NULL OR taxonomy_code ILIKE $4 OR failure_mode_name ILIKE $4 OR component_name ILIKE $4)
          ORDER BY taxonomy_code ASC
          LIMIT $5 OFFSET $6`,
        [
          filter.equipmentClassId ?? null,
          filter.subsystemId ?? null,
          filter.reviewStatus ?? null,
          pattern,
          filter.limit,
          filter.offset,
        ],
      );

      const vocabRes = await db.query(
        `SELECT failure_mode_id, preferred_label, equipment_class_id, note, review_status
           FROM failure_mode_vocabulary
          WHERE ($1::text IS NULL OR equipment_class_id = $1)
            AND ($2::text IS NULL OR review_status = $2)
            AND ($3::text IS NULL OR failure_mode_id ILIKE $3 OR preferred_label ILIKE $3)
          ORDER BY failure_mode_id ASC
          LIMIT $4 OFFSET $5`,
        [filter.equipmentClassId ?? null, filter.reviewStatus ?? null, pattern, filter.limit, filter.offset],
      );

      return {
        taxonomy: taxRes.rows.map((r) => ({
          taxonomy_code: r.taxonomy_code,
          equipment_class_id: r.equipment_class_id,
          subsystem_id: r.subsystem_id == null ? null : Number(r.subsystem_id),
          component_name: r.component_name ?? null,
          failure_mode_name: r.failure_mode_name,
          description: r.description ?? null,
          failure_effect: r.failure_effect ?? null,
          failure_cause: r.failure_cause ?? null,
          corrective_action: r.corrective_action ?? null,
          review_status: r.review_status,
        })),
        vocabulary: vocabRes.rows.map((r) => ({
          failure_mode_id: r.failure_mode_id,
          preferred_label: r.preferred_label,
          equipment_class_id: r.equipment_class_id ?? null,
          note: r.note ?? null,
          review_status: r.review_status,
        })),
      };
    });
  }
}

export class TaxonomyService {
  constructor(private readonly store: TaxonomyStore) {}

  equipmentClasses(ctx: AuthContext, filter: { reviewStatus?: string; limit: number; offset: number }) {
    return this.store.listEquipmentClasses(ctx.organizationId, filter);
  }

  subsystems(ctx: AuthContext, filter: { equipmentClassId?: string; reviewStatus?: string; limit: number; offset: number }) {
    return this.store.listSubsystems(ctx.organizationId, filter);
  }

  failureModes(
    ctx: AuthContext,
    filter: { equipmentClassId?: string; subsystemId?: number; reviewStatus?: string; q?: string; limit: number; offset: number },
  ) {
    return this.store.listFailureModes(ctx.organizationId, filter);
  }
}

const REVIEW_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'];

function optReviewStatus(raw: unknown): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || !REVIEW_STATUSES.includes(raw.trim().toUpperCase())) {
    throw badRequest('INVALID_QUERY', `review_status must be one of ${REVIEW_STATUSES.join(', ')}.`);
  }
  return raw.trim().toUpperCase();
}

function optClassId(raw: unknown): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 100) {
    throw badRequest('INVALID_QUERY', 'equipment_class_id must be a string up to 100 characters.');
  }
  return raw.trim();
}

export function createTaxonomyHandlers(service: TaxonomyService) {
  const equipmentClasses: Handler = asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query, 50, 200);
    const items = await service.equipmentClasses(req.auth!, {
      reviewStatus: optReviewStatus(req.query.review_status),
      limit,
      offset,
    });
    res.status(200).json({ items, count: items.length, limit, offset });
  });

  const subsystems: Handler = asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query, 50, 200);
    const items = await service.subsystems(req.auth!, {
      equipmentClassId: optClassId(req.query.equipment_class_id),
      reviewStatus: optReviewStatus(req.query.review_status),
      limit,
      offset,
    });
    res.status(200).json({ items, count: items.length, limit, offset });
  });

  const failureModes: Handler = asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query, 50, 200);
    let subsystemId: number | undefined;
    if (req.query.subsystem_id !== undefined && req.query.subsystem_id !== '') {
      if (typeof req.query.subsystem_id !== 'string' || !/^[1-9]\d*$/.test(req.query.subsystem_id)) {
        throw badRequest('INVALID_QUERY', 'subsystem_id must be a positive integer.');
      }
      subsystemId = Number(req.query.subsystem_id);
    }
    let q: string | undefined;
    if (req.query.q !== undefined && req.query.q !== '') {
      if (typeof req.query.q !== 'string' || req.query.q.length > 200) {
        throw badRequest('INVALID_QUERY', 'q must be a search string up to 200 characters.');
      }
      const trimmed = req.query.q.trim();
      if (trimmed) q = trimmed;
    }

    const data = await service.failureModes(req.auth!, {
      equipmentClassId: optClassId(req.query.equipment_class_id),
      subsystemId,
      reviewStatus: optReviewStatus(req.query.review_status),
      q,
      limit,
      offset,
    });
    res.status(200).json({
      items: data.taxonomy,
      vocabulary: data.vocabulary,
      count: data.taxonomy.length,
      limit,
      offset,
    });
  });

  return { equipmentClasses, subsystems, failureModes };
}

export function createTaxonomyRouter(jwtSecret: string, service: TaxonomyService) {
  const router = express.Router();
  const h = createTaxonomyHandlers(service);

  router.use(authenticate(jwtSecret) as any);
  const anyRole = requireRole('TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');

  router.get('/equipment-classes', anyRole as any, h.equipmentClasses as any);
  router.get('/subsystems', anyRole as any, h.subsystems as any);
  router.get('/failure-modes', anyRole as any, h.failureModes as any);

  return router;
}
