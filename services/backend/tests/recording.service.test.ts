import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureService } from '../src/modules/recordings/recording.service';
import { ApiError } from '../src/http/errors';
import { silentLogger } from '../src/http/logger';
import { TranscriptionUnavailableError } from '../src/modules/transcription/transcription.client';
import { ExtractionError } from '../src/modules/extraction/extraction.gateway';
import { ClaimLostError } from '../src/modules/recordings/recording.types';
import { InMemoryStore, FakeStorage, FakeTranscriber, FakeDrafts, completed, notCompleted, ctx, ORG_A, ORG_B, WAV } from './helpers/fakes';

const KEY = (n = 1) => `c0000000-0000-4000-8000-00000000000${n}`;
function setup(opts: Partial<{ autoProcess: boolean; stale: number; max: number }> = {}) {
  const store = new InMemoryStore(), storage = new FakeStorage(), stt = new FakeTranscriber(), drafts = new FakeDrafts(store);
  let t = Date.now(); store.clock = () => t;
  const svc = new CaptureService(store, storage, stt, drafts, { autoProcess: opts.autoProcess ?? false, staleClaimSeconds: opts.stale ?? 600, maxTranscriptionAttempts: opts.max ?? 3 }, silentLogger, () => t);
  return { store, storage, stt, drafts, svc, advance: (ms: number) => { t += ms; } };
}
const up = (s: ReturnType<typeof setup>, c = ctx(), key = KEY(), body = WAV) => s.svc.upload(c, { clientRecordingId: key, body, ext: 'wav', mime: 'audio/wav', durationMs: 1000, recordedAt: null });
const code = async (p: Promise<unknown>) => { try { await p; assert.fail('expected rejection'); } catch (e) { assert.ok(e instanceof ApiError, String(e)); return `${e.status}:${e.code}`; } };

// ---------- happy path
test('end to end: RECEIVED -> TRANSCRIBED -> EXTRACTED with the full Recording->Transcription->Draft chain', async () => {
  const s = setup();
  const { recording, created } = await up(s);
  assert.equal(created, true); assert.equal(recording.processing_status, 'RECEIVED');
  const out = await s.svc.process(ctx(), recording.recording_id);
  const { state } = out;
  assert.equal(state.recording.processing_status, 'EXTRACTED');
  assert.equal(state.recording.failure_code, null);
  assert.equal(state.transcription!.status, 'COMPLETED');
  assert.equal(state.transcription!.recording_id, recording.recording_id);
  assert.equal(state.draft!.transcription_id, state.transcription!.transcription_id);        // draft -> transcription
  assert.equal(s.drafts.calls[0].recordingId, recording.recording_id);                          // draft -> recording
  assert.equal(s.drafts.calls[0].transcript, 'The pump is vibrating excessively');              // extraction got the stored transcript
  assert.equal(s.stt.calls[0].audioPath, `/var/uploads/${ORG_A}/${recording.recording_id}.wav`); // transcriber got the right file
  assert.equal(s.stt.calls[0].attemptNumber, 1);
  assert.ok(out.timingsMs.total >= 0 && out.timingsMs.transcription !== undefined && out.timingsMs.extraction !== undefined);
});
test('autoProcess schedules background processing that settles via idle()', async () => {
  const s = setup({ autoProcess: true });
  const { recording } = await up(s);
  await s.svc.idle();
  assert.equal((await s.svc.get(ctx(), recording.recording_id)).recording.processing_status, 'EXTRACTED');
});

