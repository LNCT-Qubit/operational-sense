import { withTenant, type PoolLike, type Queryable } from '../../database/tenant';
import {
  ClaimLostError,
  type ClaimOptions, type DraftSummary, type ListFilter, type NewRecording, type PipelineStore,
  type RecordingRow, type TranscriptionResultDto, type TranscriptionRow,
} from './recording.types';

const iso = (v: unknown): string | null => (v == null ? null : new Date(v as string).toISOString());

export function mapRecording(r: any): RecordingRow {
  return {
    recording_id: r.recording_id,
    organization_id: r.organization_id,
    client_recording_id: r.client_recording_id,
    uploaded_by: r.uploaded_by,
    mime_type: r.mime_type,
    size_bytes: Number(r.size_bytes),            // BIGINT arrives as a string from node-postgres
    sha256: r.sha256,
    storage_uri: r.storage_uri,
    duration_ms: r.duration_ms ?? null,
    recorded_at: iso(r.recorded_at),
    processing_status: r.processing_status,
    failure_code: r.failure_code ?? null,
    failure_message: r.failure_message ?? null,
    processing_started_at: iso(r.processing_started_at),
    transcription_attempts: r.transcription_attempts,
    created_at: iso(r.created_at)!,
    updated_at: iso(r.updated_at)!,
  };
}

export function mapTranscription(r: any): TranscriptionRow {
  return {
    transcription_id: r.transcription_id,
    recording_id: r.recording_id,
    attempt_number: r.attempt_number,
    status: r.status,
    transcript: r.transcript ?? null,
    detected_language: r.detected_language ?? null,
    language_probability: r.language_probability == null ? null : Number(r.language_probability), // NUMERIC -> string
    processing_duration_seconds: r.processing_duration_seconds == null ? null : Number(r.processing_duration_seconds),
    error_code: r.error_code ?? null,
    error_message: r.error_message ?? null,
    model_name: r.model_name,
    created_at: iso(r.created_at)!,
  };
}

function mapDraft(r: any): DraftSummary {
  return {
    id: r.id, status: r.status, missing_fields: r.missing_fields, transcription_id: r.transcription_id, created_at: iso(r.created_at)!,
    extraction: r.extraction && typeof r.extraction === 'object' ? r.extraction : null,
  };
}

async function audit(db: Queryable, org: string, actor: string, action: string, entityId: string, details: Record<string, unknown>): Promise<void> {
  // audit_log is append-only for the app role (migration 007): INSERT only.
  await db.query(
    'INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
    [org, actor, action, 'recording', entityId, JSON.stringify(details)],
  );
}

export class PostgresPipelineStore implements PipelineStore {
  constructor(private readonly pool: PoolLike) {}

  /**
   * Idempotent insert ("Option B" from proposal Sec.4): INSERT .. ON CONFLICT DO NOTHING, and only if nothing was
   * inserted read the existing row. The retry path performs no write, so it cannot fire UPDATE triggers,
   * touch updated_at, or create spurious audit entries.
   */
  insertRecordingIfAbsent(org: string, actor: string, i: NewRecording) {
    return withTenant(this.pool, org, async (db) => {
      const ins = await db.query(
        `INSERT INTO recording
           (recording_id, organization_id, client_recording_id, uploaded_by, mime_type, size_bytes, sha256, storage_uri, duration_ms, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (organization_id, client_recording_id) DO NOTHING
         RETURNING *`,
        [i.recordingId, org, i.clientRecordingId, actor, i.mimeType, i.sizeBytes, i.sha256, i.storageUri, i.durationMs, i.recordedAt],
      );
      if (ins.rows[0]) {
        await audit(db, org, actor, 'RECORDING_RECEIVED', i.recordingId, { size_bytes: i.sizeBytes, mime_type: i.mimeType });
        return { recording: mapRecording(ins.rows[0]), created: true };
      }
      const existing = await db.query(
        'SELECT * FROM recording WHERE organization_id = $1 AND client_recording_id = $2',
        [org, i.clientRecordingId],
      );
      return { recording: mapRecording(existing.rows[0]), created: false };
    });
  }

