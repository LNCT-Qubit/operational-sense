import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { isUuid } from '../../middleware/auth';
import type { StoredFileStream } from '../recordings/audio-storage';

export interface AttachmentStorage {
  save(organizationId: string, attachmentId: string, ext: string, data: Buffer): Promise<string>;
  remove(storageUri: string): Promise<void>;
  openRead(storageUri: string): Promise<StoredFileStream | null>;
}

/** Local-disk storage for draft attachments under <uploadDir>/attachments/<org>/<uuid>.<ext>. */
export class LocalAttachmentStorage implements AttachmentStorage {
  private readonly root: string;

  constructor(uploadDir: string) {
    this.root = path.resolve(uploadDir);
  }

  async save(organizationId: string, attachmentId: string, ext: string, data: Buffer): Promise<string> {
    if (!isUuid(organizationId) || !isUuid(attachmentId) || !/^[a-z0-9]{2,8}$/.test(ext)) {
      throw new TypeError('Invalid attachment storage key');
    }
    const uri = `attachments/${organizationId.toLowerCase()}/${attachmentId.toLowerCase()}.${ext}`;
    const full = this.absolutePath(uri);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, data, { flag: 'wx', mode: 0o600 });
    return uri;
  }

  async remove(storageUri: string): Promise<void> {
    await fs.rm(this.absolutePath(storageUri), { force: true });
  }

  async openRead(storageUri: string): Promise<StoredFileStream | null> {
    const full = this.absolutePath(storageUri);
    try {
      const st = await fs.stat(full);
      if (!st.isFile()) return null;
      return {
        sizeBytes: st.size,
        openStream: (range) => createReadStream(full, range ? { start: range.start, end: range.end } : undefined),
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw err;
    }
  }

  private absolutePath(storageUri: string): string {
    const full = path.resolve(this.root, storageUri);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error('Attachment storage path escapes the storage root');
    }
    return full;
  }
}