// ---------- idempotent upload
test('duplicate upload with same key+bytes returns the original, creates no second row, drops the copy', async () => {
  const s = setup();
  const a = await up(s); const b = await up(s);
  assert.equal(b.created, false); assert.equal(b.recording.recording_id, a.recording.recording_id);
  assert.equal(s.store.recs.size, 1); assert.equal(s.storage.files.size, 1); assert.equal(s.storage.removed.length, 1);
});
test('same key with different bytes (or different user) -> 409 IDEMPOTENCY_KEY_REUSED', async () => {
  const s = setup(); await up(s);
  assert.equal(await code(up(s, ctx(), KEY(), Buffer.concat([WAV, Buffer.from('x')]))), '409:IDEMPOTENCY_KEY_REUSED');
  assert.equal(await code(up(s, ctx({ userId: 'other' }))), '409:IDEMPOTENCY_KEY_REUSED');
});
test('same key in two organizations -> two independent recordings', async () => {
  const s = setup();
  const a = await up(s, ctx()); const b = await up(s, ctx({ organizationId: ORG_B }));
  assert.notEqual(a.recording.recording_id, b.recording.recording_id); assert.equal(s.store.recs.size, 2);
});
test('DB failure on insert removes the stored file (no orphan)', async () => {
  const s = setup(); s.store.failNext.insertRecordingIfAbsent = Object.assign(new Error('down'), { code: 'ECONNREFUSED' });
  await assert.rejects(up(s)); assert.equal(s.storage.files.size, 0);
});
test('storage failure surfaces and nothing is written to the DB', async () => {
  const s = setup(); s.storage.failSave = true;
  await assert.rejects(up(s)); assert.equal(s.store.recs.size, 0);
});

// ---------- not found / authorization
test('unknown recording -> 404 RECORDING_NOT_FOUND', async () => {
  const s = setup();
  assert.equal(await code(s.svc.get(ctx(), 'a0000000-0000-4000-8000-000000000009')), '404:RECORDING_NOT_FOUND');
  assert.equal(await code(s.svc.process(ctx(), 'a0000000-0000-4000-8000-000000000009')), '404:RECORDING_NOT_FOUND');
});
test('tenant isolation: another organization cannot read or process a recording (even as ADMIN)', async () => {
  const s = setup(); const { recording } = await up(s);
  const intruder = ctx({ organizationId: ORG_B, role: 'ADMIN' });
  assert.equal(await code(s.svc.get(intruder, recording.recording_id)), '404:RECORDING_NOT_FOUND');
  assert.equal(await code(s.svc.process(intruder, recording.recording_id)), '404:RECORDING_NOT_FOUND');
  assert.equal(await code(s.svc.getDraft(intruder, recording.recording_id)), '404:RECORDING_NOT_FOUND');
  assert.equal((await s.svc.list(intruder, { limit: 10, offset: 0 })).length, 0);
  assert.equal(s.stt.calls.length, 0);
});
test('technicians see only their own recordings; supervisors see the organization', async () => {
  const s = setup(); const mine = await up(s, ctx(), KEY(1)); await up(s, ctx({ userId: 'tech-2' }), KEY(2));
  assert.equal(await code(s.svc.get(ctx({ userId: 'tech-2' }), mine.recording.recording_id)), '404:RECORDING_NOT_FOUND');
  assert.equal((await s.svc.list(ctx(), { limit: 10, offset: 0 })).length, 1);
  assert.equal((await s.svc.list(ctx({ role: 'SUPERVISOR', userId: 'sup' }), { limit: 10, offset: 0 })).length, 2);
  assert.equal((await s.svc.get(ctx({ role: 'SUPERVISOR', userId: 'sup' }), mine.recording.recording_id)).recording.recording_id, mine.recording.recording_id);
});

