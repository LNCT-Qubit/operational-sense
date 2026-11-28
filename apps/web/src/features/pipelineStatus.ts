/**
 * Sprint 2 Block 3: turns what the backend already returns on a server draft (linked recording, transcription and
 * extraction draft) into a small, display-ready snapshot. Pure functions only, so it is unit-testable without React.
 *
 * Status names mirror services/backend/src/modules/recordings/recording.types.ts (RECORDING_STATUSES).
 */
import type { ServerDraftDetail, ServerRecordingState } from '../api/drafts';

export type PipelineStage = 'working' | 'done' | 'failed';

export interface PipelineField {
  key: 'equipment' | 'symptom' | 'operating_condition' | 'observation';
  label: string;
  value: string | null;
  /** The model found it but flagged it as unclear: a reviewer must check it. */
  uncertain: boolean;
}

export interface PipelineSnapshot {
  recordingId: string;
  status: string;
  stage: PipelineStage;
  label: string;
  failure: { code: string; message: string; retryable: boolean } | null;
  transcript: string | null;
  language: string | null;
  /** Null until the extraction draft exists. */
  extraction: { fields: PipelineField[]; missing: string[] } | null;
}

const LABELS: Record<string, { label: string; stage: PipelineStage }> = {
  RECEIVED: { label: 'Uploaded, waiting to be transcribed', stage: 'working' },
  TRANSCRIBING: { label: 'Transcribing the audio', stage: 'working' },
  TRANSCRIBED: { label: 'Transcribed, extracting details', stage: 'working' },
  EXTRACTING: { label: 'Extracting equipment, symptom and conditions', stage: 'working' },
  EXTRACTED: { label: 'Details extracted, ready for review', stage: 'done' },
  TRANSCRIPTION_FAILED: { label: 'Transcription failed', stage: 'failed' },
  EXTRACTION_FAILED: { label: 'Extraction failed', stage: 'failed' },
};

/** Same list as the backend's PERMANENT_FAILURES: retrying cannot fix bad input. */
const PERMANENT_FAILURES = new Set([
  'UNSUPPORTED_FORMAT', 'FILE_EMPTY', 'FILE_TOO_LARGE', 'INVALID_AUDIO', 'FILE_NOT_FOUND', 'NO_SPEECH_DETECTED', 'VALIDATION_ERROR',
]);

const FIELD_LABELS: Array<[PipelineField['key'], string]> = [
  ['equipment', 'Equipment'],
  ['symptom', 'Symptom'],
  ['operating_condition', 'Operating condition'],
  ['observation', 'Observation'],
];

export const isInFlightStatus = (status: string | null | undefined): boolean =>
  !!status && LABELS[status]?.stage === 'working';

export const isRetryableFailure = (code: string | null | undefined): boolean => !!code && !PERMANENT_FAILURES.has(code);

function readExtraction(raw: Record<string, unknown> | null | undefined, missingFromServer: string[] | undefined): PipelineSnapshot['extraction'] {
  if (!raw || typeof raw !== 'object') return null;
  const uncertain = Array.isArray(raw.uncertain_fields) ? raw.uncertain_fields.filter((f): f is string => typeof f === 'string') : [];
  const fields = FIELD_LABELS.map(([key, label]): PipelineField => {
    const v = raw[key];
    return { key, label, value: typeof v === 'string' && v.trim() ? v.trim() : null, uncertain: uncertain.includes(key) };
  });
  const missing = Array.isArray(missingFromServer) ? missingFromServer : fields.filter((f) => f.value === null).map((f) => f.key);
  return { fields, missing };
}

/** Returns null when the draft has no recording (text-only drafts never enter the audio pipeline). */
export function buildPipelineSnapshot(
  s: Pick<ServerDraftDetail, 'recording' | 'transcription' | 'extraction_draft'>,
): PipelineSnapshot | null {
  const rec = s.recording;
  if (!rec) return null;
  const known = LABELS[rec.processing_status];
  const failure = rec.failure_code
    ? {
        code: rec.failure_code,
        message: rec.failure_message || 'Processing failed.',
        retryable: isRetryableFailure(rec.failure_code),
      }
    : null;
  return {
    recordingId: rec.id,
    status: rec.processing_status,
    stage: known?.stage ?? 'working',
    label: known?.label ?? rec.processing_status,
    failure: (known?.stage ?? 'working') === 'failed' ? failure : null,   // never show a stale failure on a recovered recording
    transcript: s.transcription?.transcript ?? null,
    language: s.transcription?.detected_language ?? null,
    extraction: readExtraction(s.extraction_draft?.extraction, s.extraction_draft?.missing_fields),
  };
}

/**
 * Adapts GET /recordings/:id (what the capture screen polls right after saving) to the shape buildPipelineSnapshot
 * already understands, so the transcript / extraction / failure display has ONE implementation.
 */
