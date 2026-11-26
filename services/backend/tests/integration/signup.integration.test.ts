/**
 * GATED: runs only when US07_PG_URL (connects as opsense_app) and US07_PG_ADMIN_URL (superuser; only used to read
 * the stored row back and clean up) are set, `pg` and `bcryptjs` are installed, and migrations 001-010 are applied.
 * Exercises the REAL migration 010 (table, unique index, RLS, signup_org_id) through the REAL PostgresUserStore + bcrypt.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PostgresUserStore } from '../../src/modules/users/user.repository';
import { createBcryptHasher } from '../../src/modules/users/password-hasher';
import { SignupService } from '../../src/modules/users/signup.service';
import { silentLogger } from '../../src/http/logger';

const URL = process.env.US07_PG_URL, ADMIN = process.env.US07_PG_ADMIN_URL;
let pg: any = null, bcrypt: any = null;
try { pg = require('pg'); bcrypt = require('bcryptjs'); } catch { /* not installed */ }
const skip = !(URL && ADMIN && pg && bcrypt) && 'set US07_PG_URL + US07_PG_ADMIN_URL and install pg + bcryptjs to run against a live database';

let pool: any, admin: any; const emails: string[] = [];
after(async () => { if (admin && emails.length) await admin.query('DELETE FROM app_user WHERE email = ANY($1)', [emails]); await pool?.end(); await admin?.end(); });

test('live DB: signup stores a bcrypt hash, rejects duplicates, enforces RLS, keeps Demo Org', { skip }, async () => {
  pool = new pg.Pool({ connectionString: URL }); admin = new pg.Pool({ connectionString: ADMIN });
  const store = new PostgresUserStore(pool);
  const svc = new SignupService(store, createBcryptHasher(10), { organizationName: 'Demo Org' }, silentLogger);
  const email = `it-${randomUUID()}@example.com`; emails.push(email);

  const u = await svc.signup({ name: 'IT User', email, password: 'Passw0rdOK', role: 'supervisor' });
  assert.equal(u.role, 'SUPERVISOR');

  const row = (await admin.query('SELECT password_hash, role, organization_id FROM app_user WHERE email = $1', [email])).rows[0];
  assert.notEqual(row.password_hash, 'Passw0rdOK'); assert.match(row.password_hash, /^\$2[aby]\$10\$/);
  assert.ok(await bcrypt.compare('Passw0rdOK', row.password_hash));
  assert.equal(row.organization_id, await store.resolveSignupOrgId('Demo Org'));

  await assert.rejects(svc.signup({ name: 'IT User', email: email.toUpperCase(), password: 'Passw0rdOK', role: 'technician' }), (e: any) => e.status === 409);

  // RLS: with no tenant context the application role sees no users at all, and cannot insert for another org.
  assert.equal((await pool.query('SELECT 1 FROM app_user')).rows.length, 0);
  await assert.rejects(pool.query("INSERT INTO app_user (organization_id, full_name, email, password_hash, role) VALUES ($1,'x','rls@x.com','h','TECHNICIAN')", [randomUUID()]));
});
