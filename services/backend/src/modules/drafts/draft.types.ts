import type { Role } from '../../middleware/auth';

export type CaptureMode = 'voice' | 'text';
export type DraftStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type DraftDecision = 'APPROVED' | 'REJECTED';
export type AttachmentMediaType = 'photo' | 'video' | 'audio' | 'other';

export interface TechnicianDraftRow {
  draft_id: string;
  organization_id: string;
  client_draft_id: string;
  created_by: string;
  recording_id: string | null;
  extraction_draft_id: string | null;
  case_id: string | null;
  capture_mode: CaptureMode;
  equipment: string;
  subsystem: string;
  symptom: string;
  observation: string;
  probable_cause: string;
  action_taken: string;
  parts_used: string;
  safety_notes: string;
  duration_ms: number | null;
  recorded_at: string | null;
  client_created_at: string | null;
  client_updated_at: string | null;
  status: DraftStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftAttachmentRow {
  attachment_id: string;
  organization_id: string;
  draft_id: string;
  client_attachment_key: string;
  media_type: AttachmentMediaType;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_uri: string;
  uploaded_by: string;
  deleted_at: string | null;
  created_at: string;
}

export interface DraftAttachmentMeta {
  attachment_id: string;
  client_attachment_key: string;
  media_type: AttachmentMediaType;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface LinkedRecordingInfo {
  id: string;
  processing_status: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  failure_code: string | null;
  failure_message: string | null;
}

export interface LinkedTranscriptionInfo {
  id: string;
  status: string;
  transcript: string | null;
  detected_language: string | null;
  error_code: string | null;
}

export interface LinkedExtractionInfo {
  id: string;
  status: string;
  missing_fields: string[];
  extraction: Record<string, unknown>;
}

export interface TechnicianDraftDetail {
  draft: TechnicianDraftRow;
  recording: LinkedRecordingInfo | null;
  transcription: LinkedTranscriptionInfo | null;
  extraction_draft: LinkedExtractionInfo | null;
  attachments: DraftAttachmentMeta[];
}

export interface UpsertDraftInput {
  clientDraftId: string;
  recordingId: string | null;
  extractionDraftId: string | null;
  caseId: string | null;
  captureMode: CaptureMode;
  equipment: string;
  subsystem: string;
  symptom: string;
  observation: string;
  probableCause: string;
  actionTaken: string;
  partsUsed: string;
  safetyNotes: string;
  durationMs: number | null;
  recordedAt: string | null;
  clientCreatedAt: string | null;
  clientUpdatedAt: string | null;
  status: 'DRAFT' | 'PENDING_REVIEW';
}

export interface PatchDraftInput {
  recordingId?: string | null;
  extractionDraftId?: string | null;
  caseId?: string | null;
  captureMode?: CaptureMode;
  equipment?: string;
  subsystem?: string;
  symptom?: string;
  observation?: string;
  probableCause?: string;
  actionTaken?: string;
  partsUsed?: string;
  safetyNotes?: string;
  durationMs?: number | null;
  recordedAt?: string | null;
  clientUpdatedAt?: string | null;
  status?: 'DRAFT' | 'PENDING_REVIEW';
}

export interface DraftListFilter {
  limit: number;
  offset: number;
  status?: DraftStatus;
  mode?: CaptureMode;
  q?: string;
  createdBy?: string;
}

export interface NewDraftAttachment {
  attachmentId: string;
  clientAttachmentKey: string;
  mediaType: AttachmentMediaType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageUri: string;
}

export interface DraftSyncStore {
  upsertDraft(
    organizationId: string,
    actorId: string,
    role: Role,
    input: UpsertDraftInput,
  ): Promise<{ detail: TechnicianDraftDetail; created: boolean }>;

  listDrafts(
    organizationId: string,
    filter: DraftListFilter,
  ): Promise<{ items: TechnicianDraftDetail[]; total: number }>;

  getDraft(
    organizationId: string,
    draftId: string,
    createdByFilter?: string,
  ): Promise<TechnicianDraftDetail | null>;

  patchDraft(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
    patch: PatchDraftInput,
  ): Promise<TechnicianDraftDetail>;

  decideDraft(
    organizationId: string,
    reviewerId: string,
    draftId: string,
    decision: DraftDecision,
    comment: string | null,
  ): Promise<TechnicianDraftDetail>;

  softDeleteDraft(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
  ): Promise<boolean>;

  ensureDraftForAttachmentUpload(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
  ): Promise<void>;

  insertAttachmentIfAbsent(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
    input: NewDraftAttachment,
  ): Promise<{ attachment: DraftAttachmentRow; created: boolean }>;

  getAttachment(
    organizationId: string,
    draftId: string,
    attachmentId: string,
    createdByFilter?: string,
  ): Promise<DraftAttachmentRow | null>;

  softDeleteAttachment(
    organizationId: string,
    actorId: string,
    role: Role,
    draftId: string,
    attachmentId: string,
  ): Promise<boolean>;
}