export function buildPipelineSnapshotFromRecording(state: ServerRecordingState): PipelineSnapshot | null {
  const r = state.recording;
  const t = state.transcription;
  const d = state.draft;
  return buildPipelineSnapshot({
    recording: {
      id: r.id,
      processing_status: r.status,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      duration_ms: r.duration_ms,
      failure_code: r.failure?.code ?? null,
      failure_message: r.failure?.message ?? null,
      audio_url: `/api/v1/recordings/${r.id}/audio`,
    },
    transcription: t
      ? { id: t.id, status: t.status, transcript: t.transcript, detected_language: t.language, error_code: t.error_code }
      : null,
    extraction_draft: d
      ? { id: d.id, status: d.status, missing_fields: d.missing_fields, extraction: d.extraction ?? {} }
      : null,
  });
}

/** One row of the capture-progress list. 'waiting' = not started yet, nothing is pretended to be running. */
export type CaptureStepState = 'waiting' | 'working' | 'done' | 'failed';
export interface CaptureStep {
  key: 'local' | 'upload' | 'transcription' | 'extraction';
  label: string;
  state: CaptureStepState;
  detail?: string;
}

export interface CaptureStepInput {
  /** Does this observation include a voice recording? Text-only observations never enter the audio pipeline. */
  hasAudio: boolean;
  online: boolean;
  /** From the device's IndexedDB draft (null until it has been read). */
  local: { syncStatus: 'pending' | 'uploading' | 'completed' | 'failed'; serverRecordingId?: string; lastError?: string } | null;
  /** From the backend (null until the recording has been uploaded and read back). */
  server: ServerRecordingState | null;
}

/**
 * Builds the four honest steps. Local save and upload come from the device's sync record; transcription and
 * extraction come ONLY from the backend's recording status. Nothing here advances on a timer.
 */
export function buildCaptureSteps(input: CaptureStepInput): CaptureStep[] {
  const { hasAudio, online, local, server } = input;
  const steps: CaptureStep[] = [
    { key: 'local', label: 'Saved on this device', state: local ? 'done' : 'working' },
  ];
  if (!hasAudio) return steps;

  const status = server?.recording.status ?? null;
  const uploaded = !!(server || local?.serverRecordingId);

  // Upload
  if (uploaded) {
    steps.push({ key: 'upload', label: 'Audio uploaded to the server', state: 'done' });
  } else if (local?.syncStatus === 'failed') {
    steps.push({ key: 'upload', label: 'Audio upload', state: 'failed', detail: local.lastError || 'Upload failed.' });
  } else if (local?.syncStatus === 'uploading') {
    steps.push({ key: 'upload', label: 'Uploading audio to the server', state: 'working' });
  } else {
    steps.push({
      key: 'upload',
      label: 'Audio upload',
      state: 'waiting',
      detail: online ? 'Waiting to upload.' : 'Offline: it will upload automatically when you are back online.',
    });
  }

  // Transcription (backend status only)
  let tState: CaptureStepState = 'waiting';
  let tDetail: string | undefined;
  if (status === 'TRANSCRIBING') tState = 'working';
  else if (status === 'TRANSCRIPTION_FAILED') { tState = 'failed'; tDetail = server?.recording.failure?.message ?? 'Transcription failed.'; }
  else if (status === 'TRANSCRIBED' || status === 'EXTRACTING' || status === 'EXTRACTED' || status === 'EXTRACTION_FAILED') tState = 'done';
  else if (status === 'RECEIVED') tDetail = 'Queued on the server.';
  steps.push({ key: 'transcription', label: tState === 'done' ? 'Audio transcribed' : 'Transcribing the audio', state: tState, detail: tDetail });

  // Extraction (backend status only)
  let eState: CaptureStepState = 'waiting';
  let eDetail: string | undefined;
  if (status === 'EXTRACTING') eState = 'working';
  else if (status === 'EXTRACTION_FAILED') { eState = 'failed'; eDetail = server?.recording.failure?.message ?? 'Extraction failed.'; }
  else if (status === 'EXTRACTED') eState = 'done';
  else if (status === 'TRANSCRIBED') eDetail = 'Queued on the server.';
  steps.push({ key: 'extraction', label: eState === 'done' ? 'Details extracted' : 'Extracting equipment, symptom and conditions', state: eState, detail: eDetail });

  return steps;
}

/** True when polling can stop: processing finished, failed (needs a user retry), or there is no audio to process. */
export function isCaptureSettled(input: CaptureStepInput): boolean {
  if (!input.hasAudio) return !!input.local;
  if (input.local?.syncStatus === 'failed' && !input.server && !input.local.serverRecordingId) return true;
  const status = input.server?.recording.status;
  return status === 'EXTRACTED' || status === 'TRANSCRIPTION_FAILED' || status === 'EXTRACTION_FAILED';
}
