import Extractor from './extractor';
import DraftService from './draft-service';
import { RecordingLinkedDraftStore } from './linked-draft-store';
import { ClaimLostError } from '../recordings/recording.types';

export interface DraftCreateInput { organizationId: string; userId: string; recordingId: string; transcriptionId: string; transcript: string }
export interface DraftCreated { id: string; status: string; missingFields: string[] }

export interface DraftCreator {
  createDraft(input: DraftCreateInput): Promise<DraftCreated>;
}

/** Why extraction did not produce a draft. `code` is persisted on the recording; `message` is safe to show clients. */
export class ExtractionError extends Error {
  constructor(public readonly code: 'EXTRACTION_SERVICE_ERROR' | 'EXTRACTION_INVALID_OUTPUT' | 'EXTRACTION_PERSISTENCE_FAILED', message: string, public readonly cause?: unknown) {
    super(message);
  }
}
/** A live draft already exists for this transcription (unique index uq_extraction_draft_live_per_transcription). */
export class DraftAlreadyExistsError extends Error {}

const PREFIX = 'Extraction failed: ';

/**
 * Adapter around the US-06 workflow. It REUSES US-06's Extractor (Gemini call + AJV schema validation + one
 * correction retry) and DraftService (draft validation, missing/uncertain-field handling, history) as they are.
 * Only the store differs (see RecordingLinkedDraftStore).
 */
export class Us06DraftCreator implements DraftCreator {
  constructor(private readonly pool: any, private readonly callLLM: (system: string, user: string) => Promise<string>) {}

  async createDraft(input: DraftCreateInput): Promise<DraftCreated> {
    const store = new RecordingLinkedDraftStore({ pool: this.pool, organizationId: input.organizationId, recordingId: input.recordingId, actor: input.userId });
    const service = new DraftService(new Extractor(this.callLLM), store);
    try {
      const draft = await service.createFromTranscript(input.transcript, { transcription_id: input.transcriptionId, created_by: input.userId });
      return { id: draft.id, status: draft.status, missingFields: draft.missing_fields };
    } catch (err) {
      throw classify(err);
    }
  }
}

export function classify(err: unknown): Error {
  if (err instanceof ClaimLostError) return err;
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return new DraftAlreadyExistsError('draft already exists for this transcription');
  const msg = typeof e?.message === 'string' ? e.message : '';
  if (msg.startsWith(PREFIX)) {
    const reason = msg.slice(PREFIX.length);
    // US-06 error strings: "LLM call failed: ..." (provider down/quota) vs "not valid JSON" / schema errors / "LLM output invalid after retry"
    if (reason.startsWith('LLM call failed')) return new ExtractionError('EXTRACTION_SERVICE_ERROR', 'The extraction service is unavailable. Please retry later.', err);
    return new ExtractionError('EXTRACTION_INVALID_OUTPUT', 'The extraction service returned output that failed validation.', err);
  }
  if (msg === 'Transcript must be a non-empty string') return new ExtractionError('EXTRACTION_INVALID_OUTPUT', 'The transcript is empty.', err);
  // anything else came from the store (database) or DraftService.validateExtraction
  if (msg.startsWith('Invalid extraction') || msg.startsWith('Invalid uncertain_fields') || msg.startsWith('Extraction result')) {
    return new ExtractionError('EXTRACTION_INVALID_OUTPUT', 'The extraction service returned output that failed validation.', err);
  }
  return new ExtractionError('EXTRACTION_PERSISTENCE_FAILED', 'The extraction result could not be saved. Please retry.', err);
}