// ---------- transcription failures
test('transcription FAILED is stored as FAILED, never as success; extraction is not attempted', async () => {
  const s = setup(); const { recording } = await up(s);
  s.stt.next = (r) => notCompleted(r, 'FAILED', 'INVALID_AUDIO');
  const { state } = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(state.recording.processing_status, 'TRANSCRIPTION_FAILED');
  assert.equal(state.recording.failure_code, 'INVALID_AUDIO');
  assert.equal(state.transcription!.status, 'FAILED'); assert.equal(state.draft, null);
  assert.equal(s.drafts.calls.length, 0);
});
test('silence (EMPTY) -> TRANSCRIPTION_FAILED / NO_SPEECH_DETECTED', async () => {
  const s = setup(); const { recording } = await up(s);
  s.stt.next = (r) => notCompleted(r, 'EMPTY', null);
  const { state } = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(state.recording.processing_status, 'TRANSCRIPTION_FAILED'); assert.equal(state.recording.failure_code, 'NO_SPEECH_DETECTED');
  assert.equal(s.drafts.calls.length, 0);
});
test('transcription service down -> failed attempt recorded with TRANSCRIPTION_SERVICE_UNAVAILABLE; retry succeeds as attempt 2', async () => {
  const s = setup(); const { recording } = await up(s);
  s.stt.next = () => { throw new TranscriptionUnavailableError('unreachable'); };
  const first = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(first.state.recording.failure_code, 'TRANSCRIPTION_SERVICE_UNAVAILABLE');
  s.stt.next = (r) => completed(r, 'bearing noise');
  const second = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(second.state.recording.processing_status, 'EXTRACTED');
  assert.equal(second.state.recording.failure_code, null);                                  // retry clears the old failure
  assert.deepEqual(s.store.trs.map((t) => [t.attempt_number, t.status]), [[1, 'FAILED'], [2, 'COMPLETED']]);
  assert.deepEqual(s.stt.calls.map((c) => c.attemptNumber), [1, 2]);
});
test('retry cap: after max failed attempts -> 422 RETRY_LIMIT_REACHED and the service is not called again', async () => {
  const s = setup({ max: 2 }); const { recording } = await up(s);
  s.stt.next = (r) => notCompleted(r, 'FAILED', 'INFERENCE_FAILURE');
  await s.svc.process(ctx(), recording.recording_id); await s.svc.process(ctx(), recording.recording_id);
  assert.equal(await code(s.svc.process(ctx(), recording.recording_id)), '422:RETRY_LIMIT_REACHED');
  assert.equal(s.stt.calls.length, 2);
});
test('the backend overrides ids echoed by the transcription service (it owns identity)', async () => {
  const s = setup(); const { recording } = await up(s);
  s.stt.next = (r) => ({ ...completed(r, 'ok'), transcription_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', recording_id: 'x', attempt_number: 99 });
  const { state } = await s.svc.process(ctx(), recording.recording_id);
  assert.notEqual(state.transcription!.transcription_id, 'ffffffff-ffff-4fff-8fff-ffffffffffff'); assert.equal(state.transcription!.attempt_number, 1);
});

// ---------- extraction failures
test('extraction service failure -> EXTRACTION_FAILED; retry re-extracts WITHOUT re-transcribing', async () => {
  const s = setup(); const { recording } = await up(s);
  s.drafts.fail = new ExtractionError('EXTRACTION_SERVICE_ERROR', 'unavailable');
  const first = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(first.state.recording.processing_status, 'EXTRACTION_FAILED'); assert.equal(first.state.recording.failure_code, 'EXTRACTION_SERVICE_ERROR');
  assert.equal(first.state.draft, null); assert.equal(first.state.transcription!.status, 'COMPLETED');
  s.drafts.fail = null;
  const second = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(second.state.recording.processing_status, 'EXTRACTED');
  assert.equal(s.stt.calls.length, 1);                                                       // transcription happened once only
});
test('invalid AI output is reported as EXTRACTION_INVALID_OUTPUT; unknown persistence error is mapped, not leaked', async () => {
  const s = setup(); const { recording } = await up(s);
  s.drafts.fail = new ExtractionError('EXTRACTION_INVALID_OUTPUT', 'failed validation');
  assert.equal((await s.svc.process(ctx(), recording.recording_id)).state.recording.failure_code, 'EXTRACTION_INVALID_OUTPUT');
  s.drafts.fail = new Error('connection to 10.0.0.5 password=hunter2 refused');
  const st = (await s.svc.process(ctx(), recording.recording_id)).state.recording;
  assert.equal(st.failure_code, 'EXTRACTION_PERSISTENCE_FAILED'); assert.ok(!st.failure_message!.includes('hunter2'));
});

// ---------- duplicate / concurrent processing
test('concurrent process requests: exactly one runs; the other gets 409 PROCESSING_IN_PROGRESS; one draft', async () => {
  const s = setup(); const { recording } = await up(s);
  let release!: () => void; s.stt.gate = new Promise<void>((r) => (release = r));
  const first = s.svc.process(ctx(), recording.recording_id);
  await new Promise((r) => setImmediate(r));
  assert.equal(await code(s.svc.process(ctx(), recording.recording_id)), '409:PROCESSING_IN_PROGRESS');
  release(); await first;
  assert.equal(s.stt.calls.length, 1); assert.equal(s.store.drafts.length, 1);
});
test('processing an already EXTRACTED recording is a no-op (no new transcription, no new draft)', async () => {
  const s = setup(); const { recording } = await up(s);
  await s.svc.process(ctx(), recording.recording_id); await s.svc.process(ctx(), recording.recording_id);
  assert.equal(s.stt.calls.length, 1); assert.equal(s.drafts.calls.length, 1); assert.equal(s.store.drafts.length, 1);
});
test('stale claim (crashed worker) can be taken over; a fresh one cannot', async () => {
  const s = setup({ stale: 60 }); const { recording } = await up(s);
  await s.store.claim(ORG_A, recording.recording_id, { from: ['RECEIVED'], to: 'TRANSCRIBING', staleSeconds: 60 }); // simulate a worker that died
  assert.equal(await code(s.svc.process(ctx(), recording.recording_id)), '409:PROCESSING_IN_PROGRESS');
  s.advance(61_000);
  assert.equal((await s.svc.process(ctx(), recording.recording_id)).state.recording.processing_status, 'EXTRACTED');
});
test('crash between draft commit and status update is repaired, not duplicated', async () => {
  const s = setup(); const { recording } = await up(s);
  s.drafts.fail = new ExtractionError('EXTRACTION_SERVICE_ERROR', 'x'); await s.svc.process(ctx(), recording.recording_id);
  const r = s.store.recs.get(recording.recording_id)!; const tr = s.store.trs[0];
  s.store.drafts.push({ org: ORG_A, recording_id: r.recording_id, id: 'd1', status: 'DRAFT', missing_fields: [], transcription_id: tr.transcription_id, created_at: new Date().toISOString() }); // draft exists, status stale
  s.drafts.fail = null; const calls = s.drafts.calls.length;
  const out = await s.svc.process(ctx(), recording.recording_id);
  assert.equal(out.state.recording.processing_status, 'EXTRACTED'); assert.equal(s.drafts.calls.length, calls); assert.equal(s.store.drafts.length, 1);
});
test('claim lost while saving the transcription -> 409 and nothing stored', async () => {
  const s = setup(); const { recording } = await up(s);
  s.store.failNext.saveTranscriptionResult = new ClaimLostError();
  assert.equal(await code(s.svc.process(ctx(), recording.recording_id)), '409:PROCESSING_IN_PROGRESS'); assert.equal(s.store.trs.length, 0);
});
test('getDraft: 404 DRAFT_NOT_FOUND before extraction, draft afterwards', async () => {
  const s = setup(); const { recording } = await up(s);
  assert.equal(await code(s.svc.getDraft(ctx(), recording.recording_id)), '404:DRAFT_NOT_FOUND');
  await s.svc.process(ctx(), recording.recording_id);
  assert.equal((await s.svc.getDraft(ctx(), recording.recording_id)).status, 'DRAFT');
});
test('retryable hint: bad-input codes are not retryable, transient service codes are', async () => {
  const { isRetryable } = await import('../src/modules/recordings/recording.service.js');
  for (const c of ['FILE_EMPTY', 'UNSUPPORTED_FORMAT', 'INVALID_AUDIO', 'NO_SPEECH_DETECTED', 'VALIDATION_ERROR']) assert.equal(isRetryable(c), false, c);
  for (const c of ['TRANSCRIPTION_SERVICE_UNAVAILABLE', 'INFERENCE_FAILURE', 'MODEL_INIT_FAILURE', 'EXTRACTION_SERVICE_ERROR']) assert.equal(isRetryable(c), true, c);
  assert.equal(isRetryable(null), false);
});
