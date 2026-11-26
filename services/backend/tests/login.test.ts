import test from 'node:test';
import assert from 'node:assert/strict';
import { LoginService } from '../src/modules/users/login.service';
import { validateLogin } from '../src/modules/users/login.validation';
import { createAuthHandlers } from '../src/modules/users/auth.handlers';
import { PostgresUserStore } from '../src/modules/users/user.repository';
import { authenticate, requireRole, verifyJwtHs256 } from '../src/middleware/auth';
import { errorMiddleware } from '../src/http/errors';
import { silentLogger } from '../src/http/logger';
import { loadConfig } from '../src/config/env';
import type { LoginRecord, LoginStore, PasswordHasher } from '../src/modules/users/user.types';

const SECRET = 'k'.repeat(40);
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = 1_800_000_000_000;                       // fixed clock (ms) so exp is predictable
const PASSWORD = 'Passw0rdOK';

/** Fake hasher: "hash" is reversible on purpose so tests are fast and need no bcryptjs. Counts compare() calls. */
class FakeHasher implements PasswordHasher {
  compares = 0;
  async hash(p: string) { return `$2b$12$fake${Buffer.from(p).toString('base64')}`; }
  async compare(p: string, h: string) { this.compares++; return h === (await this.hash(p)); }
}

/** In-memory LoginStore keyed by normalised email, like the real global unique email. */
class MemLoginStore implements LoginStore {
  rows = new Map<string, LoginRecord>(); lookedUp: string[] = []; fail: unknown = null;
  async findLoginRecord(email: string) {
    if (this.fail) throw this.fail;
    this.lookedUp.push(email);
    return this.rows.get(email) ?? null;
  }
}

async function rig(over: Partial<LoginRecord> = {}) {
  const store = new MemLoginStore(); const hasher = new FakeHasher();
  store.rows.set('alex@company.com', {
    id: USER_ID, organizationId: ORG, name: 'Alex Morgan', email: 'alex@company.com', role: 'SUPERVISOR',
    passwordHash: await hasher.hash(PASSWORD), isActive: true, ...over,
  });
  const svc = new LoginService(store, hasher, { jwtSecret: SECRET, tokenTtlSeconds: 3600 }, silentLogger, () => NOW);
  return { store, hasher, svc };
}
const details = (e: any) => (e.details as { field: string }[]).map((d) => d.field).sort();

// ---------- validation ----------
test('validation: missing email / missing password / both -> 400 with the field named', () => {
  assert.throws(() => validateLogin({ password: PASSWORD }), (e: any) => e.status === 400 && e.code === 'VALIDATION_ERROR' && details(e).join() === 'email');
  assert.throws(() => validateLogin({ email: 'a@b.co' }), (e: any) => e.status === 400 && details(e).join() === 'password');
  assert.throws(() => validateLogin({}), (e: any) => details(e).join() === 'email,password');
  for (const bad of [undefined, null, 'nope', [], 42]) assert.throws(() => validateLogin(bad), (e: any) => e.status === 400);
  assert.throws(() => validateLogin({ email: '   ', password: PASSWORD }), (e: any) => details(e).join() === 'email');
  assert.throws(() => validateLogin({ email: 'a@b.co', password: '' }), (e: any) => details(e).join() === 'password');
});
test('validation: malformed emails and non-text values rejected', () => {
  for (const email of ['abc', 'a@b', '@x.com', 'a b@x.com', 'a@@x.com', `${'a'.repeat(250)}@x.com`, 123, {}, ['a@b.com']])
    assert.throws(() => validateLogin({ email, password: PASSWORD }), (e: any) => e.status === 400 && details(e).join() === 'email', String(email));
  assert.throws(() => validateLogin({ email: 'a@b.co', password: 12345678 }), (e: any) => details(e).join() === 'password');
  assert.throws(() => validateLogin({ email: 'a@b.co', password: 'x'.repeat(73) }), (e: any) => details(e).join() === 'password');
});
test('validation: email is trimmed + lower-cased, password is NEVER changed, extra fields ignored', () => {
  const v = validateLogin({ email: '  Alex@Company.COM ', password: '  Spaced Pw1  ', role: 'ADMIN', organization_id: 'x' });
  assert.deepEqual(v, { email: 'alex@company.com', password: '  Spaced Pw1  ' });
});

