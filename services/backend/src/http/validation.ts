import type { ErrorObject, ValidateFunction } from 'ajv';
import { badRequest, unauthorized } from './errors';
import { isUuid, type AuthContext } from '../middleware/auth';
import type { HttpRequest } from './types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, removeAdditional: false, coerceTypes: false, allowUnionTypes: true });

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 100): Pagination {
  const parseIntParam = (raw: unknown, fallback: number, min: number, max: number, name: string): number => {
    if (raw === undefined || raw === '') return fallback;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
      throw badRequest('INVALID_QUERY', `${name} must be an integer between ${min} and ${max}.`);
    }
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max) {
      throw badRequest('INVALID_QUERY', `${name} must be an integer between ${min} and ${max}.`);
    }
    return n;
  };
  return {
    limit: parseIntParam(query.limit, defaultLimit, 1, maxLimit, 'limit'),
    offset: parseIntParam(query.offset, 0, 0, 1_000_000, 'offset'),
  };
}

export function requireUuidParam(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !isUuid(value)) {
    throw badRequest('INVALID_ID', `The ${label} in the URL is not a valid UUID.`);
  }
  return value.toLowerCase();
}

export function requirePositiveIntParam(value: unknown, label = 'id'): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw badRequest('INVALID_ID', `The ${label} in the URL must be a positive integer.`);
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw badRequest('INVALID_ID', `The ${label} in the URL is out of range.`);
  }
  return n;
}

/** Ensures req.auth exists and carries a UUID userId for UUID actor columns in technician_draft / draft_attachment. */
export function requireUuidActor(req: HttpRequest): AuthContext {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  if (!isUuid(auth.userId)) {
    throw unauthorized('Authenticated user id must be a valid UUID.', 'INVALID_TOKEN');
  }
  return { ...auth, userId: auth.userId.toLowerCase(), organizationId: auth.organizationId.toLowerCase() };
}

export function headerValue(req: HttpRequest, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): Array<{ field: string; issue: string }> {
  if (!errors?.length) return [];
  return errors.map((err) => {
    const missing = (err.params as { missingProperty?: string })?.missingProperty;
    const rawPath = err.instancePath ? err.instancePath.replace(/^\//, '').replace(/\//g, '.') : '';
    const field = missing ? (rawPath ? `${rawPath}.${missing}` : missing) : (rawPath || 'body');
    return { field, issue: err.message ?? 'invalid value' };
  });
}

export function compileValidator<T>(schema: Record<string, unknown>): (body: unknown) => T {
  const validate: ValidateFunction<T> = ajv.compile(schema);
  return (body: unknown): T => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw badRequest('VALIDATION_ERROR', 'Request body must be a JSON object.', [{ field: 'body', issue: 'must be an object' }]);
    }
    if (!validate(body)) {
      throw badRequest('VALIDATION_ERROR', 'Please correct the highlighted fields.', formatAjvErrors(validate.errors));
    }
    return body as T;
  };
}
