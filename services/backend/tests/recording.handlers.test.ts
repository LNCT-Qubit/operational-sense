import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureService } from '../src/modules/recordings/recording.service';
import { createRecordingHandlers } from '../src/modules/recordings/recording.handlers';
import { errorMiddleware, correlationMiddleware, toApiError } from '../src/http/errors';
import { silentLogger } from '../src/http/logger';
import { InMemoryStore, FakeStorage, FakeTranscriber, FakeDrafts, ctx, WAV, ORG_A } from './helpers/fakes';
import { checkAudio, normalizeMime } from '../src/modules/recordings/audio-format';

const KEY = 'c0000000-0000-4000-8000-000000000001';
const ALLOWED = new Set(['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/flac', 'audio/ogg']);
function rig() {
  const store = new InMemoryStore(), stt = new FakeTranscriber(), drafts = new FakeDrafts(store), storage = new FakeStorage();
  const svc = new CaptureService(store, storage, stt, drafts, { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 }, silentLogger);
  const h = createRecordingHandlers(svc, { allowedMimeTypes: ALLOWED, maxUploadBytes: 1000 });
  return { store, stt, svc, h, storage };
}
/** Drives a handler like Express would: on error, forward to the real error middleware. */
async function call(handler: any, req: Partial<any>) {
  const out: any = { status: 200, headers: {}, body: undefined };
  const res = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; return res; }, setHeader(k: string, v: string) { out.headers[k] = v; return res; } };
  const full = { method: 'POST', headers: {}, params: {}, query: {}, auth: ctx(), correlationId: 'corr-12345678', ...req };
  await new Promise<void>((resolve) => {
    handler(full, res, (err: unknown) => { errorMiddleware(silentLogger)(err, full as any, res as any, () => {}); resolve(); });
    const tick = setInterval(() => { if (out.body !== undefined) { clearInterval(tick); resolve(); } }, 1);
  });
  return out;
}
const uploadReq = (o: any = {}) => ({ headers: { 'idempotency-key': KEY, 'content-type': 'audio/wav', ...(o.headers ?? {}) }, body: o.body ?? WAV });

