import express from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import { createDraftHandlers } from './draft.handlers';
import type { TechnicianDraftService } from './draft.service';
import { MAX_ATTACHMENT_BYTES } from './draft.validation';

export function createDraftRouter(
  jwtSecret: string,
  service: TechnicianDraftService,
  maxAttachmentBytes = MAX_ATTACHMENT_BYTES,
) {
  const router = express.Router();
  const h = createDraftHandlers(service, maxAttachmentBytes);

  // Authentication MUST run before any body parser so unauthenticated callers cannot buffer payloads.
  router.use(authenticate(jwtSecret) as any);

  const anyRole = requireRole('TECHNICIAN', 'SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');
  const reviewerRole = requireRole('SUPERVISOR', 'RELIABILITY_ENGINEER', 'ADMIN');
  const jsonBody = express.json({ limit: '1mb' });
  const attachmentRaw = express.raw({
    type: () => true,
    limit: maxAttachmentBytes,
  });

  router.post('/', anyRole as any, jsonBody, h.upsert as any);
  router.get('/', anyRole as any, h.list as any);
  router.get('/:id', anyRole as any, h.get as any);
  router.patch('/:id', anyRole as any, jsonBody, h.patch as any);
  router.post('/:id/decision', reviewerRole as any, jsonBody, h.decide as any);
  router.delete('/:id', anyRole as any, h.remove as any);

  router.post('/:id/attachments', anyRole as any, attachmentRaw, h.uploadAttachment as any);
  router.get('/:id/attachments/:attachmentId', anyRole as any, h.getAttachment as any);
  router.delete('/:id/attachments/:attachmentId', anyRole as any, h.removeAttachment as any);

  return router;
}
