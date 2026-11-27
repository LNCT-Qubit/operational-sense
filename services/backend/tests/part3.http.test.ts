import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config/env';
import { toApiError } from '../src/http/errors';
import { silentLogger } from '../src/http/logger';
import { signJwtHs256 } from '../src/middleware/auth';
import { LocalAudioStorage } from '../src/modules/recordings/audio-storage';
import { CaptureService } from '../src/modules/recordings/recording.service';
import { validateUpsertDraft, validateAttachmentUpload } from '../src/modules/drafts/draft.validation';
import { FakeDrafts, FakeTranscriber, InMemoryStore, ORG_A, ORG_B } from './helpers/fakes';

const SECRET = 'k'.repeat(40);
const TECH_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TECH_ID = '22222222-2222-4222-8222-222222222222';
const token = (o: object = {}) =>
  signJwtHs256({ sub: TECH_ID, org: ORG_A, role: 'TECHNICIAN', exp: Math.floor(Date.now() / 1000) + 600, ...o }, SECRET);

const WEBM_BYTES = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

test('loadConfig default ALLOWED_AUDIO_MIME accepts audio/webm, audio/mp4, and audio/x-m4a', () => {
  const cfg = loadConfig({ DATABASE_URL: 'postgresql://opsense_app:pw@localhost:5432/opsense', JWT_SECRET: SECRET });
  assert.equal(cfg.allowedMimeTypes.has('audio/webm'), true);
  assert.equal(cfg.allowedMimeTypes.has('audio/mp4'), true);
  assert.equal(cfg.allowedMimeTypes.has('audio/x-m4a'), true);
});

test('toApiError maps PostgreSQL SQLSTATE codes cleanly without leaking SQL', () => {
  assert.equal(toApiError(Object.assign(new Error('invalid input syntax for type uuid'), { code: '22P02' })).status, 400);
  assert.equal(toApiError(Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' })).status, 409);
  assert.equal(toApiError(Object.assign(new Error('violates foreign key constraint'), { code: '23503' })).status, 400);
  assert.equal(toApiError(Object.assign(new Error('violates check constraint'), { code: '23514' })).status, 400);
  const rls = toApiError(Object.assign(new Error('new row violates row-level security policy for table "technician_draft"'), { code: '42501' }));
  assert.equal(rls.status, 500);
  assert.equal(rls.message, 'An unexpected error occurred');
});

test('draft.validation normalizes Voice/Text case-insensitively and validates attachment MIME + headers', () => {
  const d1 = validateUpsertDraft({
    clientDraftId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    mode: 'Voice',
    equipment: 'Pump 1',
    createdAt: 1700000000000,
  });
  assert.equal(d1.captureMode, 'voice');
  assert.equal(d1.clientCreatedAt, new Date(1700000000000).toISOString());

  const d2 = validateUpsertDraft({ mode: 'Text' }, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(d2.captureMode, 'text');
  assert.equal(d2.clientDraftId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

  const att = validateAttachmentUpload({
    method: 'POST',
    headers: {
      'idempotency-key': 'att-0',
      'x-file-name': '../pump-photo.jpg',
      'content-type': 'image/jpeg; charset=binary',
    },
    params: {},
    query: {},
    body: Buffer.from([0xff, 0xd8, 0xff]),
  });
  assert.equal(att.fileName, 'pump-photo.jpg');
  assert.equal(att.mediaType, 'photo');
  assert.equal(att.ext, 'jpg');

  assert.throws(
    () =>
      validateAttachmentUpload({
        method: 'POST',
        headers: { 'idempotency-key': 'att-1', 'x-file-name': 'evil.html', 'content-type': 'text/html' },
        params: {},
        query: {},
        body: Buffer.from('<script>'),
      }),
    (e: any) => e.status === 415,
  );
});

test('audio/webm;codecs=opus upload and GET /api/v1/recordings/:id/audio streaming + Range + /health/ready', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'opsense-part3-audio-'));
  let healthy = true;
  const cfg = loadConfig({ DATABASE_URL: 'postgresql://opsense_app:pw@localhost:5432/opsense', JWT_SECRET: SECRET });
  const store = new InMemoryStore();
  const storage = new LocalAudioStorage(dir);
  const svc = new CaptureService(
    store,
    storage,
    new FakeTranscriber(),
    new FakeDrafts(store),
    { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 },
    silentLogger,
  );
  const app = createApp({
    config: cfg,
    service: svc,
    logger: silentLogger,
    ping: async () => {
      if (!healthy) throw new Error('db down');
    },
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
    healthy = false;
    assert.equal((await fetch(`${base}/health/ready`)).status, 503);

    const authHeader = `Bearer ${token()}`;
    const up = await fetch(`${base}/api/v1/recordings`, {
      method: 'POST',
      headers: {
        authorization: authHeader,
        'content-type': 'audio/webm;codecs=opus',
        'idempotency-key': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      body: WEBM_BYTES,
    });
    assert.equal(up.status, 201);
    const upBody: any = await up.json();
    assert.equal(upBody.recording.mime_type, 'audio/webm');
    const recId = upBody.recording.id;

    // Full stream
    const streamRes = await fetch(`${base}/api/v1/recordings/${recId}/audio`, {
      headers: { authorization: authHeader },
    });
    assert.equal(streamRes.status, 200);
    assert.equal(streamRes.headers.get('content-type'), 'audio/webm');
    const bytes = Buffer.from(await streamRes.arrayBuffer());
    assert.deepEqual(bytes, WEBM_BYTES);

    // Partial Range stream
    const rangeRes = await fetch(`${base}/api/v1/recordings/${recId}/audio`, {
      headers: { authorization: authHeader, range: 'bytes=0-3' },
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range'), `bytes 0-3/${WEBM_BYTES.length}`);
    assert.deepEqual(Buffer.from(await rangeRes.arrayBuffer()), WEBM_BYTES.subarray(0, 4));

    // Another technician in same org cannot read it; another org cannot read it
    assert.equal(
      (await fetch(`${base}/api/v1/recordings/${recId}/audio`, {
        headers: { authorization: `Bearer ${token({ sub: OTHER_TECH_ID })}` },
      })).status,
      404,
    );
    assert.equal(
      (await fetch(`${base}/api/v1/recordings/${recId}/audio`, {
        headers: { authorization: `Bearer ${token({ org: ORG_B, role: 'ADMIN' })}` },
      })).status,
      404,
    );
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
