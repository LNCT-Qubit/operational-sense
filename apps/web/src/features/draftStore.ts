export type DraftSyncStatus = 'pending' | 'uploading' | 'completed' | 'failed';
export type LegacyDraftSyncStatus = 'local';

export type DraftAttachment = {
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type DraftAttachmentSummary = {
  name: string;
  type: string;
  size: number;
};

export type TechnicianDraft = {
  id: string;
  date: string;
  observation: string;
  equipment: string;
  subsystem: string;
  symptom: string;
  cause: string;
  action: string;
  parts: string;
  safety: string;
  mode: string;
  duration: number;
  audio?: Blob;
  audioType?: string;
  attachments: DraftAttachment[];
  /**
   * Stored statuses are 'pending' | 'uploading' | 'completed' | 'failed'.
   * Legacy 'local' is accepted on input for backward compatibility and normalized to 'pending'.
   */
  syncStatus: DraftSyncStatus | LegacyDraftSyncStatus;
  userId?: string;
  audioMimeType?: string;
  audioSizeBytes?: number;
  durationMs?: number;
  recordedAt?: string;
  createdAt?: number;
  updatedAt?: number;
  retryCount?: number;
  lastAttemptAt?: number;
  lastError?: string;
  serverRecordingId?: string;
};

export type HydratedTechnicianDraft = Omit<
  TechnicianDraft,
  'syncStatus' | 'recordedAt' | 'createdAt' | 'updatedAt' | 'retryCount'
> & {
  syncStatus: DraftSyncStatus;
  recordedAt: string;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
};

export type SaveDraftInput = Omit<TechnicianDraft, 'id'> & { id?: string };

export type DraftSummary = Omit<HydratedTechnicianDraft, 'audio' | 'attachments'> & {
  attachments: DraftAttachmentSummary[];
  hasAudio: boolean;
};

export type StorageQuotaStatus = {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isPersisted: boolean;
};

export type DraftStorageErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'INVALID_AUDIO'
  | 'IDB_UNAVAILABLE'
  | 'TRANSACTION_FAILED'
  | 'NOT_FOUND';

export class DraftStorageError extends Error {
  readonly code: DraftStorageErrorCode;
  readonly userMessage: string;
  override readonly cause?: unknown;

  constructor(
    code: DraftStorageErrorCode,
    userMessage: string,
    message?: string,
    cause?: unknown,
  ) {
    super(message ?? userMessage);
    this.name = 'DraftStorageError';
    this.code = code;
    this.userMessage = userMessage;
    this.cause = cause;
  }
}

interface StoredAttachment {
  name: string;
  type: string;
  size: number;
  buffer?: ArrayBuffer;
  blob?: Blob;
}

interface StoredDraftRecord {
  id: string;
  date: string;
  observation: string;
  equipment: string;
  subsystem: string;
  symptom: string;
  cause: string;
  action: string;
  parts: string;
  safety: string;
  mode: string;
  duration: number;
  audioBuffer?: ArrayBuffer;
  /** Tolerated only when reading un-rewritten legacy v1 records. */
  audio?: Blob;
  audioType?: string;
  attachments: StoredAttachment[];
  syncStatus: DraftSyncStatus | LegacyDraftSyncStatus;
  userId?: string;
  audioMimeType?: string;
  audioSizeBytes?: number;
  durationMs?: number;
  recordedAt: string;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
  serverRecordingId?: string;
}

const DB_NAME = 'workshop-note';
const DB_VERSION = 2;
const STORE = 'drafts';
const IDX_SYNC_STATUS_CREATED = 'idx_sync_status_created';
const IDX_USER_SYNC_CREATED = 'idx_user_sync_created';
const DEFAULT_LEASE_DURATION_MS = 30_000;
const QUOTA_HEADROOM_MULTIPLIER = 1.5;

let persistenceRequested = false;

function requestPersistentStorageOnce(): void {
  if (persistenceRequested) return;
  persistenceRequested = true;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function') {
      void navigator.storage.persist().catch(() => {
        /* Ignore denied or unsupported persistent-storage requests. */
      });
    }
  } catch {
    /* Ignore environments where navigator.storage access throws. */
  }
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; code?: number };
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22;
}

