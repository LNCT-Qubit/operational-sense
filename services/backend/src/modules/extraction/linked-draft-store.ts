import PostgresDraftStore from './draft-store-postgres';
import { ClaimLostError } from '../recordings/recording.types';

/**
 * US-06's PostgresDraftStore, extended for US-07 in exactly one way: create() also records the link to the
 * recording and moves the recording to EXTRACTED, all inside ONE tenant transaction.
 *
 * Why a subclass instead of reusing create() unchanged?
 *   1. US-06's INSERT has no recording_id column, and migration 009 requires one (tenant-safe composite FK).
 *   2. Calling US-06's create() and then a second UPDATE would leave a window where a draft exists but the
 *      recording is still EXTRACTING. One transaction removes that window.
 * Everything else (get/list/update/withTenant/RLS handling, DraftService lifecycle) is inherited untouched.
 */
export class RecordingLinkedDraftStore extends PostgresDraftStore {
  private readonly recordingId: string;
  private readonly actor: string;

  constructor(opts: { pool: any; organizationId: string; recordingId: string; actor: string }) {
    super({ pool: opts.pool, organizationId: opts.organizationId });
    this.recordingId = opts.recordingId;
    this.actor = opts.actor;
  }

  mapRow(row: any) {
    const base = super.mapRow(row);
    return base ? { ...base, recording_id: row.recording_id ?? null } : null;
  }

  async create(draft: any) {
    if (!draft.transcription_id) throw new TypeError('A draft created by the capture pipeline must reference its transcription');
    return this.withTenant(async (client: any) => {
      const inserted = await client.query(
        `INSERT INTO extraction_draft
           (id, organization_id, recording_id, transcription_id, transcript, extraction,
            missing_fields, status, review, history, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
         RETURNING *`,
        [
          draft.id, this.organizationId, this.recordingId, draft.transcription_id, draft.transcript,
          JSON.stringify(draft.extraction), draft.missing_fields || [], draft.status,
          JSON.stringify(draft.review || {}), JSON.stringify(draft.history || []),
          draft.created_at, draft.updated_at,
        ],
      );
      const moved = await client.query(
        `UPDATE recording
            SET processing_status = 'EXTRACTED', processing_started_at = NULL, failure_code = NULL, failure_message = NULL, updated_at = now()
          WHERE organization_id = $1 AND recording_id = $2 AND processing_status = 'EXTRACTING'`,
        [this.organizationId, this.recordingId],
      );
      // Someone else took over the claim: abort, which also rolls back the draft insert above.
      if (!moved.rowCount) throw new ClaimLostError();
      await client.query(
        'INSERT INTO audit_log (organization_id, actor, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
        [this.organizationId, this.actor, 'EXTRACTION_DRAFT_CREATED', 'recording', this.recordingId,
         JSON.stringify({ draft_id: draft.id, transcription_id: draft.transcription_id, missing_fields: draft.missing_fields })],
      );
      return this.mapRow(inserted.rows[0]);
    });
  }
}
