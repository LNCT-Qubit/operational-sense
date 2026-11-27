import path from 'node:path';
import { badRequest, payloadTooLarge, unsupportedMediaType } from '../../http/errors';
import { compileValidator, headerValue } from '../../http/validation';
import type { HttpRequest } from '../../http/types';
import { isUuid } from '../../middleware/auth';
import type {
  AttachmentMediaType,
  CaptureMode,
  DraftDecision,
  DraftStatus,
  PatchDraftInput,
  UpsertDraftInput,
} from './draft.types';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_DURATION_MS = 60 * 60 * 1000;

const UPSERT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    clientDraftId: { type: 'string' },
    client_draft_id: { type: 'string' },
    id: { type: 'string' },
    recordingId: { type: ['string', 'null'] },
    recording_id: { type: ['string', 'null'] },
    serverRecordingId: { type: ['string', 'null'] },
    extractionDraftId: { type: ['string', 'null'] },
    extraction_draft_id: { type: ['string', 'null'] },
    caseId: { type: ['string', 'null'] },
    case_id: { type: ['string', 'null'] },
    captureMode: { type: 'string' },
    capture_mode: { type: 'string' },
    mode: { type: 'string' },
    equipment: { type: 'string', maxLength: 1000 },
    subsystem: { type: 'string', maxLength: 1000 },
    symptom: { type: 'string', maxLength: 4000 },
    observation: { type: 'string', maxLength: 10000 },
    probableCause: { type: 'string', maxLength: 4000 },
    probable_cause: { type: 'string', maxLength: 4000 },
    cause: { type: 'string', maxLength: 4000 },
    actionTaken: { type: 'string', maxLength: 4000 },
    action_taken: { type: 'string', maxLength: 4000 },
    action: { type: 'string', maxLength: 4000 },
    partsUsed: { type: 'string', maxLength: 4000 },
    parts_used: { type: 'string', maxLength: 4000 },
    parts: { type: 'string', maxLength: 4000 },
    safetyNotes: { type: 'string', maxLength: 4000 },
    safety_notes: { type: 'string', maxLength: 4000 },
    safety: { type: 'string', maxLength: 4000 },
    durationMs: { type: ['number', 'null'] },
    duration_ms: { type: ['number', 'null'] },
    duration: { type: ['number', 'null'] },
    recordedAt: { type: ['string', 'number', 'null'] },
    recorded_at: { type: ['string', 'number', 'null'] },
    date: { type: ['string', 'number', 'null'] },
    clientCreatedAt: { type: ['string', 'number', 'null'] },
    client_created_at: { type: ['string', 'number', 'null'] },
    createdAt: { type: ['string', 'number', 'null'] },
    clientUpdatedAt: { type: ['string', 'number', 'null'] },
    client_updated_at: { type: ['string', 'number', 'null'] },
    updatedAt: { type: ['string', 'number', 'null'] },
    status: { type: 'string' },
  },
};

const PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    recordingId: { type: ['string', 'null'] },
    recording_id: { type: ['string', 'null'] },
    extractionDraftId: { type: ['string', 'null'] },
    extraction_draft_id: { type: ['string', 'null'] },
    caseId: { type: ['string', 'null'] },
    case_id: { type: ['string', 'null'] },
    captureMode: { type: 'string' },
    capture_mode: { type: 'string' },
    mode: { type: 'string' },
    equipment: { type: 'string', maxLength: 1000 },
    subsystem: { type: 'string', maxLength: 1000 },
    symptom: { type: 'string', maxLength: 4000 },
    observation: { type: 'string', maxLength: 10000 },
    probableCause: { type: 'string', maxLength: 4000 },
    probable_cause: { type: 'string', maxLength: 4000 },
    cause: { type: 'string', maxLength: 4000 },
    actionTaken: { type: 'string', maxLength: 4000 },
    action_taken: { type: 'string', maxLength: 4000 },
    action: { type: 'string', maxLength: 4000 },
    partsUsed: { type: 'string', maxLength: 4000 },
    parts_used: { type: 'string', maxLength: 4000 },
    parts: { type: 'string', maxLength: 4000 },
    safetyNotes: { type: 'string', maxLength: 4000 },
    safety_notes: { type: 'string', maxLength: 4000 },
    safety: { type: 'string', maxLength: 4000 },
    durationMs: { type: ['number', 'null'] },
    duration_ms: { type: ['number', 'null'] },
    recordedAt: { type: ['string', 'number', 'null'] },
    recorded_at: { type: ['string', 'number', 'null'] },
    clientUpdatedAt: { type: ['string', 'number', 'null'] },
    client_updated_at: { type: ['string', 'number', 'null'] },
    status: { type: 'string' },
  },
};

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision'],
  properties: {
    decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
    comment: { type: ['string', 'null'], maxLength: 4000 },
  },
};