// ---------- service ----------
test('service: correct credentials -> token + public user (no hash, no password)', async () => {
  const { svc } = await rig();
  const r = await svc.login({ email: 'alex@company.com', password: PASSWORD });
  assert.equal(r.tokenType, 'Bearer'); assert.equal(r.expiresIn, 3600);
  assert.deepEqual(r.user, { id: USER_ID, name: 'Alex Morgan', email: 'alex@company.com', role: 'SUPERVISOR' });
  const text = JSON.stringify(r);
  assert.ok(!/hash|\$2b\$|Passw0rdOK|password/i.test(text), 'result must not contain a hash or the password');
});
test('service: wrong password -> generic 401', async () => {
  const { svc } = await rig();
  await assert.rejects(svc.login({ email: 'alex@company.com', password: 'Wrong1234' }), (e: any) => e.status === 401 && e.code === 'INVALID_CREDENTIALS');
});
test('service: unregistered email -> the SAME generic 401', async () => {
  const { svc } = await rig();
  await assert.rejects(svc.login({ email: 'nobody@company.com', password: PASSWORD }), (e: any) => e.status === 401 && e.code === 'INVALID_CREDENTIALS');
});
test('service: inactive account -> the SAME generic 401, even with the right password', async () => {
  const { svc } = await rig({ isActive: false });
  await assert.rejects(svc.login({ email: 'alex@company.com', password: PASSWORD }), (e: any) => e.status === 401 && e.code === 'INVALID_CREDENTIALS');
});
test('service: the three failure kinds are indistinguishable (same status, code and message)', async () => {
  const fails: any[] = [];
  for (const [over, email, pw] of [[{}, 'alex@company.com', 'Wrong1234'], [{}, 'nobody@company.com', PASSWORD], [{ isActive: false }, 'alex@company.com', PASSWORD]] as const) {
    const { svc } = await rig(over);
    try { await svc.login({ email, password: pw }); assert.fail('should reject'); } catch (e: any) { fails.push({ status: e.status, code: e.code, message: e.message, details: e.details }); }
  }
  assert.deepEqual(fails[1], fails[0]); assert.deepEqual(fails[2], fails[0]);
});
test('service: bcrypt compare runs even for an unknown email (timing parity)', async () => {
  const { svc, hasher } = await rig();
  const before = hasher.compares;
  await assert.rejects(svc.login({ email: 'nobody@company.com', password: PASSWORD }));
  assert.equal(hasher.compares - before, 1);
});
test('service: email is normalised before the lookup; password is not trimmed', async () => {
  const { svc, store, hasher } = await rig();
  await svc.login({ email: '  ALEX@Company.com  ', password: PASSWORD });
  assert.deepEqual(store.lookedUp, ['alex@company.com']);
  store.rows.get('alex@company.com')!.passwordHash = await hasher.hash(' pad pw1 ');
  await svc.login({ email: 'alex@company.com', password: ' pad pw1 ' });                       // exact string with spaces works
  await assert.rejects(svc.login({ email: 'alex@company.com', password: 'pad pw1' }));         // trimmed version does not
});
test('service: JWT is valid HS256, exp = now + ttl, and carries the REAL database sub/org/role', async () => {
  const { svc } = await rig({ role: 'TECHNICIAN' });
  const { accessToken } = await svc.login({ email: 'alex@company.com', password: PASSWORD });
  const ctx = verifyJwtHs256(accessToken, SECRET, NOW + 1000);                                   // the EXISTING verifier
  assert.deepEqual(ctx, { userId: USER_ID, organizationId: ORG, role: 'TECHNICIAN' });
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
  assert.equal(claims.exp, NOW / 1000 + 3600); assert.equal(claims.iat, NOW / 1000);
  assert.deepEqual(Object.keys(claims).sort(), ['exp', 'iat', 'org', 'role', 'sub']);           // nothing extra (no email, no hash)
  assert.throws(() => verifyJwtHs256(accessToken, SECRET, NOW + 3601 * 1000));                   // expires
  assert.throws(() => verifyJwtHs256(accessToken, 'z'.repeat(40), NOW + 1000));                  // wrong secret
});
test('service: role / organization / user id supplied in the request body are ignored', async () => {
  const { svc } = await rig({ role: 'TECHNICIAN' });
  const r = await svc.login({ email: 'alex@company.com', password: PASSWORD, role: 'ADMIN', org: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', organization_id: 'x', sub: 'evil' });
  assert.equal(r.user.role, 'TECHNICIAN');
  assert.deepEqual(verifyJwtHs256(r.accessToken, SECRET, NOW + 1000), { userId: USER_ID, organizationId: ORG, role: 'TECHNICIAN' });
});
test('service: the token works with the existing authenticate() + requireRole() middleware', async () => {
  const { svc } = await rig({ role: 'SUPERVISOR' });
  const { accessToken } = await svc.login({ email: 'alex@company.com', password: PASSWORD });
  const req: any = { headers: { authorization: `Bearer ${accessToken}` } };
  let err: unknown = 'not called';
  authenticate(SECRET, () => NOW + 1000)(req, {} as any, (e?: unknown) => { err = e; });
  assert.equal(err, undefined); assert.deepEqual(req.auth, { userId: USER_ID, organizationId: ORG, role: 'SUPERVISOR' });
  requireRole('SUPERVISOR')(req, {} as any, (e?: unknown) => { err = e; }); assert.equal(err, undefined);
  requireRole('ADMIN')(req, {} as any, (e?: unknown) => { err = e; }); assert.equal((err as any).status, 403);
});

// ---------- handler (through the real error middleware) ----------
async function call(svc: LoginService, body: unknown) {
  const out: any = { status: 200, body: undefined, headers: {} as Record<string, string> };
  const res: any = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; return res; }, setHeader(k: string, v: string) { out.headers[k] = v; return res; } };
  const req: any = { method: 'POST', headers: {}, params: {}, query: {}, body, correlationId: 'corr-12345678' };
  await new Promise<void>((resolve) => {
    createAuthHandlers({} as any, svc).login!(req, res, (err?: unknown) => { errorMiddleware(silentLogger)(err, req, res, () => {}); resolve(); });
    const t = setInterval(() => { if (out.body !== undefined) { clearInterval(t); resolve(); } }, 1);
  });
  return out;
}
test('handler: 200 success shape, never caches; password hash never appears in the response', async () => {
  const { svc } = await rig();
  const ok = await call(svc, { email: 'Alex@Company.com', password: PASSWORD });
  assert.equal(ok.status, 200); assert.equal(ok.body.message, 'Login successful.');
  assert.equal(ok.body.token_type, 'Bearer'); assert.equal(ok.body.expires_in, 3600);
  assert.equal(typeof ok.body.access_token, 'string'); assert.equal(ok.headers['Cache-Control'], 'no-store');
  assert.deepEqual(ok.body.user, { id: USER_ID, name: 'Alex Morgan', email: 'alex@company.com', role: 'SUPERVISOR' });
  assert.ok(!/hash|\$2b\$|Passw0rdOK/i.test(JSON.stringify({ ...ok.body, access_token: '' })));
});
test('handler: 400 validation, 401 generic (with correlation id), identical body for every auth failure', async () => {
  const { svc } = await rig();
  const bad = await call(svc, { email: 'nope', password: PASSWORD }); assert.equal(bad.status, 400); assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  const a = await call(svc, { email: 'alex@company.com', password: 'Wrong1234' });
  const b = await call(svc, { email: 'ghost@company.com', password: PASSWORD });
  assert.equal(a.status, 401); assert.equal(a.body.error.code, 'INVALID_CREDENTIALS'); assert.equal(a.body.error.correlation_id, 'corr-12345678');
  assert.deepEqual(b.body, a.body);
});
test('handler: database errors are handled safely (503 outage / 500 unknown) and leak nothing', async () => {
  const { svc, store } = await rig();
  store.fail = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' });
  const down = await call(svc, { email: 'alex@company.com', password: PASSWORD });
  assert.equal(down.status, 503); assert.equal(down.body.error.code, 'DATABASE_UNAVAILABLE'); assert.ok(!JSON.stringify(down.body).includes('10.0.0.5'));
  store.fail = new Error('function login_org_id(unknown) does not exist');
  const boom = await call(svc, { email: 'alex@company.com', password: PASSWORD });
  assert.equal(boom.status, 500); assert.ok(!JSON.stringify(boom.body).match(/login_org_id|function|app_user/));
});
test('handler: not created when no LoginService is wired (route stays unmounted)', () => {
  assert.equal(createAuthHandlers({} as any).login, undefined);
});

