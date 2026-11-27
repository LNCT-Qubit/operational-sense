import { conflict, notFound } from '../../http/errors';
import { withTenant, type PoolLike, type Queryable } from '../../database/tenant';
import type { Role } from '../../middleware/auth';
import type {
  DraftAttachmentRow,
  DraftDecision,
  DraftListFilter,
  DraftSyncStore,
  NewDraftAttachment,
  PatchDraftInput,
  TechnicianDraftDetail,
  TechnicianDraftRow,
  UpsertDraftInput,
} from './draft.types';

const iso = (v: unknown): string => new Date(v as string).toISOString();
const optIso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

const DRAFT_COLUMNS = `
  d.draft_id, d.organization_id, d.client_draft_id, d.created_by,
  d.recording_id, d.extraction_draft_id, d.case_id,
  d.capture_mode, d.equipment, d.subsystem, d.symptom, d.observation,
  d.probable_cause, d.action_taken, d.parts_used, d.safety_notes,
  d.duration_ms, d.recorded_at, d.client_created_at, d.client_updated_at,
  d.status, d.reviewed_by, d.reviewed_at, d.review_comment,
  d.deleted_at, d.created_at, d.updated_at
`;

const ATTACHMENT_COLUMNS = `
  attachment_id, organization_id, draft_id, client_attachment_key,
  media_type, file_name, mime_type, size_bytes, sha256, storage_uri,
  uploaded_by, deleted_at, created_at
`;

const DETAIL_JOINS = `
  LEFT JOIN recording r
    ON r.organization_id = d.organization_id AND r.recording_id = d.recording_id
  LEFT JOIN LATERAL (
    SELECT t.transcription_id, t.status AS t_status, t.transcript, t.detected_language, t.error_code
      FROM transcription t
     WHERE t.organization_id = d.organization_id AND t.recording_id = d.recording_id
     ORDER BY t.attempt_number DESC
     LIMIT 1
  ) lt ON d.recording_id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT ed.id AS ed_id, ed.status AS ed_status, ed.missing_fields, ed.extraction
      FROM extraction_draft ed
     WHERE ed.organization_id = d.organization_id
       AND (ed.id = d.extraction_draft_id OR (d.extraction_draft_id IS NULL AND ed.recording_id = d.recording_id AND ed.status <> 'REJECTED'))
     ORDER BY (ed.status <> 'REJECTED') DESC, ed.created_at DESC
     LIMIT 1
  ) ed ON (d.extraction_draft_id IS NOT NULL OR d.recording_id IS NOT NULL)
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'attachment_id', a.attachment_id,
          'client_attachment_key', a.client_attachment_key,
          'media_type', a.media_type,
          'file_name', a.file_name,
          'mime_type', a.mime_type,
          'size_bytes', a.size_bytes,
          'created_at', a.created_at
        )
        ORDER BY a.created_at ASC
      ),
      '[]'::json
    ) AS attachments
    FROM draft_attachment a
    WHERE a.organization_id = d.organization_id AND a.draft_id = d.draft_id AND a.deleted_at IS NULL
  ) att ON TRUE
`;

const DETAIL_SELECT_COLUMNS = `
  ${DRAFT_COLUMNS},
  r.recording_id AS rec_id, r.processing_status AS rec_status, r.mime_type AS rec_mime_type,
  r.size_bytes AS rec_size_bytes, r.duration_ms AS rec_duration_ms,
  r.failure_code AS rec_failure_code, r.failure_message AS rec_failure_message,
  lt.transcription_id AS tr_id, lt.t_status AS tr_status, lt.transcript AS tr_transcript,
  lt.detected_language AS tr_lang, lt.error_code AS tr_error_code,
  ed.ed_id, ed.ed_status, ed.missing_fields AS ed_missing_fields, ed.extraction AS ed_extraction,
  att.attachments AS attachments_json
`;