function mapTransactionError(error: unknown, fallbackMessage: string): DraftStorageError {
  if (error instanceof DraftStorageError) return error;
  if (isQuotaError(error)) {
    return new DraftStorageError(
      'QUOTA_EXCEEDED',
      'Device storage is full. Remove synced or unnecessary drafts and try again.',
      undefined,
      error,
    );
  }
  return new DraftStorageError('TRANSACTION_FAILED', fallbackMessage, undefined, error);
}

function normalizeSyncStatus(status: unknown): DraftSyncStatus {
  if (status === 'uploading' || status === 'completed' || status === 'failed' || status === 'pending') {
    return status;
  }
  return 'pending';
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function resolveIsoTimestamp(recordedAt: unknown, date: unknown, fallbackMs: number): string {
  const fromRecorded = parseTimestamp(recordedAt);
  if (fromRecorded !== null) return new Date(fromRecorded).toISOString();
  const fromDate = parseTimestamp(date);
  if (fromDate !== null) return new Date(fromDate).toISOString();
  return new Date(fallbackMs).toISOString();
}

function getBinaryByteLength(buffer: unknown, legacyBlob: unknown): number | undefined {
  if (buffer instanceof ArrayBuffer) return buffer.byteLength;
  if (ArrayBuffer.isView(buffer)) return buffer.byteLength;
  if (typeof Blob !== 'undefined' && legacyBlob instanceof Blob) return legacyBlob.size;
  return undefined;
}

function hasStoredAudio(record: StoredDraftRecord): boolean {
  const byteLength = getBinaryByteLength(record.audioBuffer, record.audio);
  return byteLength !== undefined && byteLength > 0;
}

function reconstructBlob(buffer: unknown, legacyBlob: unknown, mimeType: string): Blob | undefined {
  const safeType = mimeType || 'application/octet-stream';
  if (buffer instanceof ArrayBuffer) {
    return new Blob([buffer], { type: safeType });
  }
  if (ArrayBuffer.isView(buffer)) {
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    return new Blob([copy], { type: safeType });
  }
  if (typeof Blob !== 'undefined' && legacyBlob instanceof Blob) {
    return legacyBlob;
  }
  return undefined;
}

function migrateV1Record(raw: Record<string, unknown>): StoredDraftRecord {
  const now = Date.now();
  const createdAt = parseTimestamp(raw.createdAt) ?? parseTimestamp(raw.recordedAt) ?? parseTimestamp(raw.date) ?? now;
  const updatedAt = parseTimestamp(raw.updatedAt) ?? createdAt;
  const recordedAt = resolveIsoTimestamp(raw.recordedAt, raw.date, createdAt);
  const date = typeof raw.date === 'string' && raw.date ? raw.date : recordedAt;
  const retryCount =
    typeof raw.retryCount === 'number' && Number.isFinite(raw.retryCount) && raw.retryCount >= 0
      ? Math.floor(raw.retryCount)
      : 0;

  const legacyAudio = typeof Blob !== 'undefined' && raw.audio instanceof Blob ? raw.audio : undefined;
  const audioBuffer = raw.audioBuffer instanceof ArrayBuffer ? raw.audioBuffer : undefined;
  const audioMimeType =
    (typeof raw.audioMimeType === 'string' && raw.audioMimeType) ||
    (typeof raw.audioType === 'string' && raw.audioType) ||
    (legacyAudio?.type || undefined);
  const audioSizeBytes =
    typeof raw.audioSizeBytes === 'number'
      ? raw.audioSizeBytes
      : audioBuffer
        ? audioBuffer.byteLength
        : legacyAudio
          ? legacyAudio.size
          : undefined;
  const duration = typeof raw.duration === 'number' && Number.isFinite(raw.duration) ? raw.duration : 0;
  const durationMs =
    typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) ? raw.durationMs : duration;

  return {
    ...(raw as unknown as StoredDraftRecord),
    id: String(raw.id),
    date,
    duration,
    durationMs,
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as StoredAttachment[]) : [],
    syncStatus: normalizeSyncStatus(raw.syncStatus),
    recordedAt,
    createdAt,
    updatedAt,
    retryCount,
    ...(audioMimeType ? { audioMimeType, audioType: audioMimeType } : {}),
    ...(audioSizeBytes !== undefined ? { audioSizeBytes } : {}),
  };
}

