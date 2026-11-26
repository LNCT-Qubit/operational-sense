/**
 * GATED: runs only when `express` is installed (npm install). Boots the real Express app with in-memory
 * dependencies and exercises routing, auth ordering, express.raw body handling and status codes over real HTTP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { signJwtHs256 } from '../../src/middleware/auth';
import { CaptureService } from '../../src/modules/recordings/recording.service';
import { silentLogger } from '../../src/http/logger';
import { InMemoryStore, FakeStorage, FakeTranscriber, FakeDrafts, ORG_A, WAV } from '../helpers/fakes';

let hasExpress = true; try { require.resolve('express'); } catch { hasExpress = false; }
const SECRET = 'k'.repeat(40);
const token = (o: object = {}) => signJwtHs256({ sub: 'tech-1', org: ORG_A, role: 'TECHNICIAN', exp: Math.floor(Date.now() / 1000) + 600, ...o }, SECRET);
const KEY = 'c0000000-0000-4000-8000-000000000001';

test('express: auth before body, upload, process, get, errors over real HTTP', { skip: !hasExpress && 'express is not installed in this environment' }, async () => {
  const { createApp } = await import('../../src/app.js');
  const store = new InMemoryStore();
  const svc = new CaptureService(store, new FakeStorage(), new FakeTranscriber(), new FakeDrafts(store), { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 }, silentLogger);
  const app = createApp({ config: { jwtSecret: SECRET, maxUploadBytes: 5000, allowedMimeTypes: new Set(['audio/wav']) }, service: svc, logger: silentLogger, ping: async () => {} });
  const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/v1/recordings`)).status, 401);
    const noAuthUpload = await fetch(`${base}/api/v1/recordings`, { method: 'POST', headers: { 'content-type': 'audio/wav', 'idempotency-key': KEY }, body: WAV });
    assert.equal(noAuthUpload.status, 401);
    const H = { authorization: `Bearer ${token()}`, 'content-type': 'audio/wav', 'idempotency-key': KEY };
    const up = await fetch(`${base}/api/v1/recordings`, { method: 'POST', headers: H, body: WAV });
    assert.equal(up.status, 201); const id = (await up.json() as any).recording.id;
    assert.equal((await fetch(`${base}/api/v1/recordings`, { method: 'POST', headers: H, body: WAV })).status, 200);
    const big = await fetch(`${base}/api/v1/recordings`, { method: 'POST', headers: { ...H, 'idempotency-key': 'c0000000-0000-4000-8000-000000000002' }, body: Buffer.alloc(6000) });
    assert.equal(big.status, 413); assert.equal((await big.json() as any).error.code, 'PAYLOAD_TOO_LARGE');
    const json = await fetch(`${base}/api/v1/recordings`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(json.status, 415);
    const done = await fetch(`${base}/api/v1/recordings/${id}/process?wait=true`, { method: 'POST', headers: { authorization: H.authorization } });
    assert.equal(((await done.json()) as any).recording.status, 'EXTRACTED');
    assert.equal((await fetch(`${base}/api/v1/recordings/${id}/draft`, { headers: { authorization: H.authorization } })).status, 200);
    const other = signJwtHs256({ sub: 'x', org: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 600 }, SECRET);
    assert.equal((await fetch(`${base}/api/v1/recordings/${id}`, { headers: { authorization: `Bearer ${other}` } })).status, 404);
    assert.equal((await fetch(`${base}/api/v1/nope`, { headers: { authorization: H.authorization } })).status, 404);
  } finally { server.close(); }
});
