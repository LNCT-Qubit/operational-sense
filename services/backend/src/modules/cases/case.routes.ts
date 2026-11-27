import express from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { createCaseHandlers } from './case.handlers';
import type { CaseService } from './case.service';

export function createCaseRouter(jwtSecret: string, service: CaseService) {
  const router = express.Router();
  const h = createCaseHandlers(service);

  router.use(authenticate(jwtSecret) as any);
  router.use(express.json({ limit: '1mb' }));

  const anyRole = requireRole('TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');
  const reviewerRole = requireRole('SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');

  router.post('/', anyRole as any, h.create as any);
  router.get('/', anyRole as any, h.list as any);
  router.get('/:id', anyRole as any, h.get as any);
  router.patch('/:id', reviewerRole as any, h.patch as any);
  router.delete('/:id', reviewerRole as any, h.remove as any);

  return router;
}