function hydrateRecord(record: StoredDraftRecord): HydratedTechnicianDraft {
  const createdAt =
    parseTimestamp(record.createdAt) ?? parseTimestamp(record.recordedAt) ?? parseTimestamp(record.date) ?? Date.now();
  const updatedAt = parseTimestamp(record.updatedAt) ?? createdAt;
  const recordedAt = resolveIsoTimestamp(record.recordedAt, record.date, createdAt);
  const audioMime =
    record.audioMimeType ||
    record.audioType ||
    (typeof Blob !== 'undefined' && record.audio instanceof Blob ? record.audio.type : '') ||
    '';

  const audio = reconstructBlob(record.audioBuffer, record.audio, audioMime);
  const attachments: DraftAttachment[] = (record.attachments ?? []).map((att) => {
    const type = att.type || (typeof Blob !== 'undefined' && att.blob instanceof Blob ? att.blob.type : '') || 'application/octet-stream';
    const blob = reconstructBlob(att.buffer, att.blob, type) ?? new Blob([], { type });
    return {
      name: att.name,
      type,
      size: typeof att.size === 'number' ? att.size : blob.size,
      blob,
    };
  });

  const duration = typeof record.duration === 'number' && Number.isFinite(record.duration) ? record.duration : 0;
  const durationMs =
    typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) ? record.durationMs : duration;
  const resolvedAudioMime = audio ? audioMime || audio.type || 'application/octet-stream' : record.audioMimeType ?? record.audioType;
  const resolvedAudioSize = audio ? (record.audioSizeBytes ?? audio.size) : record.audioSizeBytes;

  return {
    id: record.id,
    date: record.date || recordedAt,
    observation: record.observation ?? '',
    equipment: record.equipment ?? '',
    subsystem: record.subsystem ?? '',
    symptom: record.symptom ?? '',
    cause: record.cause ?? '',
    action: record.action ?? '',
    parts: record.parts ?? '',
    safety: record.safety ?? '',
    mode: record.mode ?? 'Text',
    duration,
    ...(audio ? { audio } : {}),
    ...(resolvedAudioMime ? { audioType: resolvedAudioMime, audioMimeType: resolvedAudioMime } : {}),
    ...(resolvedAudioSize !== undefined ? { audioSizeBytes: resolvedAudioSize } : {}),
    durationMs,
    attachments,
    syncStatus: normalizeSyncStatus(record.syncStatus),
    ...(record.userId !== undefined ? { userId: record.userId } : {}),
    recordedAt,
    createdAt,
    updatedAt,
    retryCount: typeof record.retryCount === 'number' && record.retryCount >= 0 ? record.retryCount : 0,
    ...(record.lastAttemptAt !== undefined ? { lastAttemptAt: record.lastAttemptAt } : {}),
    ...(record.lastError !== undefined ? { lastError: record.lastError } : {}),
    ...(record.serverRecordingId !== undefined ? { serverRecordingId: record.serverRecordingId } : {}),
  };
}

