import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { SignupService } from '../src/modules/users/signup.service';
import { validateSignup } from '../src/modules/users/signup.validation';
import { createAuthHandlers } from '../src/modules/users/auth.handlers';
import { PostgresUserStore } from '../src/modules/users/user.repository';
import { errorMiddleware } from '../src/http/errors';
import { silentLogger } from '../src/http/logger';
import { loadConfig } from '../src/config/env';
import { createApp } from '../src/app';
import { CaptureService } from '../src/modules/recordings/recording.service';
import { InMemoryStore, FakeStorage, FakeTranscriber, FakeDrafts } from './helpers/fakes';
import type { NewUser, PublicUser, UserStore } from '../src/modules/users/user.types';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const good = (o: Record<string, unknown> = {}) => ({ name: 'Alex Morgan', email: 'Alex@Company.com', password: 'Passw0rdOK', role: 'technician', ...o });

/** In-memory UserStore: global unique email like the real unique index. */
class MemStore implements UserStore {
  rows: (NewUser & { id: string; org: string })[] = [];
  orgName: string | null = null; orgExists = true; fail: unknown = null;
  async resolveSignupOrgId(name: string) { this.orgName = name; return this.orgExists ? ORG : null; }
  async createUser(org: string, u: NewUser) {
    if (this.fail) throw this.fail;
    if (this.rows.some((r) => r.email === u.email)) return { created: false as const };
    const id = `u${this.rows.length + 1}`; this.rows.push({ ...u, id, org });
    return { created: true as const, user: { id, name: u.name, email: u.email, role: u.role, created_at: new Date().toISOString() } as PublicUser };
  }
}
const fakeHasher = { hash: async (p: string) => `$2b$12$fakehash${Buffer.from(p).toString('base64')}` };
const rig = () => { const store = new MemStore(); return { store, svc: new SignupService(store, fakeHasher, { organizationName: 'Demo Org' }, silentLogger) }; };
const details = (e: any) => (e.details as { field: string }[]).map((d) => d.field).sort();

test('validation: missing fields -> every missing field reported', () => {
  assert.throws(() => validateSignup({}), (e: any) => e.status === 400 && e.code === 'VALIDATION_ERROR' && details(e).join() === 'email,name,password,role');
  assert.throws(() => validateSignup(undefined), (e: any) => e.status === 400);
  assert.throws(() => validateSignup('nope'), (e: any) => e.status === 400);
  assert.throws(() => validateSignup(good({ name: '   ' })), (e: any) => details(e).join() === 'name');
});
test('validation: invalid emails rejected, valid email normalised', () => {
  for (const email of ['abc', 'a@b', '@x.com', 'a b@x.com', 'a@@x.com', `${'a'.repeat(250)}@x.com`, 123]) {
    assert.throws(() => validateSignup(good({ email })), (e: any) => details(e).join() === 'email', String(email));
  }
  assert.equal(validateSignup(good({ email: '  Alex@Company.COM ' })).email, 'alex@company.com');
});
test('validation: password policy', () => {
  for (const password of ['short1', 'allletters', '12345678', 'a1'.repeat(40)]) {
    assert.throws(() => validateSignup(good({ password })), (e: any) => details(e).join() === 'password', password.slice(0, 12));
  }
  assert.equal(validateSignup(good({ password: ' spaced pw1 ' })).password, ' spaced pw1 ');   // password is never trimmed
});
test('validation: only technician/supervisor roles; admin & others rejected', () => {
  assert.equal(validateSignup(good({ role: 'supervisor' })).role, 'SUPERVISOR');
  assert.equal(validateSignup(good({ role: 'Technician' })).role, 'TECHNICIAN');
  for (const role of ['admin', 'ADMIN', 'reliability_engineer', 'RELIABILITY_ENGINEER', 'root', '', 5, '__proto__', 'constructor'])
    assert.throws(() => validateSignup(good({ role })), (e: any) => details(e).join() === 'role', String(role));
});
test('service: technician and supervisor signups succeed; hash stored, never plain text; org from server', async () => {
  const { store, svc } = rig();
  const t = await svc.signup(good());
  const s = await svc.signup(good({ email: 'sup@company.com', role: 'supervisor', name: 'Sam Lee' }));
  assert.equal(t.role, 'TECHNICIAN'); assert.equal(s.role, 'SUPERVISOR'); assert.equal(t.email, 'alex@company.com');
  assert.equal(store.orgName, 'Demo Org');
  assert.ok(store.rows.every((r) => r.org === ORG && r.passwordHash.startsWith('$2b$') && r.passwordHash !== 'Passw0rdOK'));
  assert.ok(!JSON.stringify(t).match(/pass|hash/i), 'response must not contain password or hash');
});
test('service: a client-supplied organization / role escalation fields are ignored', async () => {
  const { store, svc } = rig();
  await svc.signup(good({ organization_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organizationId: 'x', is_admin: true }));
  assert.equal(store.rows[0].org, ORG); assert.equal(store.rows[0].role, 'TECHNICIAN');
});
test('service: duplicate email (any case) -> 409 EMAIL_ALREADY_REGISTERED', async () => {
  const { svc } = rig(); await svc.signup(good());
  await assert.rejects(svc.signup(good({ email: 'ALEX@company.com' })), (e: any) => e.status === 409 && e.code === 'EMAIL_ALREADY_REGISTERED');
});
test('service: missing organization -> 503 without internal detail; DB outage propagates as DB error', async () => {
  const { store, svc } = rig(); store.orgExists = false;
  await assert.rejects(svc.signup(good()), (e: any) => e.status === 503 && e.code === 'SIGNUP_UNAVAILABLE' && !/Demo|migration/i.test(e.message));
  store.orgExists = true; store.fail = Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
  await assert.rejects(svc.signup(good()), (e: any) => e.code === 'ECONNREFUSED');
});