test('upload: 201 with Location, status RECEIVED, no internal fields leaked', async () => {
  const { h } = rig();
  const r = await call(h.upload, uploadReq({ headers: { 'x-duration-ms': '2500', 'x-recorded-at': '2026-11-10T10:00:00Z' } }));
  assert.equal(r.status, 201); assert.equal(r.body.duplicate, false); assert.equal(r.body.recording.status, 'RECEIVED');
  assert.equal(r.body.recording.duration_ms, 2500); assert.equal(r.headers.Location, `/api/v1/recordings/${r.body.recording.id}`);
  const text = JSON.stringify(r.body); assert.ok(!text.includes('storage_uri') && !text.includes('sha256') && !text.includes('/var/uploads'));
});
test('upload: duplicate delivery -> 200 duplicate:true with the original id', async () => {
  const { h } = rig();
  const a = await call(h.upload, uploadReq()); const b = await call(h.upload, uploadReq());
  assert.equal(b.status, 200); assert.equal(b.body.duplicate, true); assert.equal(b.body.recording.id, a.body.recording.id);
});
test('upload validation: missing/invalid Idempotency-Key -> 400 with field detail', async () => {
  const { h } = rig();
  for (const key of [undefined, '', 'not-a-uuid']) {
    const r = await call(h.upload, { ...uploadReq(), headers: { 'content-type': 'audio/wav', ...(key === undefined ? {} : { 'idempotency-key': key }) } });
    assert.equal(r.status, 400); assert.equal(r.body.error.code, 'INVALID_IDEMPOTENCY_KEY'); assert.equal(r.body.error.correlation_id, 'corr-12345678');
  }
});
test('upload validation: body problems', async () => {
  const { h } = rig();
  assert.equal((await call(h.upload, uploadReq({ body: {} }))).body.error.code, 'UNSUPPORTED_MEDIA_TYPE');        // express.raw skipped a non-audio body
  assert.equal((await call(h.upload, uploadReq({ body: Buffer.alloc(0) }))).body.error.code, 'EMPTY_BODY');
  const big = await call(h.upload, uploadReq({ body: Buffer.concat([WAV, Buffer.alloc(2000)]) }));
  assert.deepEqual([big.status, big.body.error.code], [413, 'PAYLOAD_TOO_LARGE']);
});
test('upload validation: webm/mp4 are rejected by default (US-05 cannot decode them); content spoofing rejected; params stripped', async () => {
  const { h } = rig();
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  const r1 = await call(h.upload, uploadReq({ headers: { 'content-type': 'audio/webm;codecs=opus' }, body: webm }));
  assert.deepEqual([r1.status, r1.body.error.code], [415, 'UNSUPPORTED_MEDIA_TYPE']); assert.match(r1.body.error.message, /not accepted/);
  const r2 = await call(h.upload, uploadReq({ body: Buffer.from('this is not a wav file at all, honest') }));
  assert.match(r2.body.error.message, /do not match/);
  const r3 = await call(h.upload, uploadReq({ headers: { 'content-type': 'text/plain' } }));
  assert.equal(r3.status, 415);
  assert.equal((await call(h.upload, uploadReq({ headers: { 'content-type': 'audio/wav; codecs=1' } }))).status, 201);
});
test('upload validation: bad optional headers -> 400', async () => {
  const { h } = rig();
  for (const headers of [{ 'x-duration-ms': '-5' }, { 'x-duration-ms': 'abc' }, { 'x-duration-ms': '99999999999' }, { 'x-recorded-at': 'yesterday' }]) {
    assert.equal((await call(h.upload, uploadReq({ headers }))).body.error.code, 'INVALID_HEADER');
  }
});
test('get/process/draft: malformed id -> 400 INVALID_ID; unknown -> 404 envelope', async () => {
  const { h } = rig();
  assert.equal((await call(h.get, { params: { id: '123' } })).body.error.code, 'INVALID_ID');
  const nf = await call(h.get, { params: { id: 'a0000000-0000-4000-8000-000000000009' } });
  assert.deepEqual([nf.status, nf.body.error.code], [404, 'RECORDING_NOT_FOUND']);
});
test('process?wait=true returns the final state with stage timings; calling again is a no-op', async () => {
  const { h, stt } = rig();
  const id = (await call(h.upload, uploadReq())).body.recording.id;
  const r = await call(h.processRecording, { params: { id }, query: { wait: 'true' } });
  assert.equal(r.status, 200); assert.equal(r.body.recording.status, 'EXTRACTED'); assert.ok(r.body.draft.id); assert.ok(r.body.timings_ms.total >= 0);
  assert.equal(r.body.transcription.transcript, 'The pump is vibrating excessively');
  await call(h.processRecording, { params: { id }, query: { wait: 'true' } });
  assert.equal(stt.calls.length, 1);
});
test('process without wait -> 202 Accepted + Location; failure surfaces as 200 with recording.failure on wait=true', async () => {
  const { h, svc, stt } = rig();
  const id = (await call(h.upload, uploadReq())).body.recording.id;
  const acc = await call(h.processRecording, { params: { id } });
  assert.equal(acc.status, 202); await svc.idle(); assert.equal(stt.calls.length, 1);
  const { h: h2, stt: stt2 } = rig(); stt2.next = (r: any) => ({ ...{ transcription_id: r.transcriptionId, recording_id: r.recordingId, attempt_number: 1, status: 'FAILED', transcript: null, detected_language: null, language_probability: null, segments: [], processing_duration_seconds: null, error_code: 'INVALID_AUDIO', error_message: 'bad', model_name: 'tiny', created_at: '' } }) as any;
  const id2 = (await call(h2.upload, uploadReq())).body.recording.id;
  const f = await call(h2.processRecording, { params: { id: id2 }, query: { wait: 'true' } });
  assert.equal(f.status, 200); assert.deepEqual(f.body.recording.failure, { code: 'INVALID_AUDIO', message: 'bad', retryable: false });
});
test('process: invalid wait value -> 400', async () => {
  const { h } = rig();
  const id = (await call(h.upload, uploadReq())).body.recording.id;
  assert.equal((await call(h.processRecording, { params: { id }, query: { wait: 'maybe' } })).body.error.code, 'INVALID_QUERY');
});
test('list: filters and validation', async () => {
  const { h } = rig(); await call(h.upload, uploadReq());
  assert.equal((await call(h.list, { query: {} })).body.count, 1);
  assert.equal((await call(h.list, { query: { status: 'EXTRACTED' } })).body.count, 0);
  for (const query of [{ status: 'BOGUS' }, { limit: '0' }, { limit: '101' }, { offset: '-1' }, { limit: 'x' }]) assert.equal((await call(h.list, { query })).body.error.code, 'INVALID_QUERY');
});
test('error mapping: unknown errors -> 500 generic (no leak); DB connectivity -> 503; correlation id header is honoured', async () => {
  assert.deepEqual([toApiError(new Error('SELECT * FROM x password=abc')).status, toApiError(new Error('SELECT * FROM x password=abc')).message], [500, 'An unexpected error occurred']);
  assert.equal(toApiError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })).code, 'DATABASE_UNAVAILABLE');
  assert.equal(toApiError(Object.assign(new Error('x'), { code: '57P01' })).status, 503);
  assert.equal(toApiError(Object.assign(new Error('x'), { type: 'entity.too.large' })).status, 413);
  const res: any = { h: {}, setHeader(k: string, v: string) { this.h[k] = v; } }; const req: any = { headers: { 'x-correlation-id': 'my-trace-id-001' } };
  correlationMiddleware(req, res, () => {}); assert.equal(res.h['X-Correlation-Id'], 'my-trace-id-001');
  const req2: any = { headers: { 'x-correlation-id': 'bad id with spaces!' } }; correlationMiddleware(req2, res, () => {}); assert.notEqual(req2.correlationId, 'bad id with spaces!');
});
test('a database outage during get is returned as 503 with the safe envelope', async () => {
  const { h, store } = rig(); store.failNext.getRecording = Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:5432'), { code: 'ECONNREFUSED' });
  const r = await call(h.get, { params: { id: 'a0000000-0000-4000-8000-000000000009' } });
  assert.equal(r.status, 503); assert.ok(!JSON.stringify(r.body).includes('10.1.2.3'));
});
test('audio-format helpers', () => {
  assert.equal(normalizeMime('Audio/WebM; codecs=opus'), 'audio/webm'); assert.equal(normalizeMime('text/html'), null); assert.equal(normalizeMime(undefined), null);
  assert.equal(checkAudio('audio/wav', WAV, ALLOWED).ok, true);
  assert.equal((checkAudio('audio/mpeg', Buffer.from([0xff, 0xfb, 0x90, 0]), ALLOWED) as any).ok, true);
  assert.equal((checkAudio('audio/flac', Buffer.from('fLaC....'), ALLOWED) as any).ok, true);
  assert.equal((checkAudio('audio/ogg', Buffer.from('OggS....'), ALLOWED) as any).ok, true);
  void ORG_A;
});