function toDraftSummary(record: StoredDraftRecord): DraftSummary {
  const createdAt =
    parseTimestamp(record.createdAt) ?? parseTimestamp(record.recordedAt) ?? parseTimestamp(record.date) ?? Date.now();
  const updatedAt = parseTimestamp(record.updatedAt) ?? createdAt;
  const recordedAt = resolveIsoTimestamp(record.recordedAt, record.date, createdAt);
  const duration = typeof record.duration === 'number' && Number.isFinite(record.duration) ? record.duration : 0;
  const durationMs =
    typeof record.durationMs === 'number' && Number.isFinite(record.durationMs) ? record.durationMs : duration;

  const detectedAudioBytes = getBinaryByteLength(record.audioBuffer, record.audio);
  const hasAudio = detectedAudioBytes !== undefined;
  const audioSizeBytes = record.audioSizeBytes ?? detectedAudioBytes;
  const audioMimeType =
    record.audioMimeType ??
    record.audioType ??
    (typeof Blob !== 'undefined' && record.audio instanceof Blob ? record.audio.type || undefined : undefined);

  return {
    id: record.id,
    date: record.date || recordedAt,
    observation: record.observation ?? '',
    equipment: record.equipment ?? '',
    subsystem: record.subsystem ?? '',
    symptom: record.symptom ?? '',
    cause: record.cause ?? '',
    action: record.action ?? '',
    parts: record.parts ?? '',
    safety: record.safety ?? '',
    mode: record.mode ?? 'Text',
    duration,
    ...(audioMimeType ? { audioType: audioMimeType, audioMimeType } : {}),
    ...(audioSizeBytes !== undefined ? { audioSizeBytes } : {}),
    durationMs,
    attachments: (record.attachments ?? []).map((att) => ({
      name: att.name,
      type: att.type,
      size: typeof att.size === 'number' ? att.size : att.buffer?.byteLength ?? att.blob?.size ?? 0,
    })),
    syncStatus: normalizeSyncStatus(record.syncStatus),
    ...(record.userId !== undefined ? { userId: record.userId } : {}),
    recordedAt,
    createdAt,
    updatedAt,
    retryCount: typeof record.retryCount === 'number' && record.retryCount >= 0 ? record.retryCount : 0,
    ...(record.lastAttemptAt !== undefined ? { lastAttemptAt: record.lastAttemptAt } : {}),
    ...(record.lastError !== undefined ? { lastError: record.lastError } : {}),
    ...(record.serverRecordingId !== undefined ? { serverRecordingId: record.serverRecordingId } : {}),
    hasAudio,
  };
}

function sortNewestFirst<T extends { createdAt: number; date: string }>(items: T[]): T[] {
  return items.sort((a, b) => b.createdAt - a.createdAt || b.date.localeCompare(a.date));
}

function openDatabase(): Promise<IDBDatabase> {
  requestPersistentStorageOnce();
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new DraftStorageError(
        'IDB_UNAVAILABLE',
        'Local device storage (IndexedDB) is unavailable in this browser.',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(
        new DraftStorageError(
          'IDB_UNAVAILABLE',
          'Local device storage could not be opened. Check browser storage permissions.',
          undefined,
          error,
        ),
      );
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) return;

      const store = db.objectStoreNames.contains(STORE)
        ? tx.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: 'id' });

      if (!store.indexNames.contains(IDX_SYNC_STATUS_CREATED)) {
        store.createIndex(IDX_SYNC_STATUS_CREATED, ['syncStatus', 'createdAt'], { unique: false });
      }
      if (!store.indexNames.contains(IDX_USER_SYNC_CREATED)) {
        store.createIndex(IDX_USER_SYNC_CREATED, ['userId', 'syncStatus', 'createdAt'], { unique: false });
      }

      if (event.oldVersion > 0 && event.oldVersion < 2) {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const raw = cursor.value as Record<string, unknown>;
          cursor.update(migrateV1Record(raw));
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      const err = request.error;
      if (isQuotaError(err)) {
        reject(
          new DraftStorageError(
            'QUOTA_EXCEEDED',
            'Device storage is full. Remove older drafts and try again.',
            undefined,
            err,
          ),
        );
        return;
      }
      reject(
        new DraftStorageError(
          'IDB_UNAVAILABLE',
          'Local device storage could not be initialized in this browser.',
          err?.message,
          err,
        ),
      );
    };

    request.onblocked = () => {
      reject(
        new DraftStorageError(
          'IDB_UNAVAILABLE',
          'Local storage upgrade is blocked by another open tab. Close other tabs of this app and retry.',
        ),
      );
    };
  });
}

