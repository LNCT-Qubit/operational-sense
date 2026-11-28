export const RECORDING_STATUSES = [
  'RECEIVED', 'TRANSCRIBING', 'TRANSCRIBED', 'TRANSCRIPTION_FAILED',
  'EXTRACTING', 'EXTRACTED', 'EXTRACTION_FAILED',
] as const;
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];

export interface RecordingRow {
  recording_id: string;
  organization_id: string;
  client_recording_id: string;
  uploaded_by: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_uri: string;
  duration_ms: number | null;
  recorded_at: string | null;
  processing_status: RecordingStatus;
  failure_code: string | null;
  failure_message: string | null;
  processing_started_at: string | null;
  transcription_attempts: number;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionRow {
  transcription_id: string;
  recording_id: string;
  attempt_number: number;
  status: 'COMPLETED' | 'EMPTY' | 'FAILED';
  transcript: string | null;
  detected_language: string | null;
  language_probability: number | null;
  processing_duration_seconds: number | null;
  error_code: string | null;
  error_message: string | null;
  model_name: string;
  created_at: string;
}

export interface DraftSummary {
  id: string;
  status: string;
  missing_fields: string[];
  transcription_id: string;
  created_at: string;
  /**
   * The validated US-06 extraction JSON (equipment, symptom, operating_condition, observation, uncertain_fields),
   * exactly as persisted in extraction_draft.extraction. Optional so lightweight stores/fakes may omit it.
   */
  extraction?: Record<string, unknown> | null;
}

/** What the backend needs from US-05's TranscriptionResult (see services/ai-engine/app/transcription/models.py). */
export interface TranscriptionResultDto {
  transcription_id: string;
  recording_id: string | null;
  attempt_number: number;
  status: 'COMPLETED' | 'EMPTY' | 'FAILED';
  transcript: string | null;
  detected_language: string | null;
  language_probability: number | null;
  segments: { start: number; end: number; text: string }[];
  processing_duration_seconds: number | null;
  error_code: string | null;
  error_message: string | null;
  model_name: string;
  created_at: string;
}

export interface NewRecording {
  clientRecordingId: string;
  storageUri: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  durationMs: number | null;
  recordedAt: string | null;
  recordingId: string; // generated server-side before the file is written
}

export interface ListFilter { status?: RecordingStatus; uploadedBy?: string; limit: number; offset: number }

export interface ClaimOptions {
  from: RecordingStatus[];            // states a claim may start from
  to: 'TRANSCRIBING' | 'EXTRACTING';
  staleSeconds: number;               // an in-progress claim older than this may be taken over
}

/** Thrown when the row was changed by someone else between our claim and our write (e.g. stale-claim takeover). */
export class ClaimLostError extends Error {
  constructor() { super('Processing claim was lost'); }
}

export interface PipelineStore {
  insertRecordingIfAbsent(org: string, actor: string, input: NewRecording): Promise<{ recording: RecordingRow; created: boolean }>;
  getRecording(org: string, id: string): Promise<RecordingRow | null>;
  listRecordings(org: string, filter: ListFilter): Promise<RecordingRow[]>;
  claim(org: string, id: string, opts: ClaimOptions): Promise<RecordingRow | null>;
  saveTranscriptionResult(org: string, actor: string, recordingId: string, result: TranscriptionResultDto): Promise<{ recording: RecordingRow; transcription: TranscriptionRow }>;
  getLatestTranscription(org: string, recordingId: string): Promise<TranscriptionRow | null>;
  getCompletedTranscription(org: string, recordingId: string): Promise<TranscriptionRow | null>;
  markExtractionFailed(org: string, actor: string, id: string, code: string, message: string): Promise<boolean>;
  findLiveDraftForTranscription(org: string, transcriptionId: string): Promise<DraftSummary | null>;
  markExtractedFromExistingDraft(org: string, actor: string, id: string): Promise<boolean>;
  getDraftSummary(org: string, recordingId: string): Promise<DraftSummary | null>;
}
