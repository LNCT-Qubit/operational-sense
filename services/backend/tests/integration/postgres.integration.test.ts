/**
 * GATED: runs only when US07_PG_URL (connects as opsense_app) and US07_PG_ADMIN_URL (superuser, used only to seed
 * two organizations) are set and `pg` is installed. Executes the REAL SQL, constraints and RLS of migrations 001-009
 * through the REAL PostgresPipelineStore and the REAL US-06 RecordingLinkedDraftStore. See the testing report for the exact steps.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresPipelineStore } from '../../src/modules/recordings/recording.repository';
import { CaptureService } from '../../src/modules/recordings/recording.service';
import { silentLogger } from '../../src/http/logger';
import { withTenant } from '../../src/database/tenant';
import { Us06DraftCreator } from '../../src/modules/extraction/extraction.gateway';
import { FakeStorage, FakeTranscriber, ctx, WAV } from '../helpers/fakes';

const URL = process.env.US07_PG_URL, ADMIN = process.env.US07_PG_ADMIN_URL;
let pg: any = null; try { pg = require('pg'); } catch { /* not installed */ }
const skip = !(URL && ADMIN && pg) && 'set US07_PG_URL + US07_PG_ADMIN_URL and install pg to run against a live database';

const GOOD_JSON = JSON.stringify({ equipment: 'centrifugal pump', symptom: 'vibration', operating_condition: null, observation: 'noise from bearing', uncertain_fields: [] });
const orgA = randomUUID(), orgB = randomUUID();
let pool: any, admin: any;
const pending: (() => Promise<void>)[] = [];
after(async () => { for (const f of pending) await f(); await pool?.end(); await admin?.end(); });

function build(llm: () => Promise<string>, org = orgA) {
  const store = new PostgresPipelineStore(pool); const stt = new FakeTranscriber(); const storage = new FakeStorage();
  const svc = new CaptureService(store, storage, stt, new Us06DraftCreator(pool, llm), { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 }, silentLogger);
  return { store, stt, svc, c: ctx({ organizationId: org }) };
}
const up = (b: ReturnType<typeof build>, key = randomUUID()) => b.svc.upload(b.c, { clientRecordingId: key, body: WAV, ext: 'wav', mime: 'audio/wav', durationMs: 1, recordedAt: null });

test('setup', { skip }, async () => {
  pool = new pg.Pool({ connectionString: URL }); admin = new pg.Pool({ connectionString: ADMIN });
  for (const [id, n] of [[orgA, 'it-A'], [orgB, 'it-B']]) await admin.query('INSERT INTO organization (organization_id, name) VALUES ($1, $2)', [id, `US07 ${n}`]);
  const r = await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user');
  assert.deepEqual([r.rows[0].rolsuper, r.rows[0].rolbypassrls], [false, false], 'US07_PG_URL must use opsense_app');
  pending.push(async () => { await admin.query('DELETE FROM extraction_draft WHERE organization_id = ANY($1)', [[orgA, orgB]]); await admin.query('DELETE FROM transcription WHERE organization_id = ANY($1)', [[orgA, orgB]]); await admin.query('DELETE FROM recording WHERE organization_id = ANY($1)', [[orgA, orgB]]); await admin.query('DELETE FROM audit_log WHERE organization_id = ANY($1)', [[orgA, orgB]]); await admin.query('DELETE FROM organization WHERE organization_id = ANY($1)', [[orgA, orgB]]); });
});

test('full pipeline persists Recording -> Transcription -> Draft with valid FKs and EXTRACTED status', { skip }, async () => {
  const b = build(async () => GOOD_JSON); const { recording } = await up(b);
  const { state } = await b.svc.process(b.c, recording.recording_id);
  assert.equal(state.recording.processing_status, 'EXTRACTED');
  const q = await admin.query(`SELECT d.recording_id, d.transcription_id, t.recording_id AS t_rec, d.organization_id = r.organization_id AS same_org, d.missing_fields FROM extraction_draft d JOIN transcription t ON t.transcription_id = d.transcription_id JOIN recording r ON r.recording_id = d.recording_id WHERE d.recording_id = $1`, [recording.recording_id]);
  assert.equal(q.rows.length, 1); assert.equal(q.rows[0].t_rec, recording.recording_id); assert.equal(q.rows[0].same_org, true); assert.deepEqual(q.rows[0].missing_fields, ['operating_condition']);
  const audit = await admin.query('SELECT action FROM audit_log WHERE entity_id = $1', [recording.recording_id]);
  const actions = audit.rows.map((r: any) => r.action);
  for (const a of ['RECORDING_RECEIVED', 'TRANSCRIPTION_COMPLETED', 'EXTRACTION_DRAFT_CREATED']) assert.ok(actions.includes(a), `audit entry ${a} missing`);
});
test('duplicate uploads (parallel) -> one row; duplicate process (parallel) -> one transcription and one draft', { skip }, async () => {
  const b = build(async () => GOOD_JSON); const key = randomUUID();
  const ups = await Promise.all([1, 2, 3, 4, 5].map(() => up(b, key)));
  assert.equal(new Set(ups.map((u) => u.recording.recording_id)).size, 1); assert.equal(ups.filter((u) => u.created).length, 1);
  const id = ups[0].recording.recording_id;
  const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => b.svc.process(b.c, id)));
  assert.ok(results.some((r) => r.status === 'fulfilled'));
  const n = await admin.query('SELECT (SELECT count(*) FROM transcription WHERE recording_id = $1) AS t, (SELECT count(*) FROM extraction_draft WHERE recording_id = $1) AS d', [id]);
  assert.deepEqual([Number(n.rows[0].t), Number(n.rows[0].d)], [1, 1]);
});
test('tenant isolation through the real store + RLS: org B cannot see or process org A data', { skip }, async () => {
  const a = build(async () => GOOD_JSON); const { recording } = await up(a);
  const b = build(async () => GOOD_JSON, orgB);
  await assert.rejects(b.svc.get(b.c, recording.recording_id), (e: any) => e.code === 'RECORDING_NOT_FOUND');
  assert.equal((await b.svc.list(b.c, { limit: 50, offset: 0 })).some((r) => r.recording_id === recording.recording_id), false);
  const raw = await withTenant(pool, orgB, (db) => db.query('SELECT count(*) AS n FROM recording WHERE recording_id = $1', [recording.recording_id]));
  assert.equal(Number(raw.rows[0].n), 0);                                   // WITHOUT the explicit org filter: RLS alone hides it
});
test('LLM failure -> EXTRACTION_FAILED persisted; retry succeeds; transcription happened once', { skip }, async () => {
  let fail = true; const b = build(async () => { if (fail) throw new Error('429 quota'); return GOOD_JSON; });
  const { recording } = await up(b); const first = await b.svc.process(b.c, recording.recording_id);
  assert.equal(first.state.recording.processing_status, 'EXTRACTION_FAILED'); assert.equal(first.state.recording.failure_code, 'EXTRACTION_SERVICE_ERROR');
  fail = false; const second = await b.svc.process(b.c, recording.recording_id);
  assert.equal(second.state.recording.processing_status, 'EXTRACTED'); assert.equal(b.stt.calls.length, 1);
});
test('invalid (non-JSON) LLM output -> EXTRACTION_INVALID_OUTPUT, no draft row', { skip }, async () => {
  const b = build(async () => 'sorry, I cannot do that'); const { recording } = await up(b);
  const { state } = await b.svc.process(b.c, recording.recording_id);
  assert.equal(state.recording.failure_code, 'EXTRACTION_INVALID_OUTPUT'); assert.equal(state.draft, null);
});