async function ensureQuotaHeadroom(totalBinaryBytes: number): Promise<void> {
  if (totalBinaryBytes <= 0) return;
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.estimate !== 'function') return;
    const estimate = await navigator.storage.estimate();
    if (
      typeof estimate.quota === 'number' &&
      estimate.quota > 0 &&
      typeof estimate.usage === 'number' &&
      estimate.usage >= 0
    ) {
      const remaining = Math.max(0, estimate.quota - estimate.usage);
      if (remaining < totalBinaryBytes * QUOTA_HEADROOM_MULTIPLIER) {
        throw new DraftStorageError(
          'QUOTA_EXCEEDED',
          'Not enough free storage on this device to save this draft. Remove completed or unwanted drafts and try again.',
        );
      }
    }
  } catch (error) {
    if (error instanceof DraftStorageError) throw error;
    /* Ignore navigator.storage.estimate failures in restricted browser contexts. */
  }
}

export async function getStorageQuotaStatus(): Promise<StorageQuotaStatus> {
  let usageBytes = 0;
  let quotaBytes = 0;
  let isPersisted = false;

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      usageBytes = typeof estimate.usage === 'number' && estimate.usage >= 0 ? estimate.usage : 0;
      quotaBytes = typeof estimate.quota === 'number' && estimate.quota >= 0 ? estimate.quota : 0;
    }
  } catch {
    /* Ignore unsupported storage estimate environments. */
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.persisted === 'function') {
      isPersisted = Boolean(await navigator.storage.persisted());
    }
  } catch {
    /* Ignore unsupported storage persisted environments. */
  }

  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 10_000) / 100) : 0;

  return { usageBytes, quotaBytes, percentUsed, isPersisted };
}

export async function getDrafts(userId?: string): Promise<HydratedTechnicianDraft[]> {
  const db = await openDatabase();
  try {
    return await new Promise<HydratedTechnicianDraft[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      let rows: StoredDraftRecord[] = [];

      request.onsuccess = () => {
        rows = (request.result as StoredDraftRecord[]) ?? [];
      };
      request.onerror = () => {
        reject(mapTransactionError(request.error, 'Could not read saved drafts from local storage.'));
      };
      tx.oncomplete = () => {
        const filtered = userId !== undefined ? rows.filter((r) => r.userId === userId) : rows;
        resolve(sortNewestFirst(filtered.map(hydrateRecord)));
      };
      tx.onerror = () => {
        reject(mapTransactionError(tx.error, 'Could not read saved drafts from local storage.'));
      };
      tx.onabort = () => {
        reject(mapTransactionError(tx.error, 'Reading saved drafts was aborted.'));
      };
    });
  } finally {
    db.close();
  }
}

export async function getDraftById(id: string): Promise<HydratedTechnicianDraft | null> {
  if (!id) return null;
  const db = await openDatabase();
  try {
    return await new Promise<HydratedTechnicianDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      let record: StoredDraftRecord | undefined;

      request.onsuccess = () => {
        record = request.result as StoredDraftRecord | undefined;
      };
      request.onerror = () => {
        reject(mapTransactionError(request.error, 'Could not load the draft from local storage.'));
      };
      tx.oncomplete = () => {
        resolve(record ? hydrateRecord(record) : null);
      };
      tx.onerror = () => {
        reject(mapTransactionError(tx.error, 'Could not load the draft from local storage.'));
      };
      tx.onabort = () => {
        reject(mapTransactionError(tx.error, 'Loading the draft was aborted.'));
      };
    });
  } finally {
    db.close();
  }
}

export async function listDraftSummaries(userId?: string): Promise<DraftSummary[]> {
  const db = await openDatabase();
  try {
    return await new Promise<DraftSummary[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const cursorReq = store.openCursor();
      const summaries: DraftSummary[] = [];

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const record = cursor.value as StoredDraftRecord;
        if (userId === undefined || record.userId === userId) {
          summaries.push(toDraftSummary(record));
        }
        cursor.continue();
      };
      cursorReq.onerror = () => {
        reject(mapTransactionError(cursorReq.error, 'Could not list saved drafts from local storage.'));
      };
      tx.oncomplete = () => {
        resolve(sortNewestFirst(summaries));
      };
      tx.onerror = () => {
        reject(mapTransactionError(tx.error, 'Could not list saved drafts from local storage.'));
      };
      tx.onabort = () => {
        reject(mapTransactionError(tx.error, 'Listing saved drafts was aborted.'));
      };
    });
  } finally {
    db.close();
  }
}

