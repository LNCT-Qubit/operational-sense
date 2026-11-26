const test = require('node:test');
const assert = require('node:assert/strict');
const PostgresDraftStore = require('./draft-store-postgres');

function fakePool() {
  const calls = [];
  const row = {
    id: '2b5c4f2e-4c75-4b62-a1b7-2e1f3d1a9f50',
    organization_id: 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e',
    transcription_id: 'transcript-01',
    transcript: 'Motor vibration under load',
    extraction: {
      equipment: 'motor',
      symptom: 'vibration',
      operating_condition: 'under load',
      observation: 'unusual vibration',
      uncertain_fields: []
    },
    missing_fields: [],
    status: 'DRAFT',
    review: {},
    history: [],
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z')
  };
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO extraction_draft')) return { rows: [row], rowCount: 1 };
      if (sql.startsWith('SELECT * FROM extraction_draft')) return { rows: [row], rowCount: 1 };
      if (sql.startsWith('UPDATE extraction_draft')) return { rows: [{ ...row, status: params[6] }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ sql: 'RELEASE' }); }
  };
  return {
    calls,
    pool: { connect: async () => client }
  };
}

test('PostgreSQL store scopes each operation to the tenant transaction', async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresDraftStore({
    pool,
    organizationId: 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e'
  });

  const draft = {
    id: '2b5c4f2e-4c75-4b62-a1b7-2e1f3d1a9f50',
    transcription_id: 'transcript-01',
    transcript: 'Motor vibration under load',
    extraction: { equipment: 'motor', symptom: 'vibration', operating_condition: 'under load', observation: 'unusual vibration', uncertain_fields: [] },
    missing_fields: [],
    status: 'DRAFT',
    review: {},
    history: [],
    created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updated_at: new Date('2026-01-01T00:00:00.000Z').toISOString()
  };

  const created = await store.create(draft);
  assert.equal(created.status, 'DRAFT');
  assert.ok(calls.some((call) => call.sql === "SELECT set_config('app.current_org_id', $1, true)"));
  assert.ok(calls.some((call) => call.sql === 'COMMIT'));
  assert.ok(calls.some((call) => call.sql === 'RELEASE'));
});

test('PostgreSQL store reads and updates using parameterized queries', async () => {
  const { pool, calls } = fakePool();
  const store = new PostgresDraftStore({
    pool,
    organizationId: 'b2a7dce7-b449-4381-ba3b-b520f2c88c2e'
  });

  const found = await store.get('2b5c4f2e-4c75-4b62-a1b7-2e1f3d1a9f50');
  assert.equal(found.transcription_id, 'transcript-01');

  const updated = await store.update({
    id: found.id,
    transcription_id: found.transcription_id,
    transcript: found.transcript,
    extraction: found.extraction,
    missing_fields: found.missing_fields,
    status: 'UNDER_REVIEW',
    review: found.review,
    history: found.history,
    updated_at: new Date().toISOString()
  });
  assert.equal(updated.status, 'UNDER_REVIEW');
  assert.ok(calls.some((call) => call.sql.includes('WHERE id = $1 AND organization_id = $2')));
  assert.ok(calls.every((call) => !call.sql.includes(found.id)));
});

test('rejects invalid tenant identifiers', () => {
  const { pool } = fakePool();
  assert.throws(() => new PostgresDraftStore({ pool, organizationId: 'not-a-uuid' }), /organizationId UUID/);
});
