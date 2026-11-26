import { randomUUID } from 'node:crypto';
import type { AuthContext } from '../../src/middleware/auth';
import { ClaimLostError, type ClaimOptions, type DraftSummary, type ListFilter, type NewRecording, type PipelineStore, type RecordingRow, type TranscriptionResultDto, type TranscriptionRow } from '../../src/modules/recordings/recording.types';
import type { AudioStorage } from '../../src/modules/recordings/audio-storage';
import type { TranscriptionClient, TranscriptionRequest } from '../../src/modules/transcription/transcription.client';
import { DraftAlreadyExistsError, type DraftCreateInput, type DraftCreator } from '../../src/modules/extraction/extraction.gateway';

export const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ctx = (o: Partial<AuthContext> = {}): AuthContext => ({ userId: 'tech-1', organizationId: ORG_A, role: 'TECHNICIAN', ...o });

/** In-memory PipelineStore that mirrors the SQL semantics (conditional claim, stale takeover, unique live draft, tenant scoping). */
export class InMemoryStore implements PipelineStore {
  recs = new Map<string, RecordingRow>();
  trs: (TranscriptionRow & { org: string })[] = [];
  drafts: (DraftSummary & { org: string; recording_id: string })[] = [];
  audit: string[] = [];
  failNext: Partial<Record<keyof PipelineStore, Error>> = {};
  clock = () => Date.now();

  private maybeFail(m: keyof PipelineStore) { const e = this.failNext[m]; if (e) { delete this.failNext[m]; throw e; } }
  private mine(org: string, id: string) { const r = this.recs.get(id); return r && r.organization_id === org ? r : null; }

  async insertRecordingIfAbsent(org: string, actor: string, i: NewRecording) {
    this.maybeFail('insertRecordingIfAbsent');
    for (const r of this.recs.values()) if (r.organization_id === org && r.client_recording_id === i.clientRecordingId) return { recording: { ...r }, created: false };
    const now = new Date(this.clock()).toISOString();
    const row: RecordingRow = { recording_id: i.recordingId, organization_id: org, client_recording_id: i.clientRecordingId, uploaded_by: actor, mime_type: i.mimeType,
      size_bytes: i.sizeBytes, sha256: i.sha256, storage_uri: i.storageUri, duration_ms: i.durationMs, recorded_at: i.recordedAt, processing_status: 'RECEIVED',
      failure_code: null, failure_message: null, processing_started_at: null, transcription_attempts: 0, created_at: now, updated_at: now };
    this.recs.set(row.recording_id, row); this.audit.push('RECORDING_RECEIVED');
    return { recording: { ...row }, created: true };
  }
  async getRecording(org: string, id: string) { this.maybeFail('getRecording'); const r = this.mine(org, id); return r ? { ...r } : null; }
  async listRecordings(org: string, f: ListFilter) {
    return [...this.recs.values()].filter((r) => r.organization_id === org && (!f.status || r.processing_status === f.status) && (!f.uploadedBy || r.uploaded_by === f.uploadedBy)).slice(f.offset, f.offset + f.limit).map((r) => ({ ...r }));
  }
  async claim(org: string, id: string, o: ClaimOptions) {
    const r = this.mine(org, id); if (!r) return null;
    const stale = r.processing_status === o.to && r.processing_started_at !== null && this.clock() - Date.parse(r.processing_started_at) > o.staleSeconds * 1000;
    if (!o.from.includes(r.processing_status) && !stale) return null;
    r.processing_status = o.to; r.processing_started_at = new Date(this.clock()).toISOString(); r.failure_code = null; r.failure_message = null;
    if (o.to === 'TRANSCRIBING') r.transcription_attempts += 1;
    return { ...r };
  }
  async saveTranscriptionResult(org: string, _actor: string, recordingId: string, t: TranscriptionResultDto) {
    this.maybeFail('saveTranscriptionResult');
    const r = this.mine(org, recordingId);
    if (!r || r.processing_status !== 'TRANSCRIBING') throw new ClaimLostError();   // same as the 0-row UPDATE: nothing is stored
    const ok = t.status === 'COMPLETED';
    const row = { org, transcription_id: t.transcription_id, recording_id: recordingId, attempt_number: t.attempt_number, status: t.status, transcript: t.transcript, detected_language: t.detected_language,
      language_probability: t.language_probability, processing_duration_seconds: t.processing_duration_seconds, error_code: t.error_code, error_message: t.error_message, model_name: t.model_name, created_at: t.created_at };
    this.trs.push(row);
    r.processing_status = ok ? 'TRANSCRIBED' : 'TRANSCRIPTION_FAILED'; r.processing_started_at = null;
    r.failure_code = ok ? null : t.status === 'EMPTY' ? 'NO_SPEECH_DETECTED' : t.error_code; r.failure_message = ok ? null : (t.error_message ?? 'failed');
    return { recording: { ...r }, transcription: { ...row } };
  }
  async getLatestTranscription(org: string, id: string) { const l = this.trs.filter((t) => t.org === org && t.recording_id === id).sort((a, b) => b.attempt_number - a.attempt_number)[0]; return l ? { ...l } : null; }
  async getCompletedTranscription(org: string, id: string) { const l = this.trs.find((t) => t.org === org && t.recording_id === id && t.status === 'COMPLETED'); return l ? { ...l } : null; }
  async markExtractionFailed(org: string, _a: string, id: string, code: string, message: string) {
    const r = this.mine(org, id); if (!r || r.processing_status !== 'EXTRACTING') return false;
    r.processing_status = 'EXTRACTION_FAILED'; r.processing_started_at = null; r.failure_code = code; r.failure_message = message; return true;
  }
  async findLiveDraftForTranscription(org: string, tid: string) { const d = this.drafts.find((x) => x.org === org && x.transcription_id === tid && x.status !== 'REJECTED'); return d ?? null; }
  async markExtractedFromExistingDraft(org: string, _a: string, id: string) {
    const r = this.mine(org, id); if (!r || !['EXTRACTING', 'EXTRACTION_FAILED', 'TRANSCRIBED'].includes(r.processing_status)) return false;
    r.processing_status = 'EXTRACTED'; r.processing_started_at = null; r.failure_code = null; r.failure_message = null; return true;
  }
  async getDraftSummary(org: string, id: string) { return this.drafts.find((d) => d.org === org && d.recording_id === id) ?? null; }

