import { pipeStreamToResponse } from '../../http/stream';
import { asyncHandler, type Handler } from '../../http/types';
import { headerValue, parsePagination, requireUuidActor, requireUuidParam } from '../../http/validation';
import type { DraftAttachmentRow, DraftAttachmentMeta, TechnicianDraftDetail } from './draft.types';
import {
  MAX_ATTACHMENT_BYTES,
  parseDraftListQuery,
  validateAttachmentUpload,
  validateDecision,
  validatePatchDraft,
  validateUpsertDraft,
} from './draft.validation';
import type { TechnicianDraftService } from './draft.service';

const API_PREFIX = '/api/v1';

function attachmentView(draftId: string, a: DraftAttachmentMeta | DraftAttachmentRow) {
  return {
    id: a.attachment_id,
    client_attachment_key: a.client_attachment_key,
    media_type: a.media_type,
    file_name: a.file_name,
    mime_type: a.mime_type,
    size_bytes: a.size_bytes,
    created_at: a.created_at,
    download_url: `${API_PREFIX}/drafts/${draftId}/attachments/${a.attachment_id}`,
  };
}

export function draftDetailView(d: TechnicianDraftDetail) {
  const row = d.draft;
  return {
    id: row.draft_id,
    client_draft_id: row.client_draft_id,
    created_by: row.created_by,
    recording_id: row.recording_id,
    extraction_draft_id: row.extraction_draft_id,
    case_id: row.case_id,
    capture_mode: row.capture_mode,
    equipment: row.equipment,
    subsystem: row.subsystem,
    symptom: row.symptom,
    observation: row.observation,
    probable_cause: row.probable_cause,
    action_taken: row.action_taken,
    parts_used: row.parts_used,
    safety_notes: row.safety_notes,
    duration_ms: row.duration_ms,
    recorded_at: row.recorded_at,
    client_created_at: row.client_created_at,
    client_updated_at: row.client_updated_at,
    status: row.status,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    review_comment: row.review_comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
    recording: d.recording
      ? {
          ...d.recording,
          audio_url: `${API_PREFIX}/recordings/${d.recording.id}/audio`,
        }
      : null,
    transcription: d.transcription,
    extraction_draft: d.extraction_draft,
    attachments: d.attachments.map((a) => attachmentView(row.draft_id, a)),
  };
}

export function createDraftHandlers(service: TechnicianDraftService, maxAttachmentBytes = MAX_ATTACHMENT_BYTES) {
  const upsert: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const input = validateUpsertDraft(req.body, headerValue(req, 'idempotency-key'));
    const { detail, created } = await service.upsert(auth, input);
    res.setHeader('Location', `${API_PREFIX}/drafts/${detail.draft.draft_id}`);
    res.status(created ? 201 : 200).json({ duplicate: !created, draft: draftDetailView(detail) });
  });

  const list: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const { limit, offset } = parsePagination(req.query);
    const filters = parseDraftListQuery(req.query);
    const result = await service.list(auth, { limit, offset, ...filters });
    res.status(200).json({
      items: result.items.map(draftDetailView),
      count: result.items.length,
      total: result.total,
      limit,
      offset,
    });
  });

  const get: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    const detail = await service.get(auth, draftId);
    res.status(200).json({ draft: draftDetailView(detail) });
  });

  const patch: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    const body = validatePatchDraft(req.body);
    const detail = await service.patch(auth, draftId, body);
    res.status(200).json({ draft: draftDetailView(detail) });
  });

  const decide: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    const { decision, comment } = validateDecision(req.body);
    const detail = await service.decide(auth, draftId, decision, comment);
    res.status(200).json({ draft: draftDetailView(detail) });
  });

  const remove: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    await service.remove(auth, draftId);
    res.status(200).json({ deleted: true, id: draftId });
  });

  const uploadAttachment: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    const upload = validateAttachmentUpload(req, maxAttachmentBytes);
    const { attachment, created } = await service.uploadAttachment(auth, draftId, upload);
    res.setHeader('Location', `${API_PREFIX}/drafts/${draftId}/attachments/${attachment.attachment_id}`);
    res.status(created ? 201 : 200).json({
      duplicate: !created,
      attachment: attachmentView(draftId, attachment),
    });
  });

  const getAttachment: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    const attachmentId = requireUuidParam(req.params.attachmentId, 'attachment id');
    const opened = await service.getAttachmentStream(auth, draftId, attachmentId);

    const safeFileName = opened.attachment.file_name.replace(/["\\\r\n]/g, '_');
    res.setHeader('Content-Type', opened.attachment.mime_type);
    res.setHeader('Content-Length', String(opened.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200);

    const stream = opened.openStream();
    await pipeStreamToResponse(res, stream);
  });

  const removeAttachment: Handler = asyncHandler(async (req, res) => {
    const auth = requireUuidActor(req);
    const draftId = requireUuidParam(req.params.id, 'draft id');
    const attachmentId = requireUuidParam(req.params.attachmentId, 'attachment id');
    await service.removeAttachment(auth, draftId, attachmentId);
    res.status(200).json({ deleted: true, id: attachmentId });
  });

  return {
    upsert,
    list,
    get,
    patch,
    decide,
    remove,
    uploadAttachment,
    getAttachment,
    removeAttachment,
  };
}
