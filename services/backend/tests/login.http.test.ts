/**
 * Login over REAL HTTP through the real Express app (needs `express` installed: run `npm install` first).
 * Uses in-memory fakes for storage, so no PostgreSQL is needed. Proves the route is wired, the JSON/CORS rules
 * apply, and that a token from /auth/login really opens the existing protected API.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { LoginService } from '../src/modules/users/login.service';
import { SignupService } from '../src/modules/users/signup.service';
import { CaptureService } from '../src/modules/recordings/recording.service';
import { silentLogger } from '../src/http/logger';
import { InMemoryStore, FakeStorage, FakeTranscriber, FakeDrafts } from './helpers/fakes';
import type { LoginRecord, LoginStore, PasswordHasher } from '../src/modules/users/user.types';

const SECRET = 'k'.repeat(40);
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const hasher: PasswordHasher = {
  hash: async (p) => `$2b$12$fake${Buffer.from(p).toString('base64')}`,
  compare: async (p, h) => h === `$2b$12$fake${Buffer.from(p).toString('base64')}`,
};
const store: LoginStore = {
  async findLoginRecord(email) {
    if (email !== 'tech@company.com') return null;
    return { id: USER_ID, organizationId: ORG, name: 'Tia Tech', email, role: 'TECHNICIAN', passwordHash: await hasher.hash('Passw0rdOK'), isActive: true } as LoginRecord;
  },
};

test('express over real HTTP: login works, fails generically, and the token opens the protected API', async () => {
  const mem = new InMemoryStore();
  const capture = new CaptureService(mem, new FakeStorage(), new FakeTranscriber(), new FakeDrafts(mem), { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 }, silentLogger);
  const loginService = new LoginService(store, hasher, { jwtSecret: SECRET, tokenTtlSeconds: 600 }, silentLogger);
  const app = createApp({
    config: { jwtSecret: SECRET, maxUploadBytes: 5000, allowedMimeTypes: new Set(['audio/wav']) },
    service: capture, logger: silentLogger, ping: async () => {},
    signup: { service: {} as unknown as SignupService, loginService, corsAllowedOrigins: ['http://localhost:5173'] },
  });
  const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string, headers: Record<string, string> = {}) => fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  try {
    const ok = await post(JSON.stringify({ email: ' TECH@Company.com ', password: 'Passw0rdOK', role: 'ADMIN' }));
    assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
    const body: any = await ok.json();
    assert.equal(body.user.role, 'TECHNICIAN'); assert.equal(body.token_type, 'Bearer'); assert.ok(!JSON.stringify(body).match(/hash|\$2b\$/));

    // token from login is accepted by the EXISTING authenticate() middleware on a protected route
    assert.equal((await fetch(`${base}/api/v1/recordings`, { headers: { authorization: `Bearer ${body.access_token}` } })).status, 200);
    assert.equal((await fetch(`${base}/api/v1/recordings`)).status, 401);

    const wrong = await post(JSON.stringify({ email: 'tech@company.com', password: 'Nope12345' }));
    const ghost = await post(JSON.stringify({ email: 'ghost@company.com', password: 'Passw0rdOK' }));
    assert.equal(wrong.status, 401); assert.equal(ghost.status, 401);
    const wb: any = await wrong.json(), gb: any = await ghost.json();
    assert.equal(wb.error.code, 'INVALID_CREDENTIALS'); assert.equal(wb.error.message, gb.error.message);

    assert.equal((await post(JSON.stringify({ email: 'x' }))).status, 400);
    const badJson = await post('{not json'); assert.equal(badJson.status, 400); assert.equal(((await badJson.json()) as any).error.code, 'INVALID_JSON');
    assert.equal((await post(JSON.stringify({ email: 'tech@company.com', password: 'x'.repeat(20000) }))).status, 413);
    const evil = await post(JSON.stringify({ email: 'tech@company.com', password: 'Passw0rdOK' }), { origin: 'http://evil.example' });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
  } finally { server.close(); }
});