  /** Atomic draft+status step, mirroring RecordingLinkedDraftStore.create's single transaction. */
  commitDraft(i: DraftCreateInput, missing: string[]) {
    const r = this.mine(i.organizationId, i.recordingId);
    if (!r || r.processing_status !== 'EXTRACTING') throw new ClaimLostError();
    if (this.drafts.some((d) => d.org === i.organizationId && d.transcription_id === i.transcriptionId && d.status !== 'REJECTED')) throw new DraftAlreadyExistsError('dup');
    const d = { org: i.organizationId, recording_id: i.recordingId, id: randomUUID(), status: 'DRAFT', missing_fields: missing, transcription_id: i.transcriptionId, created_at: new Date().toISOString() };
    this.drafts.push(d); r.processing_status = 'EXTRACTED'; r.processing_started_at = null; r.failure_code = null; r.failure_message = null;
    return d;
  }
}

export class FakeStorage implements AudioStorage {
  files = new Map<string, Buffer>(); removed: string[] = []; failSave = false;
  async save(org: string, rid: string, ext: string, data: Buffer) { if (this.failSave) throw new Error('disk full'); const uri = `${org}/${rid}.${ext}`; this.files.set(uri, data); return uri; }
  async remove(uri: string) { this.removed.push(uri); this.files.delete(uri); }
  absolutePath(uri: string) { return `/var/uploads/${uri}`; }
}

export class FakeTranscriber implements TranscriptionClient {
  calls: TranscriptionRequest[] = [];
  next: (r: TranscriptionRequest) => Promise<TranscriptionResultDto> | TranscriptionResultDto = (r) => completed(r, 'The pump is vibrating excessively');
  gate: Promise<void> | null = null;
  async transcribe(r: TranscriptionRequest) { this.calls.push(r); if (this.gate) await this.gate; return this.next(r); }
}
export function completed(r: TranscriptionRequest, text: string): TranscriptionResultDto {
  return { transcription_id: r.transcriptionId, recording_id: r.recordingId, attempt_number: r.attemptNumber, status: 'COMPLETED', transcript: text, detected_language: 'en', language_probability: 0.98,
    segments: [], processing_duration_seconds: 0.5, error_code: null, error_message: null, model_name: 'tiny', created_at: new Date().toISOString() };
}
export function notCompleted(r: TranscriptionRequest, status: 'FAILED' | 'EMPTY', code: string | null): TranscriptionResultDto {
  return { ...completed(r, ''), status, transcript: null, error_code: code, error_message: code ? 'safe message' : null };
}

export class FakeDrafts implements DraftCreator {
  calls: DraftCreateInput[] = []; fail: Error | null = null; gate: Promise<void> | null = null;
  constructor(private store: InMemoryStore) {}
  async createDraft(i: DraftCreateInput) {
    this.calls.push(i); if (this.gate) await this.gate;
    if (this.fail) throw this.fail;
    const d = this.store.commitDraft(i, ['operating_condition']);
    return { id: d.id, status: d.status, missingFields: d.missing_fields };
  }
}

export const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WAVE'), Buffer.alloc(64, 1)]);