export async function saveDraft(draft: SaveDraftInput): Promise<void> {
  // 1. Validate audio input and convert all Blobs to ArrayBuffers BEFORE opening IDB transaction.
  let audioBuffer: ArrayBuffer | undefined;
  let audioMimeType: string | undefined;
  let audioSizeBytes: number | undefined;

  if (draft.audio !== undefined) {
    if (typeof Blob === 'undefined' || !(draft.audio instanceof Blob)) {
      throw new DraftStorageError(
        'INVALID_AUDIO',
        'The recorded audio format is invalid and could not be saved.',
      );
    }
    if (draft.audio.size <= 0) {
      throw new DraftStorageError(
        'INVALID_AUDIO',
        'The recorded audio is empty (0 bytes) and cannot be saved.',
      );
    }
    try {
      audioBuffer = await draft.audio.arrayBuffer();
    } catch (error) {
      throw new DraftStorageError(
        'INVALID_AUDIO',
        'The recorded audio could not be read for offline storage.',
        undefined,
        error,
      );
    }
    if (audioBuffer.byteLength <= 0) {
      throw new DraftStorageError(
        'INVALID_AUDIO',
        'The recorded audio is empty (0 bytes) and cannot be saved.',
      );
    }
    audioMimeType = draft.audioMimeType || draft.audioType || draft.audio.type || 'application/octet-stream';
    audioSizeBytes = audioBuffer.byteLength;
  } else {
    audioMimeType = draft.audioMimeType || draft.audioType;
    audioSizeBytes = draft.audioSizeBytes;
  }

  const storedAttachments: StoredAttachment[] = await Promise.all(
    (draft.attachments ?? []).map(async (att) => {
      const buffer = await att.blob.arrayBuffer();
      const type = att.type || att.blob.type || 'application/octet-stream';
      return {
        name: att.name,
        type,
        size: att.size ?? buffer.byteLength,
        buffer,
      };
    }),
  );

  // 2. Check storage quota headroom BEFORE opening the readwrite transaction.
  const totalBinaryBytes =
    (audioBuffer?.byteLength ?? 0) +
    storedAttachments.reduce((sum, att) => sum + (att.buffer?.byteLength ?? 0), 0);
  await ensureQuotaHeadroom(totalBinaryBytes);

  // 3. Prepare pure structured-cloneable record (no raw Blob references).
  const now = Date.now();
  const id = draft.id && draft.id.trim() ? draft.id : crypto.randomUUID();
  const createdAt =
    parseTimestamp(draft.createdAt) ?? parseTimestamp(draft.recordedAt) ?? parseTimestamp(draft.date) ?? now;
  const recordedAt = resolveIsoTimestamp(draft.recordedAt, draft.date, createdAt);
  const date = draft.date || recordedAt;
  const duration = typeof draft.duration === 'number' && Number.isFinite(draft.duration) ? draft.duration : 0;
  const durationMs =
    typeof draft.durationMs === 'number' && Number.isFinite(draft.durationMs) ? draft.durationMs : duration;

  const record: StoredDraftRecord = {
    id,
    date,
    observation: draft.observation ?? '',
    equipment: draft.equipment ?? '',
    subsystem: draft.subsystem ?? '',
    symptom: draft.symptom ?? '',
    cause: draft.cause ?? '',
    action: draft.action ?? '',
    parts: draft.parts ?? '',
    safety: draft.safety ?? '',
    mode: draft.mode ?? 'Text',
    duration,
    ...(audioBuffer ? { audioBuffer } : {}),
    ...(audioMimeType ? { audioType: audioMimeType, audioMimeType } : {}),
    ...(audioSizeBytes !== undefined ? { audioSizeBytes } : {}),
    durationMs,
    attachments: storedAttachments,
    syncStatus: normalizeSyncStatus(draft.syncStatus),
    ...(draft.userId !== undefined ? { userId: draft.userId } : {}),
    recordedAt,
    createdAt,
    updatedAt: now,
    retryCount:
      typeof draft.retryCount === 'number' && Number.isFinite(draft.retryCount) && draft.retryCount >= 0
        ? Math.floor(draft.retryCount)
        : 0,
    ...(draft.lastAttemptAt !== undefined ? { lastAttemptAt: draft.lastAttemptAt } : {}),
    ...(draft.lastError !== undefined ? { lastError: draft.lastError } : {}),
    ...(draft.serverRecordingId !== undefined ? { serverRecordingId: draft.serverRecordingId } : {}),
  };

  // 4. Open readwrite transaction with zero awaits inside.
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).put(record);
      request.onerror = () => {
        reject(mapTransactionError(request.error, 'Could not save draft to local storage.'));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        reject(mapTransactionError(tx.error, 'Could not save draft to local storage.'));
      };
      tx.onabort = () => {
        reject(mapTransactionError(tx.error, 'Saving draft to local storage was aborted.'));
      };
    });
  } finally {
    db.close();
  }
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).delete(id);
      request.onerror = () => {
        reject(mapTransactionError(request.error, 'Could not delete draft from local storage.'));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        reject(mapTransactionError(tx.error, 'Could not delete draft from local storage.'));
      };
      tx.onabort = () => {
        reject(mapTransactionError(tx.error, 'Deleting draft from local storage was aborted.'));
      };
    });
  } finally {
    db.close();
  }
}