const checkUpsertShape = compileValidator<Record<string, unknown>>(UPSERT_SCHEMA);
const checkPatchShape = compileValidator<Record<string, unknown>>(PATCH_SCHEMA);
const checkDecisionShape = compileValidator<{ decision: DraftDecision; comment?: string | null }>(DECISION_SCHEMA);

export function normalizeCaptureMode(raw: unknown, field = 'captureMode'): CaptureMode {
  if (typeof raw !== 'string') {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field, issue: 'must be "voice" or "text"' },
    ]);
  }
  const lower = raw.trim().toLowerCase();
  if (lower !== 'voice' && lower !== 'text') {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field, issue: 'must be "voice" or "text"' },
    ]);
  }
  return lower;
}

function optionalUuid(raw: unknown, field: string): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !isUuid(raw)) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field, issue: 'must be a valid UUID or null' },
    ]);
  }
  return raw.toLowerCase();
}

function optionalDuration(raw: unknown, field: string): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > MAX_DURATION_MS) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field, issue: `must be an integer between 0 and ${MAX_DURATION_MS}` },
    ]);
  }
  return Math.round(raw);
}

function optionalTimestamp(raw: unknown, field: string): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) {
      throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
        { field, issue: 'must be a valid ISO-8601 timestamp or epoch milliseconds' },
      ]);
    }
    return new Date(raw).toISOString();
  }
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (Number.isNaN(ms)) {
      throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
        { field, issue: 'must be a valid ISO-8601 date-time' },
      ]);
    }
    return new Date(ms).toISOString();
  }
  throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
    { field, issue: 'must be a valid ISO-8601 date-time' },
  ]);
}

function pickFirstDefined<T>(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
      return obj[k];
    }
  }
  return undefined;
}

function strOrDefault(obj: Record<string, unknown>, keys: string[]): string {
  const val = pickFirstDefined(obj, keys);
  return typeof val === 'string' ? val.trim() : '';
}

function optionalTrimmed(obj: Record<string, unknown>, keys: string[]): string | undefined {
  const val = pickFirstDefined(obj, keys);
  return typeof val === 'string' ? val.trim() : undefined;
}

function parseEditableStatus(raw: unknown): 'DRAFT' | 'PENDING_REVIEW' {
  if (raw === undefined) return 'PENDING_REVIEW';
  if (typeof raw !== 'string') {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'status', issue: 'must be "DRAFT" or "PENDING_REVIEW"' },
    ]);
  }
  const upper = raw.trim().toUpperCase();
  if (upper !== 'DRAFT' && upper !== 'PENDING_REVIEW') {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'status', issue: 'must be "DRAFT" or "PENDING_REVIEW"' },
    ]);
  }
  return upper;
}

