import express from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { createAssetHandlers } from './asset.handlers';
import type { AssetService } from './asset.service';

export function createAssetRouter(jwtSecret: string, service: AssetService) {
  const router = express.Router();
  const h = createAssetHandlers(service);

  router.use(authenticate(jwtSecret) as any);
  router.use(express.json({ limit: '256kb' }));

  const anyRole = requireRole('TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');
  const managerRole = requireRole('SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');

  router.post('/', managerRole as any, h.create as any);
  router.get('/', anyRole as any, h.list as any);
  router.get('/:id', anyRole as any, h.get as any);
  router.patch('/:id', managerRole as any, h.patch as any);
  router.delete('/:id', managerRole as any, h.remove as any);

  return router;
}
