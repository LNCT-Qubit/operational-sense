const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class PostgresDraftStore {
  constructor({ pool, organizationId }) {
    if (!pool || typeof pool.connect !== 'function') {
      throw new TypeError('A pg Pool instance is required');
    }
    if (!UUID_RE.test(organizationId || '')) {
      throw new TypeError('A valid organizationId UUID is required');
    }
    this.pool = pool;
    this.organizationId = organizationId;
  }

  async withTenant(operation) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.current_org_id', $1, true)",
        [this.organizationId]
      );
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  mapRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      organization_id: row.organization_id,
      transcription_id: row.transcription_id,
      transcript: row.transcript,
      extraction: row.extraction,
      missing_fields: row.missing_fields,
      status: row.status,
      review: row.review,
      history: row.history,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString()
    };
  }

  async create(draft) {
    return this.withTenant(async (client) => {
      const result = await client.query(
        `INSERT INTO extraction_draft
          (id, organization_id, transcription_id, transcript, extraction,
           missing_fields, status, review, history, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
         RETURNING *`,
        [
          draft.id, this.organizationId, draft.transcription_id || null,
          draft.transcript, JSON.stringify(draft.extraction),
          draft.missing_fields || [], draft.status,
          JSON.stringify(draft.review || {}),
          JSON.stringify(draft.history || []),
          draft.created_at, draft.updated_at
        ]
      );
      return this.mapRow(result.rows[0]);
    });
  }

  async get(id) {
    return this.withTenant(async (client) => {
      const result = await client.query(
        'SELECT * FROM extraction_draft WHERE id = $1 AND organization_id = $2',
        [id, this.organizationId]
      );
      return this.mapRow(result.rows[0]);
    });
  }

  async list() {
    return this.withTenant(async (client) => {
      const result = await client.query(
        `SELECT * FROM extraction_draft
         WHERE organization_id = $1
         ORDER BY created_at DESC`,
        [this.organizationId]
      );
      return result.rows.map((row) => this.mapRow(row));
    });
  }

  async update(draft) {
    return this.withTenant(async (client) => {
      const result = await client.query(
        `UPDATE extraction_draft
         SET transcription_id = $3,
             transcript = $4,
             extraction = $5::jsonb,
             missing_fields = $6,
             status = $7,
             review = $8::jsonb,
             history = $9::jsonb,
             updated_at = $10
         WHERE id = $1 AND organization_id = $2
         RETURNING *`,
        [
          draft.id, this.organizationId, draft.transcription_id || null,
          draft.transcript, JSON.stringify(draft.extraction),
          draft.missing_fields || [], draft.status,
          JSON.stringify(draft.review || {}),
          JSON.stringify(draft.history || []), draft.updated_at
        ]
      );
      if (!result.rowCount) throw new Error('Draft not found for this organization');
      return this.mapRow(result.rows[0]);
    });
  }
}

module.exports = PostgresDraftStore;