export function validateUpsertDraft(body: unknown, idempotencyHeader?: string): UpsertDraftInput {
  const obj = checkUpsertShape(body);
  const bodyKeyRaw = pickFirstDefined(obj, ['clientDraftId', 'client_draft_id', 'id']);
  const headerKey = idempotencyHeader?.trim();

  if (headerKey !== undefined && headerKey !== '' && !isUuid(headerKey)) {
    throw badRequest('INVALID_IDEMPOTENCY_KEY', 'The "Idempotency-Key" header must be a valid UUID.');
  }
  if (bodyKeyRaw !== undefined && (typeof bodyKeyRaw !== 'string' || !isUuid(bodyKeyRaw))) {
    throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'clientDraftId', issue: 'must be a valid UUID' },
    ]);
  }
  if (headerKey && typeof bodyKeyRaw === 'string' && headerKey.toLowerCase() !== bodyKeyRaw.toLowerCase()) {
    throw badRequest('VALIDATION_ERROR', 'Idempotency-Key header does not match body clientDraftId.', [
      { field: 'clientDraftId', issue: 'must match Idempotency-Key header' },
    ]);
  }
  const clientDraftId = (headerKey || (bodyKeyRaw as string | undefined))?.toLowerCase();
  if (!clientDraftId) {
    throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Provide clientDraftId (UUID) in the body or as an "Idempotency-Key" header.');
  }

  const rawMode = pickFirstDefined(obj, ['captureMode', 'capture_mode', 'mode']);
  const captureMode = normalizeCaptureMode(rawMode ?? 'text', 'captureMode');

  const recordingId = optionalUuid(pickFirstDefined(obj, ['recordingId', 'recording_id', 'serverRecordingId']), 'recordingId') ?? null;
  const extractionDraftId = optionalUuid(pickFirstDefined(obj, ['extractionDraftId', 'extraction_draft_id']), 'extractionDraftId') ?? null;
  const caseId = optionalUuid(pickFirstDefined(obj, ['caseId', 'case_id']), 'caseId') ?? null;
  const durationMs = optionalDuration(pickFirstDefined(obj, ['durationMs', 'duration_ms', 'duration']), 'durationMs') ?? null;
  const recordedAt = optionalTimestamp(pickFirstDefined(obj, ['recordedAt', 'recorded_at', 'date']), 'recordedAt') ?? null;
  const clientCreatedAt = optionalTimestamp(pickFirstDefined(obj, ['clientCreatedAt', 'client_created_at', 'createdAt']), 'clientCreatedAt') ?? null;
  const clientUpdatedAt = optionalTimestamp(pickFirstDefined(obj, ['clientUpdatedAt', 'client_updated_at', 'updatedAt']), 'clientUpdatedAt') ?? null;
  const status = parseEditableStatus(obj.status);

  return {
    clientDraftId,
    recordingId,
    extractionDraftId,
    caseId,
    captureMode,
    equipment: strOrDefault(obj, ['equipment']),
    subsystem: strOrDefault(obj, ['subsystem']),
    symptom: strOrDefault(obj, ['symptom']),
    observation: strOrDefault(obj, ['observation']),
    probableCause: strOrDefault(obj, ['probableCause', 'probable_cause', 'cause']),
    actionTaken: strOrDefault(obj, ['actionTaken', 'action_taken', 'action']),
    partsUsed: strOrDefault(obj, ['partsUsed', 'parts_used', 'parts']),
    safetyNotes: strOrDefault(obj, ['safetyNotes', 'safety_notes', 'safety']),
    durationMs,
    recordedAt,
    clientCreatedAt,
    clientUpdatedAt,
    status,
  };
}

export function validatePatchDraft(body: unknown): PatchDraftInput {
  const obj = checkPatchShape(body);
  const out: PatchDraftInput = {};

  const rawMode = pickFirstDefined(obj, ['captureMode', 'capture_mode', 'mode']);
  if (rawMode !== undefined) out.captureMode = normalizeCaptureMode(rawMode, 'captureMode');

  const recId = optionalUuid(pickFirstDefined(obj, ['recordingId', 'recording_id']), 'recordingId');
  if (recId !== undefined) out.recordingId = recId;

  const exId = optionalUuid(pickFirstDefined(obj, ['extractionDraftId', 'extraction_draft_id']), 'extractionDraftId');
  if (exId !== undefined) out.extractionDraftId = exId;

  const cId = optionalUuid(pickFirstDefined(obj, ['caseId', 'case_id']), 'caseId');
  if (cId !== undefined) out.caseId = cId;

  const equipment = optionalTrimmed(obj, ['equipment']);
  if (equipment !== undefined) out.equipment = equipment;

  const subsystem = optionalTrimmed(obj, ['subsystem']);
  if (subsystem !== undefined) out.subsystem = subsystem;

  const symptom = optionalTrimmed(obj, ['symptom']);
  if (symptom !== undefined) out.symptom = symptom;

  const observation = optionalTrimmed(obj, ['observation']);
  if (observation !== undefined) out.observation = observation;

  const probableCause = optionalTrimmed(obj, ['probableCause', 'probable_cause', 'cause']);
  if (probableCause !== undefined) out.probableCause = probableCause;

  const actionTaken = optionalTrimmed(obj, ['actionTaken', 'action_taken', 'action']);
  if (actionTaken !== undefined) out.actionTaken = actionTaken;

  const partsUsed = optionalTrimmed(obj, ['partsUsed', 'parts_used', 'parts']);
  if (partsUsed !== undefined) out.partsUsed = partsUsed;

  const safetyNotes = optionalTrimmed(obj, ['safetyNotes', 'safety_notes', 'safety']);
  if (safetyNotes !== undefined) out.safetyNotes = safetyNotes;

  const durationMs = optionalDuration(pickFirstDefined(obj, ['durationMs', 'duration_ms']), 'durationMs');
  if (durationMs !== undefined) out.durationMs = durationMs;

  const recordedAt = optionalTimestamp(pickFirstDefined(obj, ['recordedAt', 'recorded_at']), 'recordedAt');
  if (recordedAt !== undefined) out.recordedAt = recordedAt;

  const clientUpdatedAt = optionalTimestamp(pickFirstDefined(obj, ['clientUpdatedAt', 'client_updated_at']), 'clientUpdatedAt');
  if (clientUpdatedAt !== undefined) out.clientUpdatedAt = clientUpdatedAt;

  if (obj.status !== undefined) {
    out.status = parseEditableStatus(obj.status);
  }

  return out;
}

