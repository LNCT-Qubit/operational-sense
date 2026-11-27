import { createHash, randomUUID } from 'node:crypto';
import type { AuthContext } from '../../middleware/auth';
import { ApiError, conflict, notFound } from '../../http/errors';
import type { Logger } from '../../http/logger';
import type { AudioStorage } from './audio-storage';
import { ClaimLostError, type DraftSummary, type ListFilter, type PipelineStore, type RecordingRow, type TranscriptionResultDto, type TranscriptionRow } from './recording.types';
import { TranscriptionUnavailableError, type TranscriptionClient } from '../transcription/transcription.client';
import { DraftAlreadyExistsError, ExtractionError, type DraftCreator } from '../extraction/extraction.gateway';

export interface CaptureState {
  recording: RecordingRow;
  transcription: TranscriptionRow | null;
  draft: DraftSummary | null;
}
export interface ProcessOutcome { state: CaptureState; timingsMs: { transcription?: number; extraction?: number; total: number } }

export interface CaptureServiceOptions {
  autoProcess: boolean;
  staleClaimSeconds: number;
  maxTranscriptionAttempts: number;
}

/** Failure codes where retrying cannot help (bad input), as opposed to transient service problems. */
const PERMANENT_FAILURES = new Set(['UNSUPPORTED_FORMAT', 'FILE_EMPTY', 'FILE_TOO_LARGE', 'INVALID_AUDIO', 'FILE_NOT_FOUND', 'NO_SPEECH_DETECTED', 'VALIDATION_ERROR']);
export const isRetryable = (code: string | null): boolean => code !== null && !PERMANENT_FAILURES.has(code);

/**
 * Orchestrates  upload -> transcription (US-05) -> extraction draft (US-06) -> PostgreSQL  and keeps the
 * Recording -> Transcription -> ExtractionDraft chain consistent.
 *
 * State machine (recording.processing_status):
 *   RECEIVED -> TRANSCRIBING -> TRANSCRIBED -> EXTRACTING -> EXTRACTED
 *                    |                              |
 *            TRANSCRIPTION_FAILED            EXTRACTION_FAILED     (both can be retried; a retry from
 *                                                                   EXTRACTION_FAILED never re-transcribes)
 * Every transition is a conditional UPDATE in the store, so concurrent/duplicate requests cannot both win.
 */
export class CaptureService {
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly store: PipelineStore,
    private readonly storage: AudioStorage,
    private readonly transcriber: TranscriptionClient,
    private readonly drafts: DraftCreator,
    private readonly opts: CaptureServiceOptions,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------------ upload
  async upload(ctx: AuthContext, input: { clientRecordingId: string; body: Buffer; ext: string; mime: string; durationMs: number | null; recordedAt: string | null }) {
    const sha256 = createHash('sha256').update(input.body).digest('hex');
    const recordingId = randomUUID();
    const storageUri = await this.storage.save(ctx.organizationId, recordingId, input.ext, input.body);

    let result;
    try {
      result = await this.store.insertRecordingIfAbsent(ctx.organizationId, ctx.userId, {
        recordingId, clientRecordingId: input.clientRecordingId, storageUri, mimeType: input.mime,
        sizeBytes: input.body.length, sha256, durationMs: input.durationMs, recordedAt: input.recordedAt,
      });
    } catch (err) {
      await this.discardFile(storageUri); // DB failed: do not leave an orphan file behind
      throw err;
    }

    if (!result.created) {
      await this.discardFile(storageUri); // duplicate delivery: keep the original, drop the copy
      const prior = result.recording;
      // Same key but different bytes (or another user) is a client bug, not a harmless retry.
      if (prior.sha256 !== sha256 || prior.uploaded_by !== ctx.userId) {
        throw conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different recording.');
      }
      return { recording: prior, created: false };
    }

    if (this.opts.autoProcess) this.schedule(ctx, result.recording.recording_id);
    return { recording: result.recording, created: true };
  }

  // ------------------------------------------------------------------ reads
  async get(ctx: AuthContext, recordingId: string): Promise<CaptureState> {
    const rec = await this.mustGet(ctx, recordingId);
    return this.stateOf(ctx, rec);
  }

  async list(ctx: AuthContext, filter: Omit<ListFilter, 'uploadedBy'>): Promise<RecordingRow[]> {
    // Technicians only ever see their own recordings; supervisors/engineers/admins see the organization's.
    const uploadedBy = ctx.role === 'TECHNICIAN' ? ctx.userId : undefined;
    return this.store.listRecordings(ctx.organizationId, { ...filter, uploadedBy });
  }