// ---------- repository SQL ----------
test('repository SQL: org lookup first, then tenant context set, then SELECT; all values are bind parameters', async () => {
  const log: { sql: string; values?: unknown[] }[] = [];
  const row = { user_id: USER_ID, organization_id: ORG.toUpperCase(), full_name: 'A', email: 'a@x.com', password_hash: '$2b$12$h', role: 'TECHNICIAN', is_active: true };
  const client = { release() {}, async query(sql: string, values?: unknown[]) { log.push({ sql, values }); return { rows: /FROM app_user/.test(sql) ? [row] : [], rowCount: 0 }; } };
  const pool = { connect: async () => client, query: async (sql: string, values?: unknown[]) => { log.unshift({ sql, values }); return { rows: [{ organization_id: ORG }] }; } };
  const evil = "e'; DROP TABLE app_user;--@x.com";
  const rec = await new PostgresUserStore(pool as any).findLoginRecord(evil);
  assert.match(log[0].sql, /login_org_id\(\$1\)/); assert.deepEqual(log[0].values, [evil]);          // 1) function, outside the tenant transaction
  assert.match(log[1].sql, /BEGIN/); assert.match(log[2].sql, /set_config\('app\.current_org_id'/); assert.deepEqual(log[2].values, [ORG]);
  const sel = log.find((q) => /FROM app_user/.test(q.sql))!; assert.deepEqual(sel.values, [evil]);
  assert.ok(log.every((q) => !q.sql.includes('DROP')), 'user input must never appear in SQL text');
  assert.match(log[log.length - 1].sql, /COMMIT/);
  assert.deepEqual(rec, { id: USER_ID, organizationId: ORG, name: 'A', email: 'a@x.com', role: 'TECHNICIAN', passwordHash: '$2b$12$h', isActive: true });
});
test('repository SQL: unknown email (function returns NULL) -> null and no tenant transaction is opened', async () => {
  let connected = false;
  const pool = { connect: async () => { connected = true; throw new Error('must not connect'); }, query: async () => ({ rows: [{ organization_id: null }] }) };
  assert.equal(await new PostgresUserStore(pool as any).findLoginRecord('nobody@x.com'), null); assert.equal(connected, false);
});
test('repository SQL: org found but RLS returns no row -> null', async () => {
  const client = { release() {}, async query() { return { rows: [], rowCount: 0 }; } };
  const pool = { connect: async () => client, query: async () => ({ rows: [{ organization_id: ORG }] }) };
  assert.equal(await new PostgresUserStore(pool as any).findLoginRecord('a@x.com'), null);
});

// ---------- config ----------
test('config: token lifetime default 8 h, override and range validation', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'k'.repeat(40) };
  assert.equal(loadConfig(base).login.tokenTtlSeconds, 28800);
  assert.equal(loadConfig({ ...base, JWT_EXPIRES_IN_SECONDS: '900' }).login.tokenTtlSeconds, 900);
  for (const v of ['10', 'abc', '99999999']) assert.throws(() => loadConfig({ ...base, JWT_EXPIRES_IN_SECONDS: v }), /JWT_EXPIRES_IN_SECONDS/);
});
