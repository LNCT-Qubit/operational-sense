/**
 * Operational Sense backend: Express application factory.
 * (`serviceName` is kept from the original scaffold for compatibility.)
 *
 * Request order matters:  correlation id -> authenticate -> role check -> body parser -> handler -> error middleware.
 * Authentication runs BEFORE express.raw() so an unauthenticated caller cannot make the server buffer a 15 MB body.
 */
import express from 'express';
import { authenticate, requireRole } from './middleware/auth';
import { correlationMiddleware, errorMiddleware, notFound } from './http/errors';
import type { Logger } from './http/logger';
import { API_PREFIX, createRecordingHandlers } from './modules/recordings/recording.handlers';
import type { CaptureService } from './modules/recordings/recording.service';
import type { AppConfig } from './config/env';
import { corsAllowList } from './http/cors';
import { createAuthHandlers } from './modules/users/auth.handlers';
import type { LoginService } from './modules/users/login.service';
import type { SignupService } from './modules/users/signup.service';
import { createDraftRouter } from './modules/drafts/draft.routes';
import type { TechnicianDraftService } from './modules/drafts/draft.service';
import { createCaseRouter } from './modules/cases/case.routes';
import type { CaseService } from './modules/cases/case.service';
import { createAssetRouter } from './modules/assets/asset.routes';
import type { AssetService } from './modules/assets/asset.service';
import { createTaxonomyRouter, type TaxonomyService } from './modules/taxonomy/taxonomy.routes';

export const serviceName = 'operational-sense-backend';

export interface AppDeps {
  config: Pick<AppConfig, 'jwtSecret' | 'maxUploadBytes' | 'allowedMimeTypes'>;
  service: CaptureService;
  logger: Logger;
  /** Public signup. Optional: when absent, the /auth routes are simply not mounted (keeps existing tests/wiring valid). */
  signup?: { service: SignupService; loginService?: LoginService; corsAllowedOrigins: readonly string[] };
  drafts?: { service: TechnicianDraftService; maxAttachmentBytes?: number };
  cases?: { service: CaseService };
  assets?: { service: AssetService };
  taxonomy?: { service: TaxonomyService };
  /** Resolves if the database answers; used by /health/ready. */
  ping: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware as any);

  app.get('/health', (_req, res) => { res.status(200).json({ status: 'ok', service: serviceName }); });
  app.get('/health/ready', async (_req, res) => {
    try { await deps.ping(); res.status(200).json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }   // no detail: do not leak connection info
  });

  // Public account routes. Mounted BEFORE the authenticated router below: nobody has a token yet when signing up.
  if (deps.signup) {
    const authRouter = express.Router();
    authRouter.use(corsAllowList(deps.signup.corsAllowedOrigins) as any);
    authRouter.use(express.json({ limit: '10kb' }));            // small cap: signup/login forms are tiny
    const authHandlers = createAuthHandlers(deps.signup.service, deps.signup.loginService);
    authRouter.post('/signup', authHandlers.signup as any);
    if (authHandlers.login) authRouter.post('/login', authHandlers.login as any);   // only when a LoginService is wired
    app.use(`${API_PREFIX}/auth`, authRouter);
  }

  if (deps.drafts) {
    app.use(`${API_PREFIX}/drafts`, createDraftRouter(deps.config.jwtSecret, deps.drafts.service, deps.drafts.maxAttachmentBytes));
  }
  if (deps.cases) {
    app.use(`${API_PREFIX}/cases`, createCaseRouter(deps.config.jwtSecret, deps.cases.service));
  }
  if (deps.assets) {
    app.use(`${API_PREFIX}/assets`, createAssetRouter(deps.config.jwtSecret, deps.assets.service));
  }
  if (deps.taxonomy) {
    app.use(`${API_PREFIX}/taxonomy`, createTaxonomyRouter(deps.config.jwtSecret, deps.taxonomy.service));
  }

  const h = createRecordingHandlers(deps.service, deps.config);
  const api = express.Router();
  api.use(authenticate(deps.config.jwtSecret) as any);

  // Only audio/* bodies are read into a Buffer (others leave req.body empty and are rejected with 415 by the handler).
  const audioOnly = express.raw({
    type: (req) => /^audio\//i.test(String(req.headers['content-type'] ?? '')),
    limit: deps.config.maxUploadBytes,
  });
  const anyRole = requireRole('TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');

  api.post('/recordings', anyRole as any, audioOnly, h.upload as any);
  api.get('/recordings', anyRole as any, h.list as any);
  api.get('/recordings/:id', anyRole as any, h.get as any);
  api.get('/recordings/:id/audio', anyRole as any, h.getAudio as any);
  api.post('/recordings/:id/process', anyRole as any, h.processRecording as any);
  api.get('/recordings/:id/draft', anyRole as any, h.getDraft as any);
  app.use(API_PREFIX, api);

  app.use((_req, _res, next) => next(notFound('No such route', 'ROUTE_NOT_FOUND')));
  app.use(errorMiddleware(deps.logger) as any);
  return app;
}