export function validateDecision(body: unknown): { decision: DraftDecision; comment: string | null } {
  const parsed = checkDecisionShape(body);
  const comment = typeof parsed.comment === 'string' && parsed.comment.trim() ? parsed.comment.trim() : null;
  return { decision: parsed.decision, comment };
}

export function parseDraftListQuery(query: Record<string, unknown>): {
  status?: DraftStatus;
  mode?: CaptureMode;
  q?: string;
} {
  let status: DraftStatus | undefined;
  if (query.status !== undefined && query.status !== '') {
    if (typeof query.status !== 'string') {
      throw badRequest('INVALID_QUERY', 'status must be DRAFT, PENDING_REVIEW, APPROVED, or REJECTED.');
    }
    const upper = query.status.trim().toUpperCase();
    if (!['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(upper)) {
      throw badRequest('INVALID_QUERY', 'status must be DRAFT, PENDING_REVIEW, APPROVED, or REJECTED.');
    }
    status = upper as DraftStatus;
  }

  let mode: CaptureMode | undefined;
  if (query.mode !== undefined && query.mode !== '') {
    if (typeof query.mode !== 'string') {
      throw badRequest('INVALID_QUERY', 'mode must be "voice" or "text".');
    }
    const lower = query.mode.trim().toLowerCase();
    if (lower !== 'voice' && lower !== 'text') {
      throw badRequest('INVALID_QUERY', 'mode must be "voice" or "text".');
    }
    mode = lower;
  }

  let q: string | undefined;
  if (query.q !== undefined && query.q !== '') {
    if (typeof query.q !== 'string' || query.q.length > 200) {
      throw badRequest('INVALID_QUERY', 'q must be a search string up to 200 characters.');
    }
    const trimmed = query.q.trim();
    if (trimmed) q = trimmed;
  }

  return { status, mode, q };
}

const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'application/pdf': 'pdf',
};

export interface ValidatedAttachmentUpload {
  clientAttachmentKey: string;
  fileName: string;
  mimeType: string;
  mediaType: AttachmentMediaType;
  ext: string;
  body: Buffer;
}

export function validateAttachmentUpload(req: HttpRequest, maxBytes = MAX_ATTACHMENT_BYTES): ValidatedAttachmentUpload {
  const key = headerValue(req, 'idempotency-key')?.trim();
  if (!key || key.length > 255) {
    throw badRequest('INVALID_IDEMPOTENCY_KEY', 'Send a non-empty "Idempotency-Key" header (up to 255 chars).');
  }

  const rawName = headerValue(req, 'x-file-name')?.trim();
  // eslint-disable-next-line no-control-regex
  const safeName = rawName ? path.posix.basename(rawName.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (!safeName || safeName === '.' || safeName === '..' || safeName.length > 255) {
    throw badRequest('INVALID_HEADER', 'Send a valid filename in the "X-File-Name" header.');
  }

  const rawCt = headerValue(req, 'content-type');
  const baseMime = rawCt ? rawCt.split(';')[0].trim().toLowerCase() : '';
  if (!/^(image|video|audio)\/[a-z0-9.+-]+$|^application\/pdf$/.test(baseMime)) {
    throw unsupportedMediaType('Attachment Content-Type must be image/*, video/*, audio/*, or application/pdf.');
  }

  if (!Buffer.isBuffer(req.body)) {
    throw unsupportedMediaType('Send raw attachment bytes in the request body.');
  }
  if (req.body.length === 0) {
    throw badRequest('EMPTY_BODY', 'The uploaded attachment is empty.');
  }
  if (req.body.length > maxBytes) {
    throw payloadTooLarge(`Attachment must be at most ${maxBytes} bytes.`);
  }

  const mediaType: AttachmentMediaType = baseMime.startsWith('image/')
    ? 'photo'
    : baseMime.startsWith('video/')
      ? 'video'
      : baseMime.startsWith('audio/')
        ? 'audio'
        : 'other';

  const ext = MIME_TO_EXT[baseMime] ?? 'bin';
  return { clientAttachmentKey: key, fileName: safeName, mimeType: baseMime, mediaType, ext, body: req.body };
}