  getRecording(org: string, id: string) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query('SELECT * FROM recording WHERE organization_id = $1 AND recording_id = $2', [org, id]);
      return r.rows[0] ? mapRecording(r.rows[0]) : null;
    });
  }

  listRecordings(org: string, f: ListFilter) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query(
        `SELECT * FROM recording
          WHERE organization_id = $1
            AND ($2::text IS NULL OR processing_status = $2)
            AND ($3::text IS NULL OR uploaded_by = $3)
          ORDER BY created_at DESC, recording_id
          LIMIT $4 OFFSET $5`,
        [org, f.status ?? null, f.uploadedBy ?? null, f.limit, f.offset],
      );
      return r.rows.map(mapRecording);
    });
  }

  /**
   * Atomic "claim": one conditional UPDATE decides who may process. Two concurrent requests cannot both succeed
   * because the second sees the already-changed status. A claim stuck in the target in-progress state for longer
   * than staleSeconds (crashed worker) may be taken over. A claim clears any previous failure so the
   * chk_recording_failure_code constraint holds.
   */
  claim(org: string, id: string, o: ClaimOptions) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query(
        `UPDATE recording
            SET processing_status = $4,
                processing_started_at = now(),
                failure_code = NULL,
                failure_message = NULL,
                transcription_attempts = transcription_attempts + CASE WHEN $4 = 'TRANSCRIBING' THEN 1 ELSE 0 END,
                updated_at = now()
          WHERE organization_id = $1 AND recording_id = $2
            AND ( processing_status = ANY($3::text[])
                  OR (processing_status = $4 AND processing_started_at < now() - make_interval(secs => $5::double precision)) )
        RETURNING *`,
        [org, id, o.from, o.to, o.staleSeconds],
      );
      return r.rows[0] ? mapRecording(r.rows[0]) : null;
    });
  }

  /**
   * Stores one transcription attempt AND moves the recording to its next state in ONE transaction. If the claim was
   * lost meanwhile (0 rows updated) we throw, which rolls back the transcription insert too: no orphan rows.
   * EMPTY (silence) is not a success for the pipeline: it becomes TRANSCRIPTION_FAILED / NO_SPEECH_DETECTED.
   */
  saveTranscriptionResult(org: string, actor: string, recordingId: string, t: TranscriptionResultDto) {
    return withTenant(this.pool, org, async (db) => {
      const tr = await db.query(
        `INSERT INTO transcription
           (transcription_id, organization_id, recording_id, attempt_number, status, transcript, detected_language,
            language_probability, segments, processing_duration_seconds, error_code, error_message, model_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
         RETURNING *`,
        [t.transcription_id, org, recordingId, t.attempt_number, t.status, t.transcript, t.detected_language,
         t.language_probability, JSON.stringify(t.segments ?? []), t.processing_duration_seconds, t.error_code, t.error_message, t.model_name],
      );
      const ok = t.status === 'COMPLETED';
      const failureCode = ok ? null : t.status === 'EMPTY' ? 'NO_SPEECH_DETECTED' : (t.error_code ?? 'TRANSCRIPTION_FAILED');
      const failureMessage = ok ? null : t.status === 'EMPTY' ? 'No speech was detected in the recording.' : (t.error_message ?? 'Transcription failed.');
      const up = await db.query(
        `UPDATE recording
            SET processing_status = $3, processing_started_at = NULL, failure_code = $4, failure_message = $5, updated_at = now()
          WHERE organization_id = $1 AND recording_id = $2 AND processing_status = 'TRANSCRIBING'
        RETURNING *`,
        [org, recordingId, ok ? 'TRANSCRIBED' : 'TRANSCRIPTION_FAILED', failureCode, failureMessage],
      );
      if (!up.rows[0]) throw new ClaimLostError();
      await audit(db, org, actor, ok ? 'TRANSCRIPTION_COMPLETED' : 'TRANSCRIPTION_FAILED', recordingId, {
        transcription_id: t.transcription_id, attempt: t.attempt_number, status: t.status, error_code: failureCode,
      });
      return { recording: mapRecording(up.rows[0]), transcription: mapTranscription(tr.rows[0]) };
    });
  }

  getLatestTranscription(org: string, recordingId: string) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query(
        'SELECT * FROM transcription WHERE organization_id = $1 AND recording_id = $2 ORDER BY attempt_number DESC LIMIT 1',
        [org, recordingId],
      );
      return r.rows[0] ? mapTranscription(r.rows[0]) : null;
    });
  }

  getCompletedTranscription(org: string, recordingId: string) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query(
        "SELECT * FROM transcription WHERE organization_id = $1 AND recording_id = $2 AND status = 'COMPLETED'",
        [org, recordingId],
      );
      return r.rows[0] ? mapTranscription(r.rows[0]) : null;
    });
  }

  markExtractionFailed(org: string, actor: string, id: string, code: string, message: string) {
    return withTenant(this.pool, org, async (db) => {
      const up = await db.query(
        `UPDATE recording
            SET processing_status = 'EXTRACTION_FAILED', processing_started_at = NULL, failure_code = $3, failure_message = $4, updated_at = now()
          WHERE organization_id = $1 AND recording_id = $2 AND processing_status = 'EXTRACTING'`,
        [org, id, code, message],
      );
      if (up.rowCount) await audit(db, org, actor, 'EXTRACTION_FAILED', id, { error_code: code });
      return !!up.rowCount;
    });
  }

  findLiveDraftForTranscription(org: string, transcriptionId: string) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query(
        "SELECT id, status, missing_fields, transcription_id, created_at FROM extraction_draft WHERE organization_id = $1 AND transcription_id = $2 AND status <> 'REJECTED'",
        [org, transcriptionId],
      );
      return r.rows[0] ? mapDraft(r.rows[0]) : null;
    });
  }

  /** Repair path: the draft exists but the recording never reached EXTRACTED (e.g. crash between two transactions). */
  markExtractedFromExistingDraft(org: string, actor: string, id: string) {
    return withTenant(this.pool, org, async (db) => {
      const up = await db.query(
        `UPDATE recording
            SET processing_status = 'EXTRACTED', processing_started_at = NULL, failure_code = NULL, failure_message = NULL, updated_at = now()
          WHERE organization_id = $1 AND recording_id = $2 AND processing_status IN ('EXTRACTING', 'EXTRACTION_FAILED', 'TRANSCRIBED')`,
        [org, id],
      );
      if (up.rowCount) await audit(db, org, actor, 'EXTRACTION_RECONCILED', id, {});
      return !!up.rowCount;
    });
  }

  getDraftSummary(org: string, recordingId: string) {
    return withTenant(this.pool, org, async (db) => {
      const r = await db.query(
        `SELECT id, status, missing_fields, transcription_id, created_at, extraction FROM extraction_draft
          WHERE organization_id = $1 AND recording_id = $2
          ORDER BY (status <> 'REJECTED') DESC, created_at DESC LIMIT 1`,
        [org, recordingId],
      );
      return r.rows[0] ? mapDraft(r.rows[0]) : null;
    });
  }
}