/** Drives the handler like Express would, through the real error middleware. */
async function call(svc: SignupService, body: unknown) {
  const out: any = { status: 200, body: undefined };
  const res: any = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; return res; }, setHeader() { return res; } };
  const req: any = { method: 'POST', headers: {}, params: {}, query: {}, body, correlationId: 'corr-12345678' };
  await new Promise<void>((resolve) => {
    createAuthHandlers(svc).signup(req, res, (err?: unknown) => { errorMiddleware(silentLogger)(err, req, res, () => {}); resolve(); });
    const t = setInterval(() => { if (out.body !== undefined) { clearInterval(t); resolve(); } }, 1);
  });
  return out;
}
test('handler: 201 success shape; 400 with details; 409; 503 on DB outage; 500 hides internals', async () => {
  const { store, svc } = rig();
  const ok = await call(svc, good()); assert.equal(ok.status, 201); assert.equal(ok.body.user.email, 'alex@company.com');
  const bad = await call(svc, good({ email: 'nope' })); assert.equal(bad.status, 400); assert.equal(bad.body.error.details[0].field, 'email'); assert.equal(bad.body.error.correlation_id, 'corr-12345678');
  assert.equal((await call(svc, good())).status, 409);
  store.fail = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' });
  const down = await call(svc, good({ email: 'b@company.com' })); assert.equal(down.status, 503); assert.ok(!JSON.stringify(down.body).includes('10.0.0.5'));
  store.fail = new Error('relation "app_user" does not exist');
  const boom = await call(svc, good({ email: 'c@company.com' })); assert.equal(boom.status, 500); assert.ok(!JSON.stringify(boom.body).includes('app_user'));
});

