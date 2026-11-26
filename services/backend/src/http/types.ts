// Minimal request/response shapes. Express's Request/Response satisfy these structurally, which lets the
// handlers and middleware be unit-tested without Express installed and without coupling them to it.
import type { AuthContext } from '../middleware/auth';

export interface HttpRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body?: unknown;
  auth?: AuthContext;
  correlationId?: string;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): unknown;
  setHeader(name: string, value: string): unknown;
}

export type NextFunction = (err?: unknown) => void;
export type Handler = (req: HttpRequest, res: HttpResponse, next: NextFunction) => void;

/** Wraps an async handler so a rejected promise reaches the error middleware instead of crashing the process. */
export function asyncHandler(fn: (req: HttpRequest, res: HttpResponse) => Promise<void>): Handler {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}
