import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordingLinkedDraftStore } from '../src/modules/extraction/linked-draft-store';
import { withTenant } from '../src/database/tenant';
import { ClaimLostError } from '../src/modules/recordings/recording.types';
import { ORG_A } from './helpers/fakes';

/** MOCKED database client (same technique as US-06's adapter tests): verifies statement sequence, parameters and transaction boundaries, NOT live PostgreSQL behaviour. */
function mockPool(responder: (sql: string, params?: unknown[]) => { rows: any[]; rowCount: number } | Error) {
  const log: { sql: string; params?: unknown[] }[] = []; let released: unknown = 'not-released';
  const client = { async query(sql: string, params?: unknown[]) { log.push({ sql, params }); const r = responder(sql, params); if (r instanceof Error) throw r; return r; }, release(e?: unknown) { released = e; } };
  return { pool: { async connect() { return client; } }, log, released: () => released };
}
const ROW = { id: 'd1', organization_id: ORG_A, recording_id: 'r1', transcription_id: 't1', transcript: 'x', extraction: {}, missing_fields: [], status: 'DRAFT', review: {}, history: [], created_at: new Date(), updated_at: new Date() };
const DRAFT = { id: 'd1', transcription_id: 't1', transcript: 'x', extraction: { equipment: 'p' }, missing_fields: ['symptom'], status: 'DRAFT', review: {}, history: [], created_at: 'a', updated_at: 'b' };
const first = (s: string) => s.trim().split(/\s+/).slice(0, 2).join(' ');

test('create(): BEGIN -> set tenant -> INSERT draft(with recording_id) -> UPDATE recording EXTRACTED -> audit -> COMMIT, all on one connection', async () => {
  const m = mockPool((sql) => (/INSERT INTO extraction_draft/.test(sql) ? { rows: [ROW], rowCount: 1 } : /UPDATE recording/.test(sql) ? { rows: [], rowCount: 1 } : { rows: [], rowCount: 0 }));
  const store = new RecordingLinkedDraftStore({ pool: m.pool, organizationId: ORG_A, recordingId: 'r1', actor: 'u1' });
  const out: any = await store.create(DRAFT);
  assert.deepEqual(m.log.map((l) => first(l.sql)), ['BEGIN', 'SELECT set_config(\'app.current_org_id\',', 'INSERT INTO', 'UPDATE recording', 'INSERT INTO', 'COMMIT']);
  assert.deepEqual(m.log[1].params, [ORG_A]);
  assert.deepEqual(m.log[2].params!.slice(0, 4), ['d1', ORG_A, 'r1', 't1']);          // org from the store, recording from the pipeline
  assert.ok(/organization_id = \$1 AND recording_id = \$2 AND processing_status = 'EXTRACTING'/.test(m.log[3].sql));
  assert.equal(out.recording_id, 'r1'); assert.equal(m.released(), undefined);
  for (const l of m.log) assert.ok(!l.sql.includes(ORG_A) && !l.sql.includes('d1'), 'values must be bind parameters, not interpolated');
});
test('create(): claim lost (0 rows updated) -> ROLLBACK, ClaimLostError, no COMMIT (draft insert is undone)', async () => {
  const m = mockPool((sql) => (/INSERT INTO extraction_draft/.test(sql) ? { rows: [ROW], rowCount: 1 } : { rows: [], rowCount: 0 }));
  const store = new RecordingLinkedDraftStore({ pool: m.pool, organizationId: ORG_A, recordingId: 'r1', actor: 'u1' });
  await assert.rejects(store.create(DRAFT), ClaimLostError);
  const seq = m.log.map((l) => first(l.sql)); assert.ok(seq.includes('ROLLBACK') && !seq.includes('COMMIT'));
});
test('create(): unique violation (duplicate live draft) rolls back and propagates SQLSTATE 23505', async () => {
  const m = mockPool((sql) => (/INSERT INTO extraction_draft/.test(sql) ? Object.assign(new Error('dup'), { code: '23505' }) : { rows: [], rowCount: 0 }));
  const store = new RecordingLinkedDraftStore({ pool: m.pool, organizationId: ORG_A, recordingId: 'r1', actor: 'u1' });
  await assert.rejects(store.create(DRAFT), (e: any) => e.code === '23505'); assert.ok(m.log.some((l) => l.sql === 'ROLLBACK'));
});
test('create(): refuses a draft without a transcription_id (cannot break the link chain)', async () => {
  const m = mockPool(() => ({ rows: [], rowCount: 0 }));
  const store = new RecordingLinkedDraftStore({ pool: m.pool, organizationId: ORG_A, recordingId: 'r1', actor: 'u1' });
  await assert.rejects(store.create({ ...DRAFT, transcription_id: null }), TypeError); assert.equal(m.log.length, 0);
});
test('withTenant: rejects non-UUID org before touching the DB; failed ROLLBACK makes the pool discard the connection', async () => {
  const m = mockPool(() => ({ rows: [], rowCount: 0 }));
  await assert.rejects(withTenant(m.pool, "x'; DROP TABLE recording;--", async () => 1), TypeError); assert.equal(m.log.length, 0);
  const bad = mockPool((sql) => (sql === 'ROLLBACK' ? new Error('rollback failed') : { rows: [], rowCount: 0 }));
  await assert.rejects(withTenant(bad.pool, ORG_A, async () => { throw new Error('boom'); }), /boom/);
  assert.ok(bad.released() instanceof Error);
});