export async function claimNextPendingDraft(options?: {
  userId?: string;
  leaseDurationMs?: number;
  requireAudio?: boolean;
}): Promise<HydratedTechnicianDraft | null> {
  const leaseDurationMs = options?.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const userId = options?.userId;
  const requireAudio = options?.requireAudio ?? false;
  const db = await openDatabase();

  try {
    return await new Promise<HydratedTechnicianDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const now = Date.now();
      const staleBefore = now - leaseDurationMs;

      const index = store.index(userId !== undefined ? IDX_USER_SYNC_CREATED : IDX_SYNC_STATUS_CREATED);
      const uploadingRange =
        userId !== undefined
          ? IDBKeyRange.bound([userId, 'uploading', 0], [userId, 'uploading', Number.MAX_SAFE_INTEGER])
          : IDBKeyRange.bound(['uploading', 0], ['uploading', Number.MAX_SAFE_INTEGER]);
      const pendingRange =
        userId !== undefined
          ? IDBKeyRange.bound([userId, 'pending', 0], [userId, 'pending', Number.MAX_SAFE_INTEGER])
          : IDBKeyRange.bound(['pending', 0], ['pending', Number.MAX_SAFE_INTEGER]);

      let claimedRecord: StoredDraftRecord | null = null;

      const claimCursor = (cursor: IDBCursorWithValue) => {
        const current = cursor.value as StoredDraftRecord;
        const updated: StoredDraftRecord = {
          ...current,
          syncStatus: 'uploading',
          lastAttemptAt: now,
          updatedAt: now,
          retryCount:
            typeof current.retryCount === 'number' && Number.isFinite(current.retryCount) && current.retryCount >= 0
              ? current.retryCount + 1
              : 1,
        };
        const updateReq = cursor.update(updated);
        updateReq.onsuccess = () => {
          claimedRecord = updated;
        };
        updateReq.onerror = () => {
          reject(mapTransactionError(updateReq.error, 'Could not claim draft for synchronization.'));
        };
      };

      const scanPending = () => {
        const pendingReq = index.openCursor(pendingRange, 'next');
        pendingReq.onsuccess = () => {
          const cursor = pendingReq.result;
          if (!cursor) return;
          const record = cursor.value as StoredDraftRecord;
          if (requireAudio && !hasStoredAudio(record)) {
            cursor.continue();
            return;
          }
          claimCursor(cursor);
        };
        pendingReq.onerror = () => {
          reject(mapTransactionError(pendingReq.error, 'Could not scan pending drafts for synchronization.'));
        };
      };

      const uploadingReq = index.openCursor(uploadingRange, 'next');
      uploadingReq.onsuccess = () => {
        const cursor = uploadingReq.result;
        if (!cursor) {
          scanPending();
          return;
        }
        const record = cursor.value as StoredDraftRecord;
        const isStale = record.lastAttemptAt === undefined || record.lastAttemptAt < staleBefore;
        if (isStale && (!requireAudio || hasStoredAudio(record))) {
          claimCursor(cursor);
          return;
        }
        cursor.continue();
      };
      uploadingReq.onerror = () => {
        reject(mapTransactionError(uploadingReq.error, 'Could not inspect uploading drafts.'));
      };

      tx.oncomplete = () => {
        resolve(claimedRecord ? hydrateRecord(claimedRecord) : null);
      };
      tx.onerror = () => {
        reject(mapTransactionError(tx.error, 'Claiming next pending draft failed.'));
      };
      tx.onabort = () => {
        reject(mapTransactionError(tx.error, 'Claiming next pending draft was aborted.'));
      };
    });
  } finally {
    db.close();
  }
}

