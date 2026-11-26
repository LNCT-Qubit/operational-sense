import { createHmac, timingSafeEqual } from 'node:crypto';
import { forbidden, unauthorized } from '../http/errors';
import type { Handler, HttpRequest } from '../http/types';

/**
 * Authentication + RBAC for US-07.
 *
 * CONTRACT (assumption, to be confirmed with the RBAC owner, US-01 Vivansh): bearer JWT, HS256, claims
 *   sub  = user id (string)           org = organization UUID           role = one of ROLES
 *   exp  = expiry (seconds, required)
 * The organization used for EVERY database operation comes from this verified token and nowhere else
 * (proposal Sec.6: "never from client input"). Request bodies/headers/query strings are never consulted.
 *
 * Why hand-rolled HS256 verification? The sandbox this was written in had no network, so `jsonwebtoken`
 * could not be installed. The verifier is ~40 lines, pins the algorithm (no `alg: none`, no RS/HS confusion),
 * compares signatures in constant time, and requires exp. Swapping in `jose` later only changes this file.
 */
export const ROLES = ['TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: Role;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const b64url = (buf: Buffer) => buf.toString('base64url');
const INVALID = () => unauthorized('Invalid or expired token', 'INVALID_TOKEN');

export function signJwtHs256(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

export function verifyJwtHs256(token: string, secret: string, nowMs: number = Date.now()): AuthContext {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw INVALID();
  const [h, p, s] = parts;

  let header: { alg?: unknown; typ?: unknown };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    throw INVALID();
  }
  if (header.alg !== 'HS256') throw INVALID();           // pins the algorithm: rejects "none" and others

  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw INVALID();

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) throw INVALID();          // exp is mandatory
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > nowSec)) throw INVALID();

  const { sub, org, role } = claims;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) throw INVALID();
  if (!isUuid(org)) throw INVALID();
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) throw INVALID();
  return { userId: sub, organizationId: org.toLowerCase(), role: role as Role };
}

export function authenticate(secret: string, clock: () => number = Date.now): Handler {
  return (req: HttpRequest, _res, next) => {
    const header = req.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const m = typeof value === 'string' ? /^Bearer ([A-Za-z0-9._-]+)$/.exec(value) : null;
    if (!m) return next(unauthorized());
    try {
      req.auth = verifyJwtHs256(m[1], secret, clock());
      next();
    } catch (e) {
      next(e);
    }
  };
}

export function requireRole(...allowed: Role[]): Handler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!allowed.includes(req.auth.role)) return next(forbidden());
    next();
  };
}
