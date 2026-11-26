import type { Handler } from './types';

/**
 * Minimal CORS for the browser app, driven by an allow-list (env CORS_ALLOWED_ORIGINS). No wildcard.
 * With the Vite dev proxy (see the frontend vite.config.ts) the browser talks to its own origin and CORS is not
 * needed at all; this exists for deployments where the frontend and API are on different origins.
 * An empty list (the default) adds no CORS headers.
 */
export function corsAllowList(allowedOrigins: readonly string[]): Handler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const raw = req.headers['origin'];
    const origin = Array.isArray(raw) ? raw[0] : raw;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') { res.status(204); (res as any).end(); return; }
    }
    next();
  };
}
