import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { authenticate, requireRole, signJwtHs256, verifyJwtHs256 } from '../src/middleware/auth';
import { ApiError } from '../src/http/errors';

const SECRET = 's'.repeat(40);
const NOW = 1_800_000_000_000;
const claims = (o: Record<string, unknown> = {}) => ({ sub: 'u1', org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'TECHNICIAN', exp: NOW / 1000 + 600, ...o });
const rejects = (token: string) => assert.throws(() => verifyJwtHs256(token, SECRET, NOW), (e: unknown) => e instanceof ApiError && e.status === 401);
const run = (mw: any, req: any) => new Promise<unknown>((r) => mw(req, {}, (e?: unknown) => r(e)));

test('valid token yields the auth context, org lower-cased', () => {
  const a = verifyJwtHs256(signJwtHs256(claims({ org: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' }), SECRET), SECRET, NOW);
  assert.deepEqual(a, { userId: 'u1', organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'TECHNICIAN' });
});
test('tampered payload / wrong secret / garbage are rejected', () => {
  const good = signJwtHs256(claims(), SECRET);
  const [h, , s] = good.split('.');
  rejects(`${h}.${Buffer.from(JSON.stringify(claims({ role: 'ADMIN' }))).toString('base64url')}.${s}`);
  rejects(signJwtHs256(claims(), 'x'.repeat(40)));
  rejects('abc'); rejects('a.b.c'); rejects('');
});
test('alg "none" and other algorithms are rejected (algorithm is pinned)', () => {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  rejects(`${b({ alg: 'none', typ: 'JWT' })}.${b(claims())}.`);
  const h = b({ alg: 'HS512', typ: 'JWT' }); const p = b(claims());
  rejects(`${h}.${p}.${createHmac('sha512', SECRET).update(`${h}.${p}`).digest('base64url')}`);
});
test('expiry is mandatory and enforced; nbf in the future rejected', () => {
  rejects(signJwtHs256(claims({ exp: NOW / 1000 - 1 }), SECRET));
  const { exp, ...noExp } = claims(); rejects(signJwtHs256(noExp, SECRET));
  rejects(signJwtHs256(claims({ nbf: NOW / 1000 + 100 }), SECRET));
});
test('missing/invalid sub, org, role are rejected', () => {
  rejects(signJwtHs256(claims({ sub: '' }), SECRET));
  rejects(signJwtHs256(claims({ org: 'not-a-uuid' }), SECRET));
  rejects(signJwtHs256(claims({ org: undefined }), SECRET));
  rejects(signJwtHs256(claims({ role: 'ROOT' }), SECRET));
});
test('authenticate: missing / malformed header -> 401 AUTHENTICATION_REQUIRED; good token sets req.auth', async () => {
  const mw = authenticate(SECRET, () => NOW);
  for (const headers of [{}, { authorization: 'Basic abc' }, { authorization: 'Bearer' }, { authorization: 'Bearer a b' }]) {
    const e = (await run(mw, { headers })) as ApiError;
    assert.equal(e.status, 401); assert.equal(e.code, 'AUTHENTICATION_REQUIRED');
  }
  const req: any = { headers: { authorization: `Bearer ${signJwtHs256(claims(), SECRET)}` } };
  assert.equal(await run(mw, req), undefined);
  assert.equal(req.auth.role, 'TECHNICIAN');
  const bad = (await run(mw, { headers: { authorization: 'Bearer aaa.bbb.ccc' } })) as ApiError;
  assert.equal(bad.code, 'INVALID_TOKEN');
});
test('requireRole: 403 for wrong role, 401 without auth, pass otherwise', async () => {
  const mw = requireRole('SUPERVISOR', 'ADMIN');
  assert.equal(((await run(mw, { auth: { role: 'TECHNICIAN' } })) as ApiError).status, 403);
  assert.equal(((await run(mw, {})) as ApiError).status, 401);
  assert.equal(await run(mw, { auth: { role: 'ADMIN' } }), undefined);
});

test('algorithm pin is enforced independently of the signature: header says HS384 but carries a VALID HS256 signature', () => {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b({ alg: 'HS384', typ: 'JWT' }); const p = b(claims());
  rejects(`${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`);
});
