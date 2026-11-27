
/**
 * Operational Sense backend: Express application factory.
 * (`serviceName` is kept from the original scaffold for compatibility.)
 *
 * Request order matters: correlation id -> authenticate -> role check -> body parser -> handler.
 */
import express from 'express';
import { authenticate, requireRole } from './middleware/auth';
import { correlationMiddleware, errorMiddleware, notFound } from './http/errors';
import type { Logger } from './http/logger';
import { API_PREFIX, createRecordingHandlers } from './modules/recordings/recording.handlers';
import type { CaptureService } from './modules/recordings/recording.service';
import { createCaseHandlers } from './modules/cases/case.handlers';
import type { CaseService } from './modules/cases/case.service';
import type { AppConfig } from './config/env';
import { corsAllowList } from './http/cors';
import { createAuthHandlers } from './modules/users/auth.handlers';
import type { LoginService } from './modules/users/login.service';
import type { SignupService } from './modules/users/signup.service';

export const serviceName = 'operational-sense-backend';

export interface AppDeps {
  config: Pick<AppConfig, 'jwtSecret' | 'maxUploadBytes' | 'allowedMimeTypes'>;
  service: CaptureService;
  caseService?: CaseService;
  logger: Logger;
  /** Public signup. Optional: when absent, the /auth routes are not mounted. */
  signup?: { service: SignupService; loginService?: LoginService; corsAllowedOrigins: readonly string[] };
  /** Resolves if the database answers; used by /health/ready. */
  ping: () => Promise<void>;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware as any);

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: serviceName });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await deps.ping();
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // Public account routes.
  if (deps.signup) {
    const authRouter = express.Router();
    authRouter.use(corsAllowList(deps.signup.corsAllowedOrigins) as any);
    authRouter.use(express.json({ limit: '10kb' }));

    const authHandlers = createAuthHandlers(deps.signup.service, deps.signup.loginService);
    authRouter.post('/signup', authHandlers.signup as any);

    if (authHandlers.login) {
      authRouter.post('/login', authHandlers.login as any);
    }

    app.use(`${API_PREFIX}/auth`, authRouter);
  }

  const api = express.Router();
  api.use(authenticate(deps.config.jwtSecret) as any);

  const anyRole = requireRole(
    'TECHNICIAN',
    'SUPERVISOR',
    'RELIABILITY_ENGINEER',
    'ADMIN',
  );

  // Recording routes.
  const h = createRecordingHandlers(deps.service, deps.config);

  const audioOnly = express.raw({
    type: (req) => /^audio\//i.test(String(req.headers['content-type'] ?? '')),
    limit: deps.config.maxUploadBytes,
  });

  api.post('/recordings', anyRole as any, audioOnly, h.upload as any);
  api.get('/recordings', anyRole as any, h.list as any);
  api.get('/recordings/:id', anyRole as any, h.get as any);
  api.post('/recordings/:id/process', anyRole as any, h.processRecording as any);
  api.get('/recordings/:id/draft', anyRole as any, h.getDraft as any);

  // Block 4: Case Management routes.
  if (deps.caseService) {
    const cases = createCaseHandlers(deps.caseService);
    const jsonBody = express.json({ limit: '1mb' });

    api.post('/cases', anyRole as any, jsonBody, cases.create as any);
    api.get('/cases', anyRole as any, cases.list as any);
    api.get('/cases/:id', anyRole as any, cases.get as any);
    api.patch('/cases/:id', anyRole as any, jsonBody, cases.update as any);
    api.post('/cases/:id/submit', anyRole as any, cases.submit as any);

    api.post(
      '/cases/:id/review',
      requireRole('SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN') as any,
      jsonBody,
      cases.review as any,
    );
  }

  app.use(API_PREFIX, api);

  app.use((_req, _res, next) =>
    next(notFound('No such route', 'ROUTE_NOT_FOUND')),
  );

  app.use(errorMiddleware(deps.logger) as any);

  return app;
}
