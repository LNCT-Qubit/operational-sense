import { badRequest } from '../../http/errors';
import type { SignupRole } from './user.types';

/** Frontend role value (LandingPage.tsx `UserRole`) -> backend role (middleware/auth.ts `ROLES`). */
const ROLE_MAP: Readonly<Record<string, SignupRole>> = { technician: 'TECHNICIAN', supervisor: 'SUPERVISOR' };

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;   // bcrypt only reads the first 72 bytes: reject longer instead of silently truncating

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface ValidatedSignup { name: string; email: string; password: string; role: SignupRole }
type Detail = { field: string; issue: string };

/**
 * Validates the JSON body of POST /auth/signup. Collects EVERY problem so the form can show them at once.
 * Throws ApiError 400 VALIDATION_ERROR with field-level details (the envelope in http/errors.ts).
 */
export function validateSignup(body: unknown): ValidatedSignup {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const problems: Detail[] = [];
  const add = (field: string, issue: string) => problems.push({ field, issue });

  const rawName = typeof b.name === 'string' ? b.name.trim() : '';
  if (b.name !== undefined && b.name !== null && typeof b.name !== 'string') add('name', 'Name must be text.');
  else if (rawName === '') add('name', 'Name is required.');
  else if (rawName.length < 2 || rawName.length > 100) add('name', 'Name must be between 2 and 100 characters.');
  else if (CONTROL_CHARS.test(rawName)) add('name', 'Name contains invalid characters.');

  const rawEmail = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (b.email !== undefined && b.email !== null && typeof b.email !== 'string') add('email', 'Email must be text.');
  else if (rawEmail === '') add('email', 'Email is required.');
  else if (rawEmail.length > 254 || rawEmail.split('@')[0].length > 64 || !EMAIL_RE.test(rawEmail)) add('email', 'Enter a valid email address.');

  const password = b.password;
  if (password !== undefined && password !== null && typeof password !== 'string') add('password', 'Password must be text.');
  else if (password === undefined || password === null || password === '') add('password', 'Password is required.');
  else {
    if (password.length < PASSWORD_MIN_LENGTH) add('password', `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) add('password', `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`);
    else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) add('password', 'Password must contain at least one letter and one number.');
  }

  let role: SignupRole | undefined;
  if (b.role === undefined || b.role === null || b.role === '') add('role', 'Role is required.');
  else if (typeof b.role !== 'string' || !Object.prototype.hasOwnProperty.call(ROLE_MAP, b.role.trim().toLowerCase())) {
    add('role', 'Role must be "technician" or "supervisor".');
  } else role = ROLE_MAP[b.role.trim().toLowerCase()];

  if (problems.length) throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', problems);
  return { name: rawName, email: rawEmail, password: password as string, role: role as SignupRole };
}
