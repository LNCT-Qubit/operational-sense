import { randomUUID } from 'node:crypto';
import type { Logger } from './logger';
import type { HttpRequest, HttpResponse, NextFunction } from './types';

/**
 * Error envelope required by docs/06-api-and-integration/error-handling.md:
 * stable code + human message + correlation id + optional field-level details. No stack traces,
 * SQL, file paths or credentials ever appear in it.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown[],
  ) {
    super(message);
  }
}

export const badRequest = (code: string, msg: string, details?: unknown[]) => new ApiError(400, code, msg, details);
export const unauthorized = (msg = 'Authentication required', code = 'AUTHENTICATION_REQUIRED') => new ApiError(401, code, msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg: string, code = 'NOT_FOUND') => new ApiError(404, code, msg);
export const conflict = (code: string, msg: string) => new ApiError(409, code, msg);
export const payloadTooLarge = (msg: string) => new ApiError(413, 'PAYLOAD_TOO_LARGE', msg);
export const unsupportedMediaType = (msg: string) => new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', msg);

/** True for failures that mean "the database is not reachable/ready" rather than "our query is wrong". */
export function isDatabaseUnavailable(err: unknown): boolean {
  const e = err as { code?: string } | null;
  const code = e?.code ?? '';
  return (
    ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE'].includes(code) ||
    code.startsWith('08') ||   // connection exception class
    ['57P01', '57P02', '57P03', '53300'].includes(code) // admin shutdown, crash shutdown, cannot connect now, too many connections
  );
}

/** Maps PostgreSQL SQLSTATE constraint/type/permission errors into safe client HTTP envelopes. */
export function mapPgError(err: unknown): ApiError | null {
  const code = (err as { code?: string } | null)?.code;
  if (!code) return null;
  switch (code) {
    case '22P02':
      return badRequest('INVALID_PARAMETER', 'One or more identifiers or input values have an invalid format.');
    case '23505':
      return conflict('CONFLICT', 'A conflicting record already exists.');
    case '23503':
      return badRequest('INVALID_REFERENCE', 'Referenced record does not exist or cannot be linked.');
    case '23514':
      return badRequest('CONSTRAINT_VIOLATION', 'The supplied values violate a validation constraint.');
    case '42501':
      return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
    default:
      return null;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = err as { status?: number; type?: string; code?: string } | null;
  // body-parser (express.raw) signals an oversized upload this way
  if (e?.status === 413 || e?.type === 'entity.too.large') return payloadTooLarge('Uploaded file exceeds the maximum allowed size');
  // express.json() signals a malformed JSON body this way
  if (e?.type === 'entity.parse.failed') return badRequest('INVALID_JSON', 'The request body is not valid JSON.');
  if (isDatabaseUnavailable(err)) return new ApiError(503, 'DATABASE_UNAVAILABLE', 'The service is temporarily unavailable. Please retry.');
  const pgErr = mapPgError(err);
  if (pgErr) return pgErr;
  return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}

export function correlationMiddleware(req: HttpRequest, res: HttpResponse, next: NextFunction): void {
  const inbound = req.headers['x-correlation-id'];
  const candidate = typeof inbound === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(inbound) ? inbound : randomUUID();
  req.correlationId = candidate;
  res.setHeader('X-Correlation-Id', candidate);
  next();
}

/** Express error middleware (4 args). Logs the real error server-side, returns only the safe envelope. */
export function errorMiddleware(logger: Logger) {
  return (err: unknown, req: HttpRequest, res: HttpResponse, _next: NextFunction): void => {
    const api = toApiError(err);
    const cid = req.correlationId ?? 'unknown';
    const meta = { correlation_id: cid, status: api.status, code: api.code, method: req.method };
    if (api.status >= 500) {
      const real = err as Error & { code?: string };
      logger.error('request failed', { ...meta, error_name: real?.name, sqlstate: real?.code, error_message: real?.message });
    } else {
      logger.debug('request rejected', meta);
    }
    if ((res as { headersSent?: boolean }).headersSent) return;
    res.status(api.status).json({
      error: { code: api.code, message: api.message, correlation_id: cid, ...(api.details ? { details: api.details } : {}) },
    });
  };
}
