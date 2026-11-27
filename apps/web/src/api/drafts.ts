import { getAccessToken } from './session';
import { UPLOAD_TIMEOUT_MS, parseRetryAfterMs } from '../services/uploadService';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const DEFAULT_API_TIMEOUT_MS = 20_000;

export interface ServerAttachmentMeta {
  id: string;
  client_attachment_key: string;
  media_type: 'photo' | 'video' | 'audio' | 'other';
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  download_url: string;
}

export interface ServerLinkedRecording {
  id: string;
  processing_status: string;
  mime_type: string;
  size_bytes: number;
  duration_ms: number | null;
  failure_code: string | null;
  failure_message: string | null;
  audio_url: string;
}

export interface ServerLinkedTranscription {
  id: string;
  status: string;
  transcript: string | null;
  detected_language: string | null;
  error_code: string | null;
}

export interface ServerLinkedExtraction {
  id: string;
  status: string;
  missing_fields: string[];
  extraction: Record<string, unknown>;
}

export interface ServerDraftDetail {
  id: string;
  client_draft_id: string;
  created_by: string;
  recording_id: string | null;
  extraction_draft_id: string | null;
  case_id: string | null;
  capture_mode: 'voice' | 'text';
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
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  created_at: string;
  updated_at: string;
  recording: ServerLinkedRecording | null;
  transcription: ServerLinkedTranscription | null;
  extraction_draft: ServerLinkedExtraction | null;
  attachments: ServerAttachmentMeta[];
}

export interface ServerCaseItem {
  case_id: string;
  case_reference: string;
  organization_id: string;
  equipment_class_id: string;
  subsystem_id: number | null;
  case_title: string | null;
  symptom_text: string;
  symptom_structured: string | null;
  primary_suspected_cause: string | null;
  corrective_action_text: string | null;
  case_status: string;
  retrieval_eligibility: string;
  created_at: string;
  updated_at: string;
  rank?: number;
}