async function updateDraftRecord(
  id: string,
  updater: (record: StoredDraftRecord, now: number) => StoredDraftRecord,
  errorFallback: string,
): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      let notFound = false;

      getReq.onsuccess = () => {
        const existing = getReq.result as StoredDraftRecord | undefined;
        if (!existing) {
          notFound = true;
          reject(
            new DraftStorageError(
              'NOT_FOUND',
              `Draft "${id}" was not found in local storage.`,
            ),
          );
          return;
        }
        const nextRecord = updater(existing, Date.now());
        const putReq = store.put(nextRecord);
        putReq.onerror = () => {
          reject(mapTransactionError(putReq.error, errorFallback));
        };
      };
      getReq.onerror = () => {
        reject(mapTransactionError(getReq.error, errorFallback));
      };
      tx.oncomplete = () => {
        if (!notFound) resolve();
      };
      tx.onerror = () => {
        if (!notFound) reject(mapTransactionError(tx.error, errorFallback));
      };
      tx.onabort = () => {
        if (!notFound) reject(mapTransactionError(tx.error, errorFallback));
      };
    });
  } finally {
    db.close();
  }
}

export async function markDraftSyncCompleted(id: string, serverRecordingId: string): Promise<void> {
  await updateDraftRecord(
    id,
    (record, now) => {
      const next: StoredDraftRecord = {
        ...record,
        syncStatus: 'completed',
        serverRecordingId,
        updatedAt: now,
      };
      delete next.lastError;
      return next;
    },
    'Could not mark draft sync as completed.',
  );
}

export async function markDraftSyncFailed(
  id: string,
  errorMessage: string,
  options?: { revertToPending?: boolean; consumeRetry?: boolean },
): Promise<void> {
  await updateDraftRecord(
    id,
    (record, now) => {
      if (options?.revertToPending) {
        const currentRetries =
          typeof record.retryCount === 'number' && Number.isFinite(record.retryCount) ? record.retryCount : 0;
        const nextRetryCount = options.consumeRetry ? currentRetries : Math.max(0, currentRetries - 1);
        return {
          ...record,
          syncStatus: 'pending',
          retryCount: nextRetryCount,
          lastError: errorMessage,
          updatedAt: now,
        };
      }
      return {
        ...record,
        syncStatus: 'failed',
        lastError: errorMessage,
        updatedAt: now,
      };
    },
    'Could not update failed draft status.',
  );
}

export async function retryFailedDraft(id: string): Promise<void> {
  await updateDraftRecord(
    id,
    (record, now) => {
      if (record.syncStatus !== 'failed') return record;
      const next: StoredDraftRecord = {
        ...record,
        syncStatus: 'pending',
        retryCount: 0,
        updatedAt: now,
      };
      delete next.lastError;
      delete next.lastAttemptAt;
      return next;
    },
    'Could not reset failed draft for retry.',
  );
}
