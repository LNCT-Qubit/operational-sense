import { createHash, randomUUID } from 'node:crypto';
import { notFound } from '../../http/errors';
import type { Logger } from '../../http/logger';
import type { AuthContext } from '../../middleware/auth';
import type { AttachmentStorage } from './attachment-storage';
import type {
  DraftDecision,
  DraftListFilter,
  DraftSyncStore,
  PatchDraftInput,
  UpsertDraftInput,
} from './draft.types';
import type { ValidatedAttachmentUpload } from './draft.validation';

export class TechnicianDraftService {
  constructor(
    private readonly store: DraftSyncStore,
    private readonly storage: AttachmentStorage,
    private readonly logger: Logger,
  ) {}

  upsert(ctx: AuthContext, input: UpsertDraftInput) {
    return this.store.upsertDraft(ctx.organizationId, ctx.userId, ctx.role, input);
  }

  list(ctx: AuthContext, filter: Omit<DraftListFilter, 'createdBy'>) {
    const createdBy = ctx.role === 'TECHNICIAN' ? ctx.userId : undefined;
    return this.store.listDrafts(ctx.organizationId, { ...filter, createdBy });
  }

  async get(ctx: AuthContext, draftId: string) {
    const createdBy = ctx.role === 'TECHNICIAN' ? ctx.userId : undefined;
    const detail = await this.store.getDraft(ctx.organizationId, draftId, createdBy);
    if (!detail) throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
    return detail;
  }

  patch(ctx: AuthContext, draftId: string, patch: PatchDraftInput) {
    return this.store.patchDraft(ctx.organizationId, ctx.userId, ctx.role, draftId, patch);
  }

  decide(ctx: AuthContext, draftId: string, decision: DraftDecision, comment: string | null) {
    return this.store.decideDraft(ctx.organizationId, ctx.userId, draftId, decision, comment);
  }

  async remove(ctx: AuthContext, draftId: string) {
    const deleted = await this.store.softDeleteDraft(ctx.organizationId, ctx.userId, ctx.role, draftId);
    if (!deleted) throw notFound('Draft not found.', 'DRAFT_NOT_FOUND');
  }

  async uploadAttachment(ctx: AuthContext, draftId: string, upload: ValidatedAttachmentUpload) {
    await this.store.ensureDraftForAttachmentUpload(ctx.organizationId, ctx.userId, ctx.role, draftId);

    const sha256 = createHash('sha256').update(upload.body).digest('hex');
    const attachmentId = randomUUID();
    const storageUri = await this.storage.save(ctx.organizationId, attachmentId, upload.ext, upload.body);

    let result;
    try {
      result = await this.store.insertAttachmentIfAbsent(ctx.organizationId, ctx.userId, ctx.role, draftId, {
        attachmentId,
        clientAttachmentKey: upload.clientAttachmentKey,
        mediaType: upload.mediaType,
        fileName: upload.fileName,
        mimeType: upload.mimeType,
        sizeBytes: upload.body.length,
        sha256,
        storageUri,
      });
    } catch (err) {
      await this.discardFile(storageUri);
      throw err;
    }

    if (!result.created) {
      await this.discardFile(storageUri);
    }
    return result;
  }

  async getAttachmentStream(ctx: AuthContext, draftId: string, attachmentId: string) {
    const createdBy = ctx.role === 'TECHNICIAN' ? ctx.userId : undefined;
    const row = await this.store.getAttachment(ctx.organizationId, draftId, attachmentId, createdBy);
    if (!row) throw notFound('Attachment not found.', 'ATTACHMENT_NOT_FOUND');

    const opened = await this.storage.openRead(row.storage_uri);
    if (!opened) throw notFound('Attachment file not found.', 'ATTACHMENT_FILE_NOT_FOUND');

    return {
      attachment: row,
      sizeBytes: opened.sizeBytes,
      openStream: opened.openStream,
    };
  }

  async removeAttachment(ctx: AuthContext, draftId: string, attachmentId: string) {
    const deleted = await this.store.softDeleteAttachment(ctx.organizationId, ctx.userId, ctx.role, draftId, attachmentId);
    if (!deleted) throw notFound('Attachment not found.', 'ATTACHMENT_NOT_FOUND');
  }

  private async discardFile(storageUri: string): Promise<void> {
    try {
      await this.storage.remove(storageUri);
    } catch (err) {
      this.logger.warn('could not remove attachment file', { reason: (err as Error).name });
    }
  }
}
