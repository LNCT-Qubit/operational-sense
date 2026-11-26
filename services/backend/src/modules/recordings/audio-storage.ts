import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isUuid } from '../../middleware/auth';

export interface AudioStorage {
  /** Saves bytes and returns the storage URI (relative to the storage root). */
  save(organizationId: string, recordingId: string, ext: string, data: Buffer): Promise<string>;
  remove(storageUri: string): Promise<void>;
  /** Absolute path for the transcription service. */
  absolutePath(storageUri: string): string;
}

/** Local-disk storage. File names are built only from validated UUIDs and a server-chosen extension. */
export class LocalAudioStorage implements AudioStorage {
  constructor(private readonly root: string) {}

  async save(organizationId: string, recordingId: string, ext: string, data: Buffer): Promise<string> {
    if (!isUuid(organizationId) || !isUuid(recordingId) || !/^[a-z0-9]{2,5}$/.test(ext)) {
      throw new TypeError('Invalid storage key');
    }
    const uri = `${organizationId.toLowerCase()}/${recordingId.toLowerCase()}.${ext}`;
    const full = this.absolutePath(uri);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await fs.writeFile(full, data, { flag: 'wx', mode: 0o600 }); // 'wx': never overwrite an existing recording
    return uri;
  }

  async remove(storageUri: string): Promise<void> {
    await fs.rm(this.absolutePath(storageUri), { force: true });
  }

  absolutePath(storageUri: string): string {
    const full = path.resolve(this.root, storageUri);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new Error('Storage path escapes the storage root');
    return full;
  }
}