  async getDraft(ctx: AuthContext, recordingId: string): Promise<DraftSummary> {
    await this.mustGet(ctx, recordingId);
    const draft = await this.store.getDraftSummary(ctx.organizationId, recordingId);
    if (!draft) throw notFound('No extraction draft exists for this recording yet.', 'DRAFT_NOT_FOUND');
    return draft;
  }

  async getAudioStream(ctx: AuthContext, recordingId: string) {
    const rec = await this.mustGet(ctx, recordingId);
    if (!this.storage.openRead) {
      throw notFound('Recording audio streaming is unavailable.', 'AUDIO_FILE_NOT_FOUND');
    }
    const opened = await this.storage.openRead(rec.storage_uri);
    if (!opened) {
      throw notFound('Recording audio file not found.', 'AUDIO_FILE_NOT_FOUND');
    }
    return { mimeType: rec.mime_type, sizeBytes: opened.sizeBytes, openStream: opened.openStream };
  }

  // ------------------------------------------------------------------ processing
  /** Fire-and-forget processing for the upload path. Failures are recorded on the recording, never thrown. */
  schedule(ctx: AuthContext, recordingId: string): void {
    const task = this.process(ctx, recordingId)
      .catch((err) => this.logger.warn('background processing did not complete', { recording_id: recordingId, code: (err as ApiError)?.code ?? 'UNEXPECTED' }))
      .finally(() => this.inflight.delete(task));
    this.inflight.add(task);
  }

  /** Resolves when all background processing has settled (graceful shutdown and tests). */
  async idle(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
  }

  async process(ctx: AuthContext, recordingId: string): Promise<ProcessOutcome> {
    const started = this.now();
    const timingsMs: ProcessOutcome['timingsMs'] = { total: 0 };
    let rec = await this.mustGet(ctx, recordingId);

    if (rec.processing_status === 'EXTRACTED') {            // already done: idempotent, no work, no new rows
      return { state: await this.stateOf(ctx, rec), timingsMs };
    }

    const transcriptionStage = ['RECEIVED', 'TRANSCRIPTION_FAILED', 'TRANSCRIBING'].includes(rec.processing_status);
    if (transcriptionStage) {
      if (rec.processing_status === 'TRANSCRIPTION_FAILED' && rec.transcription_attempts >= this.opts.maxTranscriptionAttempts) {
        throw new ApiError(422, 'RETRY_LIMIT_REACHED', `This recording failed transcription ${rec.transcription_attempts} times; further retries are blocked.`);
      }
      const t0 = this.now();
      rec = await this.runTranscription(ctx, rec);
      timingsMs.transcription = this.now() - t0;
      if (rec.processing_status !== 'TRANSCRIBED') {          // failed: report it, do not pretend success
        timingsMs.total = this.now() - started;
        return { state: await this.stateOf(ctx, rec), timingsMs };
      }
    }

    const t1 = this.now();
    rec = await this.runExtraction(ctx, rec);
    timingsMs.extraction = this.now() - t1;
    timingsMs.total = this.now() - started;
    return { state: await this.stateOf(ctx, rec), timingsMs };
  }

  private async runTranscription(ctx: AuthContext, rec: RecordingRow): Promise<RecordingRow> {
    const claimed = await this.store.claim(ctx.organizationId, rec.recording_id, {
      from: ['RECEIVED', 'TRANSCRIPTION_FAILED'], to: 'TRANSCRIBING', staleSeconds: this.opts.staleClaimSeconds,
    });
    if (!claimed) throw conflict('PROCESSING_IN_PROGRESS', 'This recording is already being processed.');

    const attempt = claimed.transcription_attempts;
    const transcriptionId = randomUUID();
    let result: TranscriptionResultDto;
    try {
      result = await this.transcriber.transcribe({
        audioPath: this.storage.absolutePath(claimed.storage_uri), recordingId: claimed.recording_id, transcriptionId, attemptNumber: attempt,
      });
    } catch (err) {
      const unavailable = err instanceof TranscriptionUnavailableError;
      this.logger.warn('transcription call failed', { recording_id: claimed.recording_id, attempt, reason: unavailable ? (err as Error).message : 'unexpected' });
      result = failedResult(transcriptionId, claimed.recording_id, attempt, 'TRANSCRIPTION_SERVICE_UNAVAILABLE', 'The transcription service is unavailable. Please retry later.');
    }
    // The backend owns identity: whatever the service echoed, the stored row uses OUR ids and attempt number.
    result = { ...result, transcription_id: transcriptionId, recording_id: claimed.recording_id, attempt_number: attempt };

    try {
      return (await this.store.saveTranscriptionResult(ctx.organizationId, ctx.userId, claimed.recording_id, result)).recording;
    } catch (err) {
      if (err instanceof ClaimLostError || (err as { code?: string })?.code === '23505') throw conflict('PROCESSING_IN_PROGRESS', 'This recording is already being processed.');
      throw err;
    }
  }

