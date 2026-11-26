import { badRequest } from '../../http/errors';
import { PASSWORD_MAX_BYTES } from './signup.validation';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface ValidatedLogin { email: string; password: string }
type Detail = { field: string; issue: string };

/**
 * Validates the JSON body of POST /auth/login.
 *   - email: required, text, trimmed + lower-cased, must look like an email.
 *   - password: required, text. It is NEVER trimmed or changed (spaces can be part of a password).
 * Only the SHAPE is checked here. The signup password rules (length, letter + number) are not re-applied at
 * login: a login attempt with a "weak" password is simply a wrong password and gets the generic 401.
 * Extra fields in the body (role, organization_id, ...) are ignored: they are never read.
 * Throws ApiError 400 VALIDATION_ERROR with field-level details (same envelope as signup).
 */
export function validateLogin(body: unknown): ValidatedLogin {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const problems: Detail[] = [];
  const add = (field: string, issue: string) => problems.push({ field, issue });

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (b.email !== undefined && b.email !== null && typeof b.email !== 'string') add('email', 'Email must be text.');
  else if (email === '') add('email', 'Email is required.');
  else if (email.length > 254 || email.split('@')[0].length > 64 || !EMAIL_RE.test(email)) add('email', 'Enter a valid email address.');

  const password = b.password;
  if (password !== undefined && password !== null && typeof password !== 'string') add('password', 'Password must be text.');
  else if (password === undefined || password === null || password === '') add('password', 'Password is required.');
  else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) add('password', `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`);

  if (problems.length) throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', problems);
  return { email, password: password as string };
}