test('repository SQL: tenant context set first, all values are bind parameters, no SQL text from user input', async () => {
  const log: { sql: string; values?: unknown[] }[] = [];
  const client = { release() {}, async query(sql: string, values?: unknown[]) { log.push({ sql, values }); return { rows: /INSERT/.test(sql) ? [{ user_id: 'id1', full_name: 'E', email: "e'; DROP TABLE app_user;--@x.com", role: 'TECHNICIAN', created_at: new Date() }] : [], rowCount: 0 }; } };
  const pool = { connect: async () => client, query: async () => ({ rows: [{ organization_id: ORG }] }) };
  const store = new PostgresUserStore(pool as any);
  const evil = "e'; DROP TABLE app_user;--@x.com";
  const r = await store.createUser(ORG, { name: "Robert'); --", email: evil, passwordHash: '$2b$12$h', role: 'SUPERVISOR' });
  assert.equal(r.created, true);
  assert.match(log[0].sql, /BEGIN/); assert.match(log[1].sql, /set_config\('app\.current_org_id'/); assert.deepEqual(log[1].values, [ORG]);
  assert.ok(log.every((q) => !q.sql.includes('DROP') && !q.sql.includes('Robert')), 'user input must never appear in SQL text');
  assert.deepEqual(log.find((q) => /INSERT/.test(q.sql))!.values, [ORG, "Robert'); --", evil, '$2b$12$h', 'SUPERVISOR']);
  assert.match(log[log.length - 1].sql, /COMMIT/);
  assert.equal(await store.resolveSignupOrgId('Demo Org'), ORG);
});

test('config: signup defaults and validation', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'k'.repeat(40) };
  const c = loadConfig(base); assert.deepEqual(c.signup, { organizationName: 'Demo Org', bcryptRounds: 12, corsAllowedOrigins: [] });
  assert.deepEqual(loadConfig({ ...base, CORS_ALLOWED_ORIGINS: 'http://localhost:5173, https://app.example.com' }).signup.corsAllowedOrigins, ['http://localhost:5173', 'https://app.example.com']);
  assert.throws(() => loadConfig({ ...base, CORS_ALLOWED_ORIGINS: '*' }), /CORS_ALLOWED_ORIGINS/);
  assert.throws(() => loadConfig({ ...base, BCRYPT_ROUNDS: '4' }), /BCRYPT_ROUNDS/);
});

test('express over real HTTP: public route, JSON errors, CORS allow-list, existing routes still protected', async () => {
  const mem = new InMemoryStore();
  const capture = new CaptureService(mem, new FakeStorage(), new FakeTranscriber(), new FakeDrafts(mem), { autoProcess: false, staleClaimSeconds: 600, maxTranscriptionAttempts: 3 }, silentLogger);
  const { svc } = rig();
  const app = createApp({ config: { jwtSecret: 'k'.repeat(40), maxUploadBytes: 5000, allowedMimeTypes: new Set(['audio/wav']) }, service: capture, logger: silentLogger, signup: { service: svc, corsAllowedOrigins: ['http://localhost:5173'] }, ping: async () => {} });
  const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string, headers: Record<string, string> = {}) => fetch(`${base}/api/v1/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  try {
    const ok = await post(JSON.stringify(good())); assert.equal(ok.status, 201);
    const okBody: any = await ok.json(); assert.equal(okBody.user.role, 'TECHNICIAN'); assert.ok(!JSON.stringify(okBody).match(/hash|Passw0rd/));
    assert.equal((await post(JSON.stringify(good()))).status, 409);
    assert.equal((await post(JSON.stringify(good({ email: 'x' })))).status, 400);
    const badJson = await post('{not json'); assert.equal(badJson.status, 400); assert.equal(((await badJson.json()) as any).error.code, 'INVALID_JSON');
    assert.equal((await post(JSON.stringify(good({ email: 'z@c.com', role: 'admin' })))).status, 400);
    assert.equal((await fetch(`${base}/api/v1/auth/signup`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 400);
    const big = await post(JSON.stringify(good({ name: 'x'.repeat(20000) }))); assert.equal(big.status, 413);
    const pre = await fetch(`${base}/api/v1/auth/signup`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const evil = await post(JSON.stringify(good({ email: 'q@c.com' })), { origin: 'http://evil.example' }); assert.equal(evil.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(`${base}/api/v1/recordings`)).status, 401);   // existing auth still enforced
    assert.equal((await fetch(`${base}/health`)).status, 200);
  } finally { server.close(); }
});