function mapDraftRow(r: any): TechnicianDraftRow {
  return {
    draft_id: r.draft_id,
    organization_id: r.organization_id,
    client_draft_id: r.client_draft_id,
    created_by: r.created_by,
    recording_id: r.recording_id ?? null,
    extraction_draft_id: r.extraction_draft_id ?? null,
    case_id: r.case_id ?? null,
    capture_mode: r.capture_mode,
    equipment: r.equipment ?? '',
    subsystem: r.subsystem ?? '',
    symptom: r.symptom ?? '',
    observation: r.observation ?? '',
    probable_cause: r.probable_cause ?? '',
    action_taken: r.action_taken ?? '',
    parts_used: r.parts_used ?? '',
    safety_notes: r.safety_notes ?? '',
    duration_ms: r.duration_ms ?? null,
    recorded_at: optIso(r.recorded_at),
    client_created_at: optIso(r.client_created_at),
    client_updated_at: optIso(r.client_updated_at),
    status: r.status,
    reviewed_by: r.reviewed_by ?? null,
    reviewed_at: optIso(r.reviewed_at),
    review_comment: r.review_comment ?? null,
    deleted_at: optIso(r.deleted_at),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

function mapDetail(r: any): TechnicianDraftDetail {
  const attachmentsRaw = Array.isArray(r.attachments_json) ? r.attachments_json : [];
  return {
    draft: mapDraftRow(r),
    recording: r.rec_id
      ? {
          id: r.rec_id,
          processing_status: r.rec_status,
          mime_type: r.rec_mime_type,
          size_bytes: Number(r.rec_size_bytes),
          duration_ms: r.rec_duration_ms ?? null,
          failure_code: r.rec_failure_code ?? null,
          failure_message: r.rec_failure_message ?? null,
        }
      : null,
    transcription: r.tr_id
      ? {
          id: r.tr_id,
          status: r.tr_status,
          transcript: r.tr_transcript ?? null,
          detected_language: r.tr_lang ?? null,
          error_code: r.tr_error_code ?? null,
        }
      : null,
    extraction_draft: r.ed_id
      ? {
          id: r.ed_id,
          status: r.ed_status,
          missing_fields: Array.isArray(r.ed_missing_fields) ? r.ed_missing_fields : [],
          extraction: (r.ed_extraction && typeof r.ed_extraction === 'object' ? r.ed_extraction : {}) as Record<string, unknown>,
        }
      : null,
    attachments: attachmentsRaw.map((a: any) => ({
      attachment_id: a.attachment_id,
      client_attachment_key: a.client_attachment_key,
      media_type: a.media_type,
      file_name: a.file_name,
      mime_type: a.mime_type,
      size_bytes: Number(a.size_bytes),
      created_at: iso(a.created_at),
    })),
  };
}

function mapAttachmentRow(r: any): DraftAttachmentRow {
  return {
    attachment_id: r.attachment_id,
    organization_id: r.organization_id,
    draft_id: r.draft_id,
    client_attachment_key: r.client_attachment_key,
    media_type: r.media_type,
    file_name: r.file_name,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    storage_uri: r.storage_uri,
    uploaded_by: r.uploaded_by,
    deleted_at: optIso(r.deleted_at),
    created_at: iso(r.created_at),
  };
}

async function insertAudit(
  db: Queryable,
  org: string,
  actor: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await db.query(
    'INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [org, actor, action, entityType, entityId, JSON.stringify(details)],
  );
}

async function verifyReferences(
  db: Queryable,
  org: string,
  actor: string,
  role: Role,
  refs: { recordingId?: string | null; extractionDraftId?: string | null; caseId?: string | null },
): Promise<void> {
  if (refs.recordingId) {
    const rec = await db.query(
      'SELECT recording_id, uploaded_by FROM recording WHERE organization_id = $1 AND recording_id = $2',
      [org, refs.recordingId],
    );
    const row = rec.rows[0];
    if (!row || (role === 'TECHNICIAN' && row.uploaded_by !== actor)) {
      throw notFound('Referenced recording was not found.', 'RECORDING_NOT_FOUND');
    }
  }
  if (refs.extractionDraftId) {
    const ed = await db.query(
      'SELECT id FROM extraction_draft WHERE organization_id = $1 AND id = $2',
      [org, refs.extractionDraftId],
    );
    if (!ed.rows[0]) {
      throw notFound('Referenced extraction draft was not found.', 'EXTRACTION_DRAFT_NOT_FOUND');
    }
  }
  if (refs.caseId) {
    const oc = await db.query(
      'SELECT case_id FROM operational_case WHERE organization_id = $1 AND case_id = $2 AND deleted_at IS NULL',
      [org, refs.caseId],
    );
    if (!oc.rows[0]) {
      throw notFound('Referenced operational case was not found.', 'CASE_NOT_FOUND');
    }
  }
}

async function readDetailById(db: Queryable, org: string, draftId: string): Promise<TechnicianDraftDetail | null> {
  const res = await db.query(
    `SELECT ${DETAIL_SELECT_COLUMNS}
       FROM technician_draft d
       ${DETAIL_JOINS}
      WHERE d.organization_id = $1 AND d.draft_id = $2 AND d.deleted_at IS NULL`,
    [org, draftId],
  );
  return res.rows[0] ? mapDetail(res.rows[0]) : null;
}

export class PostgresDraftSyncStore implements DraftSyncStore {
  constructor(private readonly pool: PoolLike) {}

  upsertDraft(organizationId: string, actorId: string, role: Role, input: UpsertDraftInput) {
    return withTenant(this.pool, organizationId, async (db) => {
      await verifyReferences(db, organizationId, actorId, role, input);

      const existingCheck = await db.query(
        `SELECT draft_id, created_by, status, deleted_at
           FROM technician_draft
          WHERE organization_id = $1 AND client_draft_id = $2`,
        [organizationId, input.clientDraftId],
      );
      const prior = existingCheck.rows[0];
      if (prior) {
        if (role === 'TECHNICIAN' && prior.created_by !== actorId) {
          throw conflict('IDEMPOTENCY_KEY_REUSED', 'This clientDraftId belongs to another user.');
        }
        if (prior.deleted_at !== null) {
          throw conflict('DRAFT_DELETED', 'This draft has been deleted and cannot be updated.');
        }
        if (prior.status === 'APPROVED' || prior.status === 'REJECTED') {
          throw conflict('DRAFT_ALREADY_DECIDED', 'This draft has already been decided and cannot be overwritten.');
        }
      }

      const up = await db.query(
        `INSERT INTO technician_draft (
           organization_id, client_draft_id, created_by,
           recording_id, extraction_draft_id, case_id,
           capture_mode, equipment, subsystem, symptom, observation,
           probable_cause, action_taken, parts_used, safety_notes,
           duration_ms, recorded_at, client_created_at, client_updated_at, status
         )
         VALUES (
           $1, $2, $3,
           $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16, $17, $18, $19, $20
         )
         ON CONFLICT (organization_id, client_draft_id) DO UPDATE SET
           recording_id        = COALESCE(EXCLUDED.recording_id, technician_draft.recording_id),
           extraction_draft_id = COALESCE(EXCLUDED.extraction_draft_id, technician_draft.extraction_draft_id),
           case_id             = COALESCE(EXCLUDED.case_id, technician_draft.case_id),
           capture_mode        = EXCLUDED.capture_mode,
           equipment           = EXCLUDED.equipment,
           subsystem           = EXCLUDED.subsystem,
           symptom             = EXCLUDED.symptom,
           observation         = EXCLUDED.observation,
           probable_cause      = EXCLUDED.probable_cause,
           action_taken        = EXCLUDED.action_taken,
           parts_used          = EXCLUDED.parts_used,
           safety_notes        = EXCLUDED.safety_notes,
           duration_ms         = COALESCE(EXCLUDED.duration_ms, technician_draft.duration_ms),
           recorded_at         = COALESCE(EXCLUDED.recorded_at, technician_draft.recorded_at),
           client_created_at   = COALESCE(technician_draft.client_created_at, EXCLUDED.client_created_at),
           client_updated_at   = COALESCE(EXCLUDED.client_updated_at, technician_draft.client_updated_at),
           status              = EXCLUDED.status,
           updated_at          = NOW()
         WHERE technician_draft.deleted_at IS NULL
           AND technician_draft.status IN ('DRAFT', 'PENDING_REVIEW')
         RETURNING draft_id, (xmax = 0) AS was_inserted`,
        [
          organizationId,
          input.clientDraftId,
          actorId,
          input.recordingId,
          input.extractionDraftId,
          input.caseId,
          input.captureMode,
          input.equipment,
          input.subsystem,
          input.symptom,
          input.observation,
          input.probableCause,
          input.actionTaken,
          input.partsUsed,
          input.safetyNotes,
          input.durationMs,
          input.recordedAt,
          input.clientCreatedAt,
          input.clientUpdatedAt,
          input.status,
        ],
      );

      if (!up.rows[0]) {
        throw conflict('DRAFT_ALREADY_DECIDED', 'This draft has already been decided or deleted and cannot be overwritten.');
      }

      const draftId = up.rows[0].draft_id as string;
      const created = up.rows[0].was_inserted === true;
      await insertAudit(
        db,
        organizationId,
        actorId,
        created ? 'DRAFT_CREATED' : 'DRAFT_SYNCED',
        'technician_draft',
        draftId,
        { client_draft_id: input.clientDraftId, capture_mode: input.captureMode, status: input.status },
      );

      const detail = await readDetailById(db, organizationId, draftId);
      if (!detail) throw notFound('Draft not found', 'DRAFT_NOT_FOUND');
      return { detail, created };
    });
  }

  listDrafts(organizationId: string, filter: DraftListFilter) {
    return withTenant(this.pool, organizationId, async (db) => {
      const searchPattern = filter.q ? `%${filter.q}%` : null;
      const whereSql = `
        WHERE d.organization_id = $1
          AND d.deleted_at IS NULL
          AND ($2::uuid IS NULL OR d.created_by = $2)
          AND ($3::text IS NULL OR d.status = $3)
          AND ($4::text IS NULL OR d.capture_mode = $4)
          AND (
            $5::text IS NULL
            OR d.equipment ILIKE $5
            OR d.subsystem ILIKE $5
            OR d.symptom ILIKE $5
            OR d.observation ILIKE $5
            OR d.probable_cause ILIKE $5
            OR d.action_taken ILIKE $5
            OR d.parts_used ILIKE $5
            OR d.safety_notes ILIKE $5
          )
      `;
      const baseParams = [
        organizationId,
        filter.createdBy ?? null,
        filter.status ?? null,
        filter.mode ?? null,
        searchPattern,
      ];
      const countRes = await db.query(
        `SELECT COUNT(*)::int AS total FROM technician_draft d ${whereSql}`,
        baseParams,
      );
      const total = Number(countRes.rows[0]?.total ?? 0);

      const rowsRes = await db.query(
        `SELECT ${DETAIL_SELECT_COLUMNS}
           FROM technician_draft d
           ${DETAIL_JOINS}
           ${whereSql}
          ORDER BY d.created_at DESC, d.draft_id
          LIMIT $6 OFFSET $7`,
        [...baseParams, filter.limit, filter.offset],
      );
      return { items: rowsRes.rows.map(mapDetail), total };
    });
  }

  getDraft(organizationId: string, draftId: string, createdByFilter?: string) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT ${DETAIL_SELECT_COLUMNS}
           FROM technician_draft d
           ${DETAIL_JOINS}
          WHERE d.organization_id = $1
            AND d.draft_id = $2
            AND d.deleted_at IS NULL
            AND ($3::uuid IS NULL OR d.created_by = $3)`,
        [organizationId, draftId, createdByFilter ?? null],
      );
      return res.rows[0] ? mapDetail(res.rows[0]) : null;
    });
  }

  patchDraft(organizationId: string, actorId: string, role: Role, draftId: string, patch: PatchDraftInput) {
    return withTenant(this.pool, organizationId, async (db) => {
      const existing = await db.query(
        `SELECT draft_id, created_by, status
           FROM technician_draft
          WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL`,
        [organizationId, draftId],
      );
      const row = existing.rows[0];
      if (!row || (role === 'TECHNICIAN' && row.created_by !== actorId)) {
        throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
      }
      if (row.status === 'APPROVED' || row.status === 'REJECTED') {
        throw conflict('DRAFT_ALREADY_DECIDED', 'Decided drafts cannot be modified.');
      }

      await verifyReferences(db, organizationId, actorId, role, patch);

      const sets: string[] = [];
      const values: unknown[] = [organizationId, draftId];
      const push = (col: string, val: unknown) => {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      };

      if (patch.recordingId !== undefined) push('recording_id', patch.recordingId);
      if (patch.extractionDraftId !== undefined) push('extraction_draft_id', patch.extractionDraftId);
      if (patch.caseId !== undefined) push('case_id', patch.caseId);
      if (patch.captureMode !== undefined) push('capture_mode', patch.captureMode);
      if (patch.equipment !== undefined) push('equipment', patch.equipment);
      if (patch.subsystem !== undefined) push('subsystem', patch.subsystem);
      if (patch.symptom !== undefined) push('symptom', patch.symptom);
      if (patch.observation !== undefined) push('observation', patch.observation);
      if (patch.probableCause !== undefined) push('probable_cause', patch.probableCause);
      if (patch.actionTaken !== undefined) push('action_taken', patch.actionTaken);
      if (patch.partsUsed !== undefined) push('parts_used', patch.partsUsed);
      if (patch.safetyNotes !== undefined) push('safety_notes', patch.safetyNotes);
      if (patch.durationMs !== undefined) push('duration_ms', patch.durationMs);
      if (patch.recordedAt !== undefined) push('recorded_at', patch.recordedAt);
      if (patch.clientUpdatedAt !== undefined) push('client_updated_at', patch.clientUpdatedAt);
      if (patch.status !== undefined) push('status', patch.status);
      sets.push('updated_at = NOW()');

      const up = await db.query(
        `UPDATE technician_draft
            SET ${sets.join(', ')}
          WHERE organization_id = $1
            AND draft_id = $2
            AND deleted_at IS NULL
            AND status IN ('DRAFT', 'PENDING_REVIEW')
          RETURNING draft_id`,
        values,
      );
      if (!up.rows[0]) {
        throw conflict('DRAFT_ALREADY_DECIDED', 'Decided drafts cannot be modified.');
      }

      await insertAudit(db, organizationId, actorId, 'DRAFT_UPDATED', 'technician_draft', draftId, {
        updated_fields: Object.keys(patch),
      });

      const detail = await readDetailById(db, organizationId, draftId);
      if (!detail) throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
      return detail;
    });
  }

  decideDraft(organizationId: string, reviewerId: string, draftId: string, decision: DraftDecision, comment: string | null) {
    return withTenant(this.pool, organizationId, async (db) => {
      const up = await db.query(
        `UPDATE technician_draft
            SET status = $1,
                reviewed_by = $2,
                reviewed_at = NOW(),
                review_comment = $3,
                updated_at = NOW()
          WHERE organization_id = $4
            AND draft_id = $5
            AND status IN ('DRAFT', 'PENDING_REVIEW')
            AND deleted_at IS NULL
          RETURNING draft_id`,
        [decision, reviewerId, comment, organizationId, draftId],
      );

      if (!up.rows[0]) {
        const check = await db.query(
          'SELECT draft_id, status FROM technician_draft WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL',
          [organizationId, draftId],
        );
        if (!check.rows[0]) {
          throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
        }
        throw conflict('DRAFT_ALREADY_DECIDED', `Draft has already been ${String(check.rows[0].status).toLowerCase()}.`);
      }

      await insertAudit(
        db,
        organizationId,
        reviewerId,
        decision === 'APPROVED' ? 'DRAFT_APPROVED' : 'DRAFT_REJECTED',
        'technician_draft',
        draftId,
        { decision, comment },
      );

      const detail = await readDetailById(db, organizationId, draftId);
      if (!detail) throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
      return detail;
    });
  }

  softDeleteDraft(organizationId: string, actorId: string, role: Role, draftId: string) {
    return withTenant(this.pool, organizationId, async (db) => {
      const existing = await db.query(
        `SELECT draft_id, created_by, status
           FROM technician_draft
          WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL`,
        [organizationId, draftId],
      );
      const row = existing.rows[0];
      if (!row || (role === 'TECHNICIAN' && row.created_by !== actorId)) {
        return false;
      }
      if (role === 'TECHNICIAN' && (row.status === 'APPROVED' || row.status === 'REJECTED')) {
        throw conflict('DRAFT_FINALIZED', 'Finalized drafts cannot be deleted by a technician.');
      }

      const up = await db.query(
        `UPDATE technician_draft
            SET deleted_at = NOW(), updated_at = NOW()
          WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL
          RETURNING draft_id`,
        [organizationId, draftId],
      );
      if (!up.rows[0]) return false;

      await insertAudit(db, organizationId, actorId, 'DRAFT_DELETED', 'technician_draft', draftId, {});
      return true;
    });
  }

  ensureDraftForAttachmentUpload(organizationId: string, actorId: string, role: Role, draftId: string) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT draft_id, created_by, status
           FROM technician_draft
          WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL`,
        [organizationId, draftId],
      );
      const row = res.rows[0];
      if (!row || (role === 'TECHNICIAN' && row.created_by !== actorId)) {
        throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
      }
      if (row.status === 'APPROVED' || row.status === 'REJECTED') {
        throw conflict('DRAFT_ALREADY_DECIDED', 'Cannot attach files to a finalized draft.');
      }
    });
  }

  insertAttachmentIfAbsent(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
    input: NewDraftAttachment,
  ) {
    return withTenant(this.pool, organizationId, async (db) => {
      const draftRes = await db.query(
        `SELECT draft_id, created_by, status
           FROM technician_draft
          WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL`,
        [organizationId, draftId],
      );
      const draft = draftRes.rows[0];
      if (!draft || (role === 'TECHNICIAN' && draft.created_by !== actorId)) {
        throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
      }
      if (draft.status === 'APPROVED' || draft.status === 'REJECTED') {
        throw conflict('DRAFT_ALREADY_DECIDED', 'Cannot attach files to a finalized draft.');
      }

      const ins = await db.query(
        `INSERT INTO draft_attachment (
           attachment_id, organization_id, draft_id, client_attachment_key,
           media_type, file_name, mime_type, size_bytes, sha256, storage_uri, uploaded_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (organization_id, draft_id, client_attachment_key) DO NOTHING
         RETURNING ${ATTACHMENT_COLUMNS}`,
        [
          input.attachmentId,
          organizationId,
          draftId,
          input.clientAttachmentKey,
          input.mediaType,
          input.fileName,
          input.mimeType,
          input.sizeBytes,
          input.sha256,
          input.storageUri,
          actorId,
        ],
      );

      if (ins.rows[0]) {
        await insertAudit(db, organizationId, actorId, 'DRAFT_ATTACHMENT_ADDED', 'draft_attachment', input.attachmentId, {
          draft_id: draftId,
          media_type: input.mediaType,
          size_bytes: input.sizeBytes,
        });
        return { attachment: mapAttachmentRow(ins.rows[0]), created: true };
      }

      const existing = await db.query(
        `SELECT ${ATTACHMENT_COLUMNS}
           FROM draft_attachment
          WHERE organization_id = $1 AND draft_id = $2 AND client_attachment_key = $3`,
        [organizationId, draftId, input.clientAttachmentKey],
      );
      const row = existing.rows[0];
      if (!row || row.deleted_at !== null) {
        throw conflict('ATTACHMENT_DELETED', 'This attachment key was previously deleted.');
      }
      if (row.sha256 !== input.sha256) {
        throw conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different attachment.');
      }
      return { attachment: mapAttachmentRow(row), created: false };
    });
  }

  getAttachment(organizationId: string, draftId: string, attachmentId: string, createdByFilter?: string) {
    return withTenant(this.pool, organizationId, async (db) => {
      const res = await db.query(
        `SELECT a.attachment_id, a.organization_id, a.draft_id, a.client_attachment_key,
                a.media_type, a.file_name, a.mime_type, a.size_bytes, a.sha256, a.storage_uri,
                a.uploaded_by, a.deleted_at, a.created_at
           FROM draft_attachment a
           JOIN technician_draft d
             ON d.organization_id = a.organization_id AND d.draft_id = a.draft_id
          WHERE a.organization_id = $1
            AND a.draft_id = $2
            AND a.attachment_id = $3
            AND a.deleted_at IS NULL
            AND d.deleted_at IS NULL
            AND ($4::uuid IS NULL OR d.created_by = $4)`,
        [organizationId, draftId, attachmentId, createdByFilter ?? null],
      );
      return res.rows[0] ? mapAttachmentRow(res.rows[0]) : null;
    });
  }

  softDeleteAttachment(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
    attachmentId: string,
  ) {
    return withTenant(this.pool, organizationId, async (db) => {
      const draftRes = await db.query(
        `SELECT draft_id, created_by, status
           FROM technician_draft
          WHERE organization_id = $1 AND draft_id = $2 AND deleted_at IS NULL`,
        [organizationId, draftId],
      );
      const draft = draftRes.rows[0];
      if (!draft || (role === 'TECHNICIAN' && draft.created_by !== actorId)) {
        return false;
      }
      if (role === 'TECHNICIAN' && (draft.status === 'APPROVED' || draft.status === 'REJECTED')) {
        throw conflict('DRAFT_FINALIZED', 'Attachments on a finalized draft cannot be deleted by a technician.');
      }

      const up = await db.query(
        `UPDATE draft_attachment
            SET deleted_at = NOW()
          WHERE organization_id = $1 AND draft_id = $2 AND attachment_id = $3 AND deleted_at IS NULL
          RETURNING attachment_id`,
        [organizationId, draftId, attachmentId],
      );
      if (!up.rows[0]) return false;

      await insertAudit(db, organizationId, actorId, 'DRAFT_ATTACHMENT_DELETED', 'draft_attachment', attachmentId, {
        draft_id: draftId,
      });
      return true;
    });
  }
}
