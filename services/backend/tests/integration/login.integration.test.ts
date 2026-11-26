/**
 * GATED: runs only when US07_PG_URL (connects as opsense_app) and US07_PG_ADMIN_URL (superuser; used only to create a
 * second organization / flip is_active / clean up the rows THIS test created) are set, `pg` + `bcryptjs` are
 * installed, and migrations 001-011 are applied.
 * Exercises the REAL migration 011 (login_org_id), RLS, real bcrypt, and the real JWT verifier.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresUserStore } from '../../src/modules/users/user.repository';
import { createBcryptHasher } from '../../src/modules/users/password-hasher';
import { SignupService } from '../../src/modules/users/signup.service';
import { LoginService } from '../../src/modules/users/login.service';
import { verifyJwtHs256 } from '../../src/middleware/auth';
import { withTenant } from '../../src/database/tenant';
import { silentLogger } from '../../src/http/logger';

const URL = process.env.US07_PG_URL, ADMIN = process.env.US07_PG_ADMIN_URL;
let pg: any = null, bcrypt: any = null;
try { pg = require('pg'); bcrypt = require('bcryptjs'); } catch { /* not installed */ }
const skip = !(URL && ADMIN && pg && bcrypt) && 'set US07_PG_URL + US07_PG_ADMIN_URL and install pg + bcryptjs to run against a live database';

const SECRET = 'k'.repeat(40); const PASSWORD = 'Passw0rdOK';
let pool: any, admin: any; const emails: string[] = []; let otherOrgId: string | null = null;
after(async () => {
  // remove only the rows this test created
  if (admin && emails.length) await admin.query('DELETE FROM app_user WHERE email = ANY($1)', [emails]);
  if (admin && otherOrgId) await admin.query('DELETE FROM organization WHERE organization_id = $1', [otherOrgId]);
  await pool?.end(); await admin?.end();
});

test('live DB: login with real bcrypt, inactive rejection, tenant isolation, JWT accepted by the existing verifier', { skip }, async () => {
  pool = new pg.Pool({ connectionString: URL }); admin = new pg.Pool({ connectionString: ADMIN });
  const store = new PostgresUserStore(pool);
  const hasher = createBcryptHasher(10);
  const signup = new SignupService(store, hasher, { organizationName: 'Demo Org' }, silentLogger);
  const login = new LoginService(store, hasher, { jwtSecret: SECRET, tokenTtlSeconds: 600 }, silentLogger);

  // --- user in Demo Org (created through the real signup) ---
  const emailA = `it-login-${randomUUID()}@example.com`; emails.push(emailA);
  const created = await signup.signup({ name: 'Login IT A', email: emailA, password: PASSWORD, role: 'supervisor' });
  const demoOrg = await store.resolveSignupOrgId('Demo Org');

  // 1) correct password: caller supplies ONLY email + password (no organization id anywhere)
  const ok = await login.login({ email: emailA.toUpperCase(), password: PASSWORD });
  assert.equal(ok.user.id, created.id); assert.equal(ok.user.role, 'SUPERVISOR');
  assert.deepEqual(verifyJwtHs256(ok.accessToken, SECRET), { userId: created.id, organizationId: demoOrg, role: 'SUPERVISOR' });

  // 2) bcrypt compare is real: wrong password and unknown email both give the same 401
  await assert.rejects(login.login({ email: emailA, password: 'Wrong12345' }), (e: any) => e.status === 401 && e.code === 'INVALID_CREDENTIALS');
  await assert.rejects(login.login({ email: `nobody-${randomUUID()}@example.com`, password: PASSWORD }), (e: any) => e.status === 401 && e.code === 'INVALID_CREDENTIALS');

  // 3) inactive account is rejected even with the right password
  await admin.query('UPDATE app_user SET is_active = false WHERE email = $1', [emailA]);
  await assert.rejects(login.login({ email: emailA, password: PASSWORD }), (e: any) => e.status === 401 && e.code === 'INVALID_CREDENTIALS');
  await admin.query('UPDATE app_user SET is_active = true WHERE email = $1', [emailA]);
  assert.equal((await login.login({ email: emailA, password: PASSWORD })).user.id, created.id);

  // 4) tenant isolation: a user in ANOTHER organization logs in with that organization's id in the token,
  //    and is invisible from Demo Org's tenant context (RLS unchanged).
  const otherName = `it-login-org-${randomUUID()}`;
  otherOrgId = (await admin.query('INSERT INTO organization (name) VALUES ($1) RETURNING organization_id', [otherName])).rows[0].organization_id;
  const emailB = `it-login-${randomUUID()}@example.com`; emails.push(emailB);
  await admin.query("INSERT INTO app_user (organization_id, full_name, email, password_hash, role) VALUES ($1,'Login IT B',$2,$3,'TECHNICIAN')", [otherOrgId, emailB, await bcrypt.hash(PASSWORD, 10)]);
  const okB = await login.login({ email: emailB, password: PASSWORD });
  assert.equal(okB.user.role, 'TECHNICIAN');
  assert.equal(verifyJwtHs256(okB.accessToken, SECRET).organizationId, otherOrgId);
  assert.notEqual(otherOrgId, demoOrg);
  const seenFromDemo = await withTenant(pool, demoOrg as string, (db) => db.query('SELECT 1 FROM app_user WHERE email = $1', [emailB]));
  assert.equal(seenFromDemo.rows.length, 0, 'Demo Org context must not see the other organization\'s user');

  // 5) RLS still fully on: no tenant context -> opsense_app sees no users; and the function exposes only a UUID
  assert.equal((await pool.query('SELECT 1 FROM app_user')).rows.length, 0);
  const fn = (await pool.query('SELECT login_org_id($1) AS o', [emailA])).rows[0];
  assert.deepEqual(Object.keys(fn), ['o']); assert.equal(fn.o, demoOrg);

  // 6) function hardening: SECURITY DEFINER, fixed search_path, not executable by PUBLIC
  const meta = (await admin.query("SELECT prosecdef, proconfig, proacl::text AS acl FROM pg_proc WHERE proname = 'login_org_id'")).rows[0];
  assert.equal(meta.prosecdef, true);
  assert.ok((meta.proconfig ?? []).some((c: string) => /^search_path=/.test(c)));
  assert.ok(!/(^|[{,])=X\//.test(meta.acl ?? ''), 'PUBLIC must not have EXECUTE');
  assert.ok((await admin.query("SELECT has_function_privilege('opsense_app', 'login_org_id(text)', 'EXECUTE') AS ok")).rows[0].ok);
});