export interface ListDraftsResponse {
  items: ServerDraftDetail[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface ListCasesResponse {
  items: ServerCaseItem[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export interface DraftSyncPayload {
  clientDraftId: string;
  recordingId?: string | null;
  extractionDraftId?: string | null;
  caseId?: string | null;
  captureMode: 'voice' | 'text';
  equipment: string;
  subsystem: string;
  symptom: string;
  observation: string;
  probableCause: string;
  actionTaken: string;
  partsUsed: string;
  safetyNotes: string;
  durationMs?: number | null;
  recordedAt?: string | null;
  clientCreatedAt?: string | number | null;
  clientUpdatedAt?: string | number | null;
  status?: 'DRAFT' | 'PENDING_REVIEW';
}

export interface ApiCallOutcome<T> {
  ok: boolean;
  data?: T;
  httpStatus?: number;
  authError?: boolean;
  retryable?: boolean;
  networkError?: boolean;
  timeoutError?: boolean;
  retryAfterMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export class DraftApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'DraftApiError';
    this.status = status;
    this.code = code;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function toHeaderSafeFilename(name: string): string {
  const cleaned = name.replace(/[^\x20-\x7E]/g, '_').replace(/[/\\]+/g, '_').trim();
  return cleaned.slice(0, 255) || 'attachment.bin';
}

async function readErrorEnvelope(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown } } | null;
    return {
      code: typeof body?.error?.code === 'string' ? body.error.code : undefined,
      message: typeof body?.error?.message === 'string' ? body.error.message : undefined,
    };
  } catch {
    return {};
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<{ response?: Response; timedOut: boolean; error?: unknown }> {
  const controller = new AbortController();
  let timedOut = false;
  let onExternalAbort: (() => void) | undefined;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      onExternalAbort = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, timedOut };
  } catch (error) {
    return { timedOut, error };
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function runSyncMutation<T>(
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<ApiCallOutcome<T>> {
  const token = getAccessToken();
  if (!token) {
    return { ok: false, authError: true, errorMessage: 'Authentication required.' };
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const attempt = await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, signal, timeoutMs);

  if (attempt.error !== undefined || !attempt.response) {
    if (attempt.error instanceof Error && attempt.error.name === 'AbortError') {
      return {
        ok: false,
        retryable: true,
        networkError: true,
        timeoutError: attempt.timedOut,
        errorMessage: attempt.timedOut ? 'Sync request timed out. Will retry.' : 'Sync request was interrupted. Will retry.',
      };
    }
    return {
      ok: false,
      retryable: true,
      networkError: true,
      errorMessage: 'Network unavailable. Sync will retry.',
    };
  }

  const response = attempt.response;
  if (response.status === 401) {
    return {
      ok: false,
      authError: true,
      httpStatus: 401,
      errorMessage: 'Authentication expired. Sign in again.',
    };
  }

  if (response.status >= 200 && response.status < 300) {
    try {
      const data = (await response.json()) as T;
      return { ok: true, httpStatus: response.status, data };
    } catch {
      return {
        ok: false,
        retryable: false,
        httpStatus: response.status,
        errorMessage: 'Server returned an invalid JSON response.',
      };
    }
  }

  const envelope = await readErrorEnvelope(response);
  const retryable = isRetryableStatus(response.status);
  const retryAfterMs = retryable ? parseRetryAfterMs(response.headers?.get?.('Retry-After')) : undefined;

  return {
    ok: false,
    retryable,
    httpStatus: response.status,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(envelope.code ? { errorCode: envelope.code } : {}),
    errorMessage: envelope.message ? `${envelope.message} (HTTP ${response.status})` : `Request failed with HTTP ${response.status}.`,
  };
}

async function runAuthedJson<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): Promise<T> {
  const token = getAccessToken();
  if (!token) {
    throw new DraftApiError(401, 'Authentication required.', 'AUTHENTICATION_REQUIRED');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const attempt = await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, signal, timeoutMs);
  if (attempt.error !== undefined || !attempt.response) {
    throw new DraftApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const response = attempt.response;
  if (!response.ok) {
    const env = await readErrorEnvelope(response);
    throw new DraftApiError(response.status, env.message ?? `Request failed with HTTP ${response.status}.`, env.code);
  }
  return (await response.json()) as T;
}

export function upsertDraftRequest(
  payload: DraftSyncPayload,
  signal?: AbortSignal,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<ApiCallOutcome<{ duplicate: boolean; draft: ServerDraftDetail }>> {
  return runSyncMutation<{ duplicate: boolean; draft: ServerDraftDetail }>(
    '/api/v1/drafts',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.clientDraftId,
      },
      body: JSON.stringify(payload),
    },
    signal,
    timeoutMs,
  );
}

export function uploadDraftAttachmentRequest(
  serverDraftId: string,
  attachment: { key: string; name: string; type: string; blob: Blob },
  signal?: AbortSignal,
  timeoutMs: number = UPLOAD_TIMEOUT_MS,
): Promise<ApiCallOutcome<{ duplicate: boolean; attachment: ServerAttachmentMeta }>> {
  const mime = attachment.type || attachment.blob.type || 'application/octet-stream';
  return runSyncMutation<{ duplicate: boolean; attachment: ServerAttachmentMeta }>(
    `/api/v1/drafts/${encodeURIComponent(serverDraftId)}/attachments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': mime,
        'Idempotency-Key': attachment.key,
        'X-File-Name': toHeaderSafeFilename(attachment.name),
      },
      body: attachment.blob,
    },
    signal,
    timeoutMs,
  );
}

export function listServerDrafts(
  params?: { limit?: number; offset?: number; status?: string; mode?: string; q?: string },
  signal?: AbortSignal,
): Promise<ListDraftsResponse> {
  const qs = new URLSearchParams();
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.status) qs.set('status', params.status);
  if (params?.mode) qs.set('mode', params.mode);
  if (params?.q) qs.set('q', params.q);
  const query = qs.toString();
  return runAuthedJson<ListDraftsResponse>(`/api/v1/drafts${query ? `?${query}` : ''}`, { method: 'GET' }, signal);
}

export async function getServerDraft(draftId: string, signal?: AbortSignal): Promise<ServerDraftDetail> {
  const res = await runAuthedJson<{ draft: ServerDraftDetail }>(
    `/api/v1/drafts/${encodeURIComponent(draftId)}`,
    { method: 'GET' },
    signal,
  );
  return res.draft;
}

export async function patchServerDraft(
  draftId: string,
  patch: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ServerDraftDetail> {
  const res = await runAuthedJson<{ draft: ServerDraftDetail }>(
    `/api/v1/drafts/${encodeURIComponent(draftId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    signal,
  );
  return res.draft;
}

export function deleteServerDraft(draftId: string, signal?: AbortSignal): Promise<{ deleted: boolean; id: string }> {
  return runAuthedJson<{ deleted: boolean; id: string }>(
    `/api/v1/drafts/${encodeURIComponent(draftId)}`,
    { method: 'DELETE' },
    signal,
  );
}

export async function decideServerDraft(
  draftId: string,
  decision: 'APPROVED' | 'REJECTED',
  comment?: string | null,
  signal?: AbortSignal,
): Promise<{ status: number; draft?: ServerDraftDetail; conflict?: boolean; errorMessage?: string }> {
  const token = getAccessToken();
  if (!token) {
    throw new DraftApiError(401, 'Authentication required.', 'AUTHENTICATION_REQUIRED');
  }
  const attempt = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/drafts/${encodeURIComponent(draftId)}/decision`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision, ...(comment !== undefined ? { comment } : {}) }),
    },
    signal,
    DEFAULT_API_TIMEOUT_MS,
  );
  if (attempt.error !== undefined || !attempt.response) {
    throw new DraftApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const response = attempt.response;
  if (response.status === 409) {
    const env = await readErrorEnvelope(response);
    return {
      status: 409,
      conflict: true,
      errorMessage: env.message ?? 'This draft has already been decided.',
    };
  }
  if (!response.ok) {
    const env = await readErrorEnvelope(response);
    throw new DraftApiError(response.status, env.message ?? `Decision failed with HTTP ${response.status}.`, env.code);
  }
  const body = (await response.json()) as { draft: ServerDraftDetail };
  return { status: response.status, draft: body.draft };
}

async function fetchAuthedBlobUrl(path: string, signal?: AbortSignal): Promise<string> {
  const token = getAccessToken();
  if (!token) {
    throw new DraftApiError(401, 'Authentication required.', 'AUTHENTICATION_REQUIRED');
  }
  const attempt = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
    signal,
    UPLOAD_TIMEOUT_MS,
  );
  if (attempt.error !== undefined || !attempt.response) {
    throw new DraftApiError(0, 'Could not download media from server.');
  }
  const response = attempt.response;
  if (!response.ok) {
    const env = await readErrorEnvelope(response);
    throw new DraftApiError(response.status, env.message ?? `Media download failed (${response.status}).`, env.code);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function fetchAttachmentBlobUrl(
  draftId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<string> {
  return fetchAuthedBlobUrl(
    `/api/v1/drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(attachmentId)}`,
    signal,
  );
}

export function fetchRecordingAudioUrl(recordingId: string, signal?: AbortSignal): Promise<string> {
  return fetchAuthedBlobUrl(`/api/v1/recordings/${encodeURIComponent(recordingId)}/audio`, signal);
}

export function searchServerCases(
  params?: {
    q?: string;
    status?: string;
    equipment_class_id?: string;
    subsystem_id?: number;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal,
): Promise<ListCasesResponse> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.status) qs.set('status', params.status);
  if (params?.equipment_class_id) qs.set('equipment_class_id', params.equipment_class_id);
  if (params?.subsystem_id !== undefined) qs.set('subsystem_id', String(params.subsystem_id));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  const query = qs.toString();
  return runAuthedJson<ListCasesResponse>(`/api/v1/cases${query ? `?${query}` : ''}`, { method: 'GET' }, signal);
}