  private async runExtraction(ctx: AuthContext, rec: RecordingRow): Promise<RecordingRow> {
    const org = ctx.organizationId;
    const transcription = await this.store.getCompletedTranscription(org, rec.recording_id);
    if (!transcription?.transcript) {
      // Should be impossible (TRANSCRIBED implies a COMPLETED row, enforced by migration 009); fail loudly if not.
      throw new ApiError(409, 'TRANSCRIPTION_MISSING', 'No completed transcription exists for this recording.');
    }

    // Repair path: a draft already exists (crash after commit, or duplicate request) -> just finish the status.
    const existing = await this.store.findLiveDraftForTranscription(org, transcription.transcription_id);
    if (existing) return this.reconcile(ctx, rec.recording_id);

    const claimed = await this.store.claim(org, rec.recording_id, {
      from: ['TRANSCRIBED', 'EXTRACTION_FAILED'], to: 'EXTRACTING', staleSeconds: this.opts.staleClaimSeconds,
    });
    if (!claimed) throw conflict('PROCESSING_IN_PROGRESS', 'This recording is already being processed.');

    try {
      await this.drafts.createDraft({
        organizationId: org, userId: ctx.userId, recordingId: rec.recording_id,
        transcriptionId: transcription.transcription_id, transcript: transcription.transcript,
      });
    } catch (err) {
      if (err instanceof DraftAlreadyExistsError) return this.reconcile(ctx, rec.recording_id);
      if (err instanceof ClaimLostError) throw conflict('PROCESSING_IN_PROGRESS', 'This recording is already being processed.');
      const known = err instanceof ExtractionError;
      const code = known ? err.code : 'EXTRACTION_PERSISTENCE_FAILED';
      const message = known ? err.message : 'The extraction result could not be saved. Please retry.';
      this.logger.warn('extraction failed', { recording_id: rec.recording_id, code });
      await this.store.markExtractionFailed(org, ctx.userId, rec.recording_id, code, message);
    }
    return this.mustGetById(org, rec.recording_id);
  }

  private async reconcile(ctx: AuthContext, recordingId: string): Promise<RecordingRow> {
    await this.store.markExtractedFromExistingDraft(ctx.organizationId, ctx.userId, recordingId);
    return this.mustGetById(ctx.organizationId, recordingId);
  }

  // ------------------------------------------------------------------ helpers
  /** 404 for "missing" AND for "belongs to another user" (technicians), so existence is never leaked. */
  private async mustGet(ctx: AuthContext, recordingId: string): Promise<RecordingRow> {
    const rec = await this.store.getRecording(ctx.organizationId, recordingId);
    if (!rec || (ctx.role === 'TECHNICIAN' && rec.uploaded_by !== ctx.userId)) throw notFound('Recording not found', 'RECORDING_NOT_FOUND');
    return rec;
  }

  private async mustGetById(org: string, recordingId: string): Promise<RecordingRow> {
    const rec = await this.store.getRecording(org, recordingId);
    if (!rec) throw notFound('Recording not found', 'RECORDING_NOT_FOUND');
    return rec;
  }

  private async stateOf(ctx: AuthContext, rec: RecordingRow): Promise<CaptureState> {
    const [transcription, draft] = await Promise.all([
      this.store.getLatestTranscription(ctx.organizationId, rec.recording_id),
      this.store.getDraftSummary(ctx.organizationId, rec.recording_id),
    ]);
    return { recording: rec, transcription, draft };
  }

  private async discardFile(storageUri: string): Promise<void> {
    try { await this.storage.remove(storageUri); } catch (e) { this.logger.warn('could not remove audio file', { reason: (e as Error).name }); }
  }
}

function failedResult(transcriptionId: string, recordingId: string, attempt: number, code: string, message: string): TranscriptionResultDto {
  return {
    transcription_id: transcriptionId, recording_id: recordingId, attempt_number: attempt, status: 'FAILED',
    transcript: null, detected_language: null, language_probability: null, segments: [],
    processing_duration_seconds: null, error_code: code, error_message: message, model_name: 'unknown',
    created_at: new Date().toISOString(),
  };
}
